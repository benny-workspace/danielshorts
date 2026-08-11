import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { capabilities, env } from '../env.js';
import { asyncRoute, rateLimit, readCookie } from '../lib/http.js';
import {
  ADMIN_COOKIE,
  signAdminToken,
  verifyAdminToken,
} from '../lib/tokens.js';
import { buildDashboard } from '../services/analytics.js';
import { syncCatalog } from '../services/catalog.js';

export const adminRouter = Router();

/**
 * Bearer check against APP_SECRET, for scripted calls.
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
 * Constant-time password comparison.
 *
 * Both sides are hashed first so the buffers are always the same length: that
 * removes the length check that would otherwise leak how many characters the
 * real password has, and lets one comparison cover every input.
 */
function passwordMatches(presented: string): boolean {
  if (!env.adminPassword) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(env.adminPassword).digest();
  return timingSafeEqual(a, b);
}

function adminCookie(token: string, maxAgeSeconds: number): string {
  const secure = env.nodeEnv === 'production' ? '; Secure' : '';
  // HttpOnly keeps the dashboard session out of reach of any script on the
  // page; SameSite=Strict means another site cannot cause an authenticated
  // request to it at all.
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

/** True when the request carries a valid admin session cookie or bearer token. */
function isAdmin(req: Request): boolean {
  if (authorized(req.headers.authorization)) return true;
  const token = readCookie(req, ADMIN_COOKIE);
  return Boolean(token && verifyAdminToken(token));
}

/* ------------------------------------------------------------------ auth */

/**
 * Exchanges the password for a signed, http-only session cookie.
 *
 * Rate limited hard: five attempts a minute makes an online guessing attack
 * impractical without inconveniencing the one person who is meant to get in.
 */
adminRouter.post(
  '/login',
  rateLimit({ windowMs: 60_000, max: 5, key: 'admin-login' }),
  asyncRoute(async (req, res) => {
    if (!capabilities.adminDashboard) {
      res.status(503).json({
        error: env.adminPassword
          ? 'APP_SECRET is not set, so an admin session cannot be signed securely.'
          : 'APP_SECRET_PW is not set on this deployment.',
        code: 'admin_unconfigured',
      });
      return;
    }

    const password = String((req.body as { password?: unknown })?.password ?? '');
    if (!password || !passwordMatches(password)) {
      // Deliberately identical for a wrong password and an empty one — there is
      // nothing useful to tell an attacker apart from "no".
      res.status(401).json({ error: 'Incorrect password.', code: 'invalid_password' });
      return;
    }

    res.setHeader('Set-Cookie', adminCookie(signAdminToken(), 60 * 60 * 12));
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/logout',
  asyncRoute(async (_req, res) => {
    res.setHeader('Set-Cookie', adminCookie('', 0));
    res.json({ ok: true });
  }),
);

/** Lets the dashboard decide whether to render the password gate on load. */
adminRouter.get(
  '/session',
  asyncRoute(async (req, res) => {
    res.json({
      authenticated: isAdmin(req),
      configured: capabilities.adminDashboard,
      reason: capabilities.adminDashboard
        ? null
        : env.adminPassword
          ? 'APP_SECRET is missing.'
          : 'APP_SECRET_PW is missing.',
    });
  }),
);

/* ------------------------------------------------------------------ data */

adminRouter.get(
  '/stats',
  rateLimit({ windowMs: 60_000, max: 60, key: 'admin-stats' }),
  asyncRoute(async (req, res) => {
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'Sign in first.', code: 'unauthorized' });
      return;
    }

    const days = Number(req.query.days ?? 30);
    res.json(await buildDashboard(days));
  }),
);

/* ----------------------------------------------------------- maintenance */

/**
 * Creates the Stripe Products and Prices for every tier, so the catalogue
 * exists before the first sale rather than being created lazily by it.
 * Idempotent: re-running reuses whatever is already there.
 */
adminRouter.post(
  '/stripe/sync',
  rateLimit({ windowMs: 60_000, max: 6, key: 'admin' }),
  asyncRoute(async (req, res) => {
    if (!isAdmin(req)) {
      res.status(401).json({
        error: 'Sign in at /admin, or send Authorization: Bearer <APP_SECRET>.',
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
