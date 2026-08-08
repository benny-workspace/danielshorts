import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export interface DownloadClaims {
  kind: 'download';
  orderId: string;
  email: string;
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

type Claims = DownloadClaims | SessionClaims | MagicLinkClaims;

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

export function signDownloadToken(orderId: string, email: string): string {
  return sign({ kind: 'download', orderId, email }, `${env.downloadTtlHours}h`);
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

export const SESSION_COOKIE = 'kdd_session';
