import { Router } from 'express';
import { getDb } from '../db';
import { asyncRoute, rateLimit } from '../lib/http';
import { verifyDownloadToken } from '../lib/tokens';
import { renderOrderPdf } from '../services/fulfillment';

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

    const order = await (await getDb()).getOrder(claims.orderId);
    if (!order || order.email !== claims.email) {
      res.status(404).type('text/plain').send('Order not found.');
      return;
    }

    if (order.status !== 'fulfilled' && order.status !== 'paid') {
      res.status(409).type('text/plain').send('This order is not ready for download yet.');
      return;
    }

    const pdf = await renderOrderPdf(order);

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
