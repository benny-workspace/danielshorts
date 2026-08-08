import { Router, type Request } from 'express';
import { getDb } from '../db/index.js';
import { capabilities, env, resolveAppUrl } from '../env.js';
import { asyncRoute, parseEmail, rateLimit } from '../lib/http.js';
import { sendMagicLinkEmail } from '../services/email.js';
import {
  SESSION_COOKIE,
  signMagicLinkToken,
  signSessionToken,
  verifyMagicLinkToken,
  verifySessionToken,
} from '../lib/tokens.js';

export const authRouter = Router();

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function currentUser(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const claims = verifySessionToken(token);
  if (!claims) return null;
  return (await getDb()).getUserById(claims.userId);
}

function sessionCookie(token: string): string {
  const secure = env.nodeEnv === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

/**
 * Passwordless sign-in. Requests a short-lived link; the reply never reveals
 * whether the address exists, and the link itself is the only proof of
 * ownership.
 */
authRouter.post(
  '/magic-link',
  rateLimit({ windowMs: 15 * 60_000, max: 5, key: 'magic-link' }),
  asyncRoute(async (req, res) => {
    const email = parseEmail(req.body?.email);
    const token = signMagicLinkToken(email);
    const url = `${resolveAppUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`;

    const db = await getDb();
    await db.upsertUser(email);

    const result = await sendMagicLinkEmail({ to: email, url });

    res.json({
      ok: true,
      emailSent: result.sent,
      // Without an email provider the link is returned so local dev still works.
      ...(capabilities.email ? {} : { devLink: url, note: result.reason }),
    });
  }),
);

authRouter.get(
  '/verify',
  asyncRoute(async (req, res) => {
    const claims = verifyMagicLinkToken(String(req.query.token ?? ''));
    if (!claims) {
      res.redirect(302, `${resolveAppUrl(req)}/?auth=expired`);
      return;
    }

    const db = await getDb();
    const user = await db.upsertUser(claims.email);
    res.setHeader('Set-Cookie', sessionCookie(signSessionToken(user.id, user.email)));
    res.redirect(302, `${resolveAppUrl(req)}/?auth=success`);
  }),
);

authRouter.get(
  '/me',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        totalPurchases: user.totalPurchases,
        createdAt: user.createdAt,
      },
    });
  }),
);

authRouter.post('/signout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  res.json({ ok: true });
});
