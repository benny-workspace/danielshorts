import type { EventName, EventProps } from '@shared/analytics';

/**
 * Funnel tracking, first-party and deliberately small.
 *
 * No third-party script, no cookies, no fingerprinting: a random id in
 * localStorage identifies a browser and another in sessionStorage identifies a
 * visit. Because the endpoint is same-origin, none of this is blocked by the
 * ad blockers that eat a hosted analytics tag — which is the whole reason for
 * measuring it here rather than bolting on a vendor.
 */

const VISITOR_KEY = 'kdd.visitor.v1';
const SESSION_KEY = 'kdd.trackingSession.v1';

/** Events are batched for this long before being sent, to coalesce bursts. */
const FLUSH_DELAY_MS = 700;
/** Flush immediately once this many are waiting. */
const MAX_QUEUE = 10;

interface QueuedEvent extends EventProps {
  name: EventName;
  visitorId: string;
  sessionId: string;
  referrer?: string | null;
  source?: string | null;
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Reads an id, minting one if absent. Storage can throw outright in private
 * mode, so a failure falls back to a per-page id: that visitor is counted
 * once per page rather than not at all.
 */
function persistentId(storage: 'local' | 'session', key: string): string {
  try {
    const store = storage === 'local' ? window.localStorage : window.sessionStorage;
    const existing = store.getItem(key);
    if (existing) return existing;
    const created = randomId();
    store.setItem(key, created);
    return created;
  } catch {
    return randomId();
  }
}

let visitorId: string | null = null;
let sessionId: string | null = null;

function ids(): { visitorId: string; sessionId: string } {
  if (!visitorId) visitorId = persistentId('local', VISITOR_KEY);
  if (!sessionId) sessionId = persistentId('session', SESSION_KEY);
  return { visitorId, sessionId };
}

/** Exposed so checkout can hand the same ids to the server. */
export const trackingIds = ids;

/**
 * The campaign that brought them, when the link said so. Read once at load,
 * because the query string is stripped from the URL soon afterwards.
 */
const utmSource = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('utm_source') ?? params.get('ref') ?? null;
  } catch {
    return null;
  }
})();

const queue: QueuedEvent[] = [];
let timer: number | null = null;

function send(events: QueuedEvent[], beacon: boolean): void {
  if (!events.length) return;
  const body = JSON.stringify({ events });

  try {
    // On the way out of the page only sendBeacon is guaranteed to survive the
    // navigation; fetch would be cancelled with the document.
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/track', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // Lets the request outlive the page if one is navigating away mid-flight.
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Measurement must never break the page it is measuring.
  }
}

function flush(beacon = false): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  send(queue.splice(0, queue.length), beacon);
}

export function track(name: EventName, props: EventProps = {}): void {
  if (typeof window === 'undefined') return;

  queue.push({
    ...props,
    name,
    ...ids(),
    path: props.path ?? window.location.pathname,
    referrer: document.referrer || null,
    source: utmSource,
  });

  if (queue.length >= MAX_QUEUE) {
    flush();
    return;
  }
  if (timer === null) {
    timer = window.setTimeout(() => flush(), FLUSH_DELAY_MS);
  }
}

const fired = new Set<string>();

/**
 * Fires an event at most once per visit.
 *
 * Needed because React's StrictMode runs effects twice in development, and
 * because "saw the offers" should count a reader once however many times they
 * scroll past. Distinct-visitor counting already protects the funnel rates;
 * this keeps the raw event totals honest too.
 */
export function trackOnce(key: string, name: EventName, props: EventProps = {}): void {
  if (fired.has(key)) return;
  fired.add(key);
  track(name, props);
}

if (typeof window !== 'undefined') {
  // pagehide covers the back/forward cache on Safari, where unload never runs.
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}
