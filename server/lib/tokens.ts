import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export interface DownloadClaims {
  kind: 'download';
  orderId: string;
  email: string;
  /**
   * The Stripe Checkout Session behind this purchase, when there was one.
   *
   * Carried so a download can be honoured by an instance that has no record of
   * the order: it re-verifies the payment against Stripe rather than trusting
   * the link. Without it, a deployment running on the in-memory store would
   * serve the download only from whichever instance happened to fulfil it.
   */
  sessionId?: string;
}

export interface SessionClaims {
  kind: 'session';
  userId: string;
  email: string;
}

export interface MagicLinkClaims {
  kind: 'magic';
  email: string;
}

export interface AdminClaims {
  kind: 'admin';
}

type Claims = DownloadClaims | SessionClaims | MagicLinkClaims | AdminClaims;

export function sign(claims: Claims, expiresIn: string | number): string {
  return jwt.sign(claims, env.appSecret, { expiresIn } as jwt.SignOptions);
}

function verify<T extends Claims>(token: string, kind: T['kind']): T | null {
  try {
    const decoded = jwt.verify(token, env.appSecret) as Claims;
    return decoded.kind === kind ? (decoded as T) : null;
  } catch {
    return null;
  }
}

export function signDownloadToken(
  orderId: string,
  email: string,
  sessionId?: string | null,
): string {
  return sign(
    { kind: 'download', orderId, email, ...(sessionId ? { sessionId } : {}) },
    `${env.downloadTtlHours}h`,
  );
}

export function verifyDownloadToken(token: string): DownloadClaims | null {
  return verify<DownloadClaims>(token, 'download');
}

export function signSessionToken(userId: string, email: string): string {
  return sign({ kind: 'session', userId, email }, '30d');
}

export function verifySessionToken(token: string): SessionClaims | null {
  return verify<SessionClaims>(token, 'session');
}

export function signMagicLinkToken(email: string): string {
  return sign({ kind: 'magic', email }, '20m');
}

export function verifyMagicLinkToken(token: string): MagicLinkClaims | null {
  return verify<MagicLinkClaims>(token, 'magic');
}

/**
 * Admin sessions are short by design. The dashboard is read-only, so the cost
 * of re-entering the password is small next to leaving a live sales dashboard
 * open on a borrowed laptop.
 */
export function signAdminToken(): string {
  return sign({ kind: 'admin' }, '12h');
}

export function verifyAdminToken(token: string): AdminClaims | null {
  return verify<AdminClaims>(token, 'admin');
}

export const SESSION_COOKIE = 'kdd_session';
export const ADMIN_COOKIE = 'kdd_admin';
