import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { capabilities, env } from '../env.js';
import { asyncRoute, rateLimit } from '../lib/http.js';
import { syncCatalog } from '../services/catalog.js';

export const adminRouter = Router();

/**
 * Bearer check against APP_SECRET.
 *
 * Refuses outright while APP_SECRET is still the built-in development value:
 * that string is published in this repository, so accepting it would leave the
 * endpoint open to anyone who read the source.
 */
function authorized(header: string | undefined): boolean {
  if (!capabilities.secretConfigured) return false;

  const presented = Buffer.from((header ?? '').replace(/^Bearer\s+/i, '').trim());
  const expected = Buffer.from(env.appSecret);

  // Length is compared first because timingSafeEqual throws on a mismatch. The
  // length of a secret is not the part worth hiding.
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/**
 * Creates the Stripe Products and Prices for every tier, so the catalogue
 * exists before the first sale rather than being created lazily by it.
 * Idempotent: re-running reuses whatever is already there.
 */
adminRouter.post(
  '/stripe/sync',
  rateLimit({ windowMs: 60_000, max: 6, key: 'admin' }),
  asyncRoute(async (req, res) => {
    if (!authorized(req.headers.authorization)) {
      res.status(401).json({
        error: 'Send Authorization: Bearer <APP_SECRET>.',
        code: 'unauthorized',
      });
      return;
    }

    if (!capabilities.stripe) {
      res.status(503).json({
        error: 'STRIPE_SECRET_KEY is not configured.',
        code: 'stripe_unconfigured',
      });
      return;
    }

    const catalog = await syncCatalog();

    res.json({
      ok: true,
      livemode: !env.stripeSecretKey.startsWith('sk_test_'),
      catalog: catalog.map((entry) => ({
        tier: entry.tier,
        productId: entry.productId,
        priceId: entry.priceId,
        amount: entry.amount,
        currency: entry.currency,
        created: entry.createdProduct || entry.createdPrice,
      })),
    });
  }),
);
