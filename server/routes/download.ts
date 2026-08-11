import { Router } from 'express';
import { getDb } from '../db/index.js';
import { log, resolveAppUrl } from '../env.js';
import { asyncRoute, rateLimit } from '../lib/http.js';
import { verifyDownloadToken } from '../lib/tokens.js';
import { idsForOrder, track } from '../services/analytics.js';
import { renderOrderPdf } from '../services/fulfillment.js';
import { recoverOrderFromSession } from '../services/orders.js';

export const downloadRouter = Router();

/**
 * Signed, time-limited download. The token carries the order id and expiry, so
 * links cannot be edited to reach someone else's purchase and stop working on
 * their own after DOWNLOAD_TTL_HOURS.
 *
 * The PDF is re-rendered from the blueprint stored on the order rather than
 * read off disk, which keeps downloads working on platforms where the
 * filesystem does not persist between requests.
 */
downloadRouter.get(
  '/:token',
  rateLimit({ windowMs: 60_000, max: 30, key: 'download' }),
  asyncRoute(async (req, res) => {
    const claims = verifyDownloadToken(String(req.params.token ?? ''));
    if (!claims) {
      res.status(410).type('text/plain').send(
        'This download link has expired or is invalid. Reply to your receipt email and we will send a fresh one.',
      );
      return;
    }

    let order = await (await getDb()).getOrder(claims.orderId);

    // The download is a separate request from the one that fulfilled the order,
    // so on the in-memory store it routinely lands on an instance that knows
    // nothing about it. Re-verify the purchase against Stripe instead of
    // turning a paying customer away.
    if (!order && claims.sessionId) {
      try {
        order = await recoverOrderFromSession(claims.sessionId, resolveAppUrl(req));
      } catch (error) {
        log('download recovery failed:', (error as Error).message);
      }
    }

    if (!order || order.email !== claims.email) {
      res.status(404).type('text/plain').send('Order not found.');
      return;
    }

    if (order.status !== 'fulfilled' && order.status !== 'paid') {
      res.status(409).type('text/plain').send('This order is not ready for download yet.');
      return;
    }

    const pdf = await renderOrderPdf(order);

    // The click is tracked in the browser and the delivery is tracked here.
    // Both are worth having: the difference between them is a customer who
    // pressed download and got nothing.
    await track({
      name: 'download_served',
      ...idsForOrder(order.id),
      tier: order.productTier,
      archetype: order.winningArchetype,
    });

    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `attachment; filename="kdrama-romantic-blueprint-${order.id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      })
      .send(pdf);
  }),
);
