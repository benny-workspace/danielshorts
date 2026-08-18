import { Router } from 'express';
import { isEventName } from '../../shared/analytics.js';
import { isProductTier } from '../../shared/products.js';
import { asyncRoute, optionalString, rateLimit } from '../lib/http.js';
import {
  deviceFromUserAgent,
  geoFromRequest,
  looksLikeBot,
  normalizeSource,
  trackAll,
  type TrackInput,
} from '../services/analytics.js';

export const analyticsRouter = Router();

/** A visitor firing more than this in a minute is a script, not a reader. */
const MAX_EVENTS_PER_MINUTE = 120;
/** Events accepted in one batch, so a long queue cannot arrive as one payload. */
const MAX_BATCH = 25;

interface IncomingEvent {
  name?: unknown;
  visitorId?: unknown;
  sessionId?: unknown;
  tier?: unknown;
  step?: unknown;
  archetype?: unknown;
  value?: unknown;
  path?: unknown;
  referrer?: unknown;
  source?: unknown;
}

/**
 * Ingest for browser-side funnel events.
 *
 * Open by design — it has to be, since it is called before anyone signs in —
 * so nothing it accepts is trusted. Names are matched against the shared
 * taxonomy, everything else is clamped, and device and traffic source are
 * derived here from the request rather than taken from the body: a client that
 * can name its own source can also flatter it.
 *
 * Always answers 204. `navigator.sendBeacon` discards the response, and a
 * visitor should never see a tracking failure.
 *
 * The write is awaited BEFORE answering, which looks like the wrong trade and
 * is not. This ran the other way round at first — answer immediately, write
 * afterwards, to keep latency off the page — and that is safe only while the
 * write finishes in the same tick, as it does against an in-process store. The
 * moment a real database was attached, every event in this route was lost:
 * serverless instances are frozen as soon as the response is flushed, so a
 * pending round trip to Postgres simply never resumes. Nothing here is on the
 * visitor's critical path anyway — the browser sends these with `keepalive` or
 * `sendBeacon` and never waits for the reply — so the latency being protected
 * was latency nobody could observe, paid for with the data itself.
 */
analyticsRouter.post(
  '/track',
  rateLimit({ windowMs: 60_000, max: MAX_EVENTS_PER_MINUTE, key: 'analytics' }),
  asyncRoute(async (req, res) => {
    const userAgent = req.get('user-agent') ?? undefined;

    if (looksLikeBot(userAgent)) {
      res.status(204).end();
      return;
    }

    const body = req.body as { events?: unknown } | IncomingEvent | undefined;
    const incoming: unknown[] = Array.isArray((body as { events?: unknown })?.events)
      ? ((body as { events: unknown[] }).events)
      : [body];

    const device = deviceFromUserAgent(userAgent);
    const host = req.get('host') ?? null;
    // Resolved once per batch: every event in it came from the same request.
    const geo = geoFromRequest(req);

    const accepted: TrackInput[] = [];

    for (const raw of incoming.slice(0, MAX_BATCH)) {
      const event = (raw ?? {}) as IncomingEvent;
      if (!isEventName(event.name)) continue;

      const visitorId = optionalString(event.visitorId, 64);
      const sessionId = optionalString(event.sessionId, 64);
      if (!visitorId || !sessionId) continue;

      const step = Number(event.step);
      const value = Number(event.value);

      accepted.push({
        name: event.name,
        visitorId,
        sessionId,
        tier: isProductTier(event.tier) ? event.tier : null,
        step: Number.isFinite(step) && step > 0 ? step : null,
        archetype: optionalString(event.archetype, 40),
        path: optionalString(event.path, 200),
        // utm_source when the link carried one, otherwise the referring host.
        source:
          optionalString(event.source, 120) ??
          normalizeSource(optionalString(event.referrer, 500), host),
        device,
        ...geo,
        value: Number.isFinite(value) && value >= 0 ? value : null,
      });
    }

    // Validate everything first, write once, then answer. trackAll swallows its
    // own failures, so a database problem still returns 204 rather than
    // surfacing an error to a page that is not listening for one.
    await trackAll(accepted);

    res.status(204).end();
  }),
);
