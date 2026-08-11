import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wraps async handlers so rejections reach the Express error middleware. */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Reads one cookie off the raw header, so no cookie parser is needed. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

export function badRequest(message: string, code = 'bad_request'): never {
  throw new HttpError(400, message, code);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseEmail(value: unknown, field = 'email'): string {
  const email = String(value ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    badRequest(`A valid ${field} is required`, 'invalid_email');
  }
  return email;
}

export function optionalString(value: unknown, maxLength = 120): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter. Per-instance only, which is enough to blunt casual
 * abuse of the paid AI endpoint; put a real limiter in front for scale.
 */
export function rateLimit(options: { windowMs: number; max: number; key?: string }): RequestHandler {
  return (req, res, next) => {
    const identity =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${options.key ?? req.path}:${identity}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      res
        .status(429)
        .set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
        .json({ error: 'Too many requests. Please slow down.', code: 'rate_limited' });
      return;
    }

    // Opportunistic sweep so the map cannot grow without bound.
    if (buckets.size > 5_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }

    next();
  };
}
