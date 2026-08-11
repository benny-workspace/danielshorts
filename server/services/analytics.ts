import {
  FUNNEL_STEPS,
  isEventName,
  type EventName,
} from '../../shared/analytics.js';
import { PRODUCTS, PRODUCT_TIERS, type ProductTier } from '../../shared/products.js';
import { QUESTIONS } from '../../shared/questions.js';
import { getActiveDriver, getDb, type AnalyticsEvent, type Order } from '../db/index.js';
import { capabilities, log } from '../env.js';

/**
 * Funnel measurement.
 *
 * Two rules shape everything here. First, tracking must never be able to break
 * the thing it is measuring — every write is wrapped and swallowed, so a
 * failing insert costs a data point rather than a sale. Second, the numbers on
 * the dashboard are counted in *visitors*, not raw events: a reader who reloads
 * the page five times is one person who landed, and a funnel built on event
 * counts would quietly report conversion rates that are too low.
 */

/** Hard ceiling on rows pulled into a single dashboard render. */
const MAX_EVENTS = 50_000;

export interface TrackInput {
  name: EventName;
  visitorId: string;
  sessionId: string;
  tier?: ProductTier | null;
  step?: number | null;
  archetype?: string | null;
  path?: string | null;
  source?: string | null;
  device?: string | null;
  country?: string | null;
  region?: string | null;
  value?: number | null;
}

/**
 * Where the request came from, as resolved by the edge from its IP.
 *
 * Taken from the platform's headers rather than from a geo-IP lookup or
 * anything the browser reports: the edge already knows, it costs nothing, and
 * a client cannot flatter its own location. Vercel sets these in production;
 * locally they are absent and the fields stay null rather than guessing.
 */
export function geoFromRequest(req: {
  get?(header: string): string | undefined;
}): { country: string | null; region: string | null } {
  const read = (header: string) => {
    const value = req.get?.(header)?.trim();
    if (!value) return null;
    // Vercel percent-encodes these, since place names carry accents.
    try {
      return decodeURIComponent(value).slice(0, 64);
    } catch {
      return value.slice(0, 64);
    }
  };

  return {
    country: read('x-vercel-ip-country'),
    region: read('x-vercel-ip-country-region'),
  };
}

/**
 * Records one event. Never throws and never rejects.
 *
 * Callers on a request path should await it: on serverless, work left pending
 * when the response is sent may be frozen before it runs, so a fire-and-forget
 * insert would be lost precisely when traffic is highest.
 */
export async function track(input: TrackInput): Promise<void> {
  try {
    const db = await getDb();
    await db.recordEvent({
      name: input.name,
      visitorId: input.visitorId.slice(0, 64),
      sessionId: input.sessionId.slice(0, 64),
      tier: input.tier ?? null,
      step: Number.isFinite(input.step) ? Number(input.step) : null,
      archetype: input.archetype?.slice(0, 40) ?? null,
      path: input.path?.slice(0, 200) ?? null,
      source: input.source?.slice(0, 120) ?? null,
      device: input.device?.slice(0, 20) ?? null,
      country: input.country?.slice(0, 8) ?? null,
      region: input.region?.slice(0, 64) ?? null,
      value: Number.isFinite(input.value) ? Number(input.value) : null,
    });
  } catch (error) {
    log('analytics write failed:', (error as Error).message);
  }
}

/**
 * Server-side events carry no browser ids, so they are attributed to the order
 * they belong to. That keeps a purchase joinable to its checkout click without
 * the browser having to round-trip an id it may have already navigated away
 * from.
 */
export function idsForOrder(orderId: string): { visitorId: string; sessionId: string } {
  return { visitorId: `order:${orderId}`, sessionId: `order:${orderId}` };
}

/* ------------------------------------------------------------ aggregation */

const UA_MOBILE = /Mobi|Android|iPhone|iPod/i;
const UA_TABLET = /iPad|Tablet/i;
const UA_BOT = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|monitor/i;

export function deviceFromUserAgent(ua: string | undefined): string {
  if (!ua) return 'unknown';
  if (UA_TABLET.test(ua)) return 'tablet';
  if (UA_MOBILE.test(ua)) return 'mobile';
  return 'desktop';
}

export function looksLikeBot(ua: string | undefined): boolean {
  return Boolean(ua && UA_BOT.test(ua));
}

/**
 * Reduces a referrer to something worth grouping by. A full URL would split
 * one source across dozens of rows, so only the host survives, and our own
 * host is reported as direct — an internal navigation is not a traffic source.
 */
export function normalizeSource(
  referrer: string | null | undefined,
  ownHost: string | null,
): string {
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (!host) return 'direct';
    if (ownHost && host === ownHost.replace(/^www\./, '')) return 'direct';
    return host.slice(0, 120);
  } catch {
    return 'direct';
  }
}

const dayOf = (iso: string) => iso.slice(0, 10);

/** Distinct visitors, per event name. */
function visitorsByEvent(events: AnalyticsEvent[]): Map<EventName, Set<string>> {
  const map = new Map<EventName, Set<string>>();
  for (const event of events) {
    if (!isEventName(event.name)) continue;
    let set = map.get(event.name);
    if (!set) map.set(event.name, (set = new Set()));
    set.add(event.visitorId);
  }
  return map;
}

const rate = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

export interface DashboardData {
  generatedAt: string;
  range: { since: string; days: number };
  storage: { driver: string; durable: boolean; eventsStored: number; truncated: boolean };
  totals: {
    visitors: number;
    sessions: number;
    pageViews: number;
    quizCompletions: number;
    purchases: number;
    revenueCents: number;
    /** Visitors who landed and ended up paying, as a percentage. */
    conversionRate: number;
  };
  funnel: Array<{
    name: EventName;
    label: string;
    hint: string;
    visitors: number;
    events: number;
    rateFromTop: number;
    rateFromPrev: number;
    lost: number;
  }>;
  questions: Array<{ step: number; chapter: string; question: string; visitors: number; rateFromStart: number; lost: number }>;
  tiers: Array<{
    tier: ProductTier;
    name: string;
    amount: number;
    clicks: number;
    reachedStripe: number;
    purchases: number;
    revenueCents: number;
    clickToPaid: number;
  }>;
  daily: Array<{ day: string; visitors: number; pageViews: number; quizCompletions: number; purchases: number; revenueCents: number }>;
  sources: Array<{ source: string; visitors: number; checkouts: number }>;
  devices: Array<{ device: string; visitors: number }>;
  countries: Array<{ country: string; visitors: number; checkouts: number }>;
  regions: Array<{ country: string; region: string; visitors: number; checkouts: number }>;
  archetypes: Array<{ archetype: string; visitors: number }>;
  delivery: { purchases: number; downloadClicks: number; downloadsServed: number; templateClicks: number };
  orders: {
    total: number;
    pending: number;
    paid: number;
    fulfilled: number;
    failed: number;
    revenueCents: number;
    recent: Array<{ id: string; tier: ProductTier; status: string; amount: number; createdAt: string }>;
  };
  kanban: Array<{
    id: string;
    title: string;
    visitors: number;
    cards: Array<{ label: string; value: string; detail: string; tone: 'good' | 'warn' | 'bad' | 'plain' }>;
  }>;
}

/**
 * Builds every number the dashboard shows from one pass over the window.
 *
 * Revenue is taken from the orders table rather than from purchase events:
 * orders are written by the payment path itself, so they stay correct even
 * when a buyer's browser blocked the tracking call entirely.
 */
export async function buildDashboard(days: number): Promise<DashboardData> {
  const windowDays = Math.min(Math.max(Math.round(days) || 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const db = await getDb();
  const [events, orders] = await Promise.all([
    db.listEvents(since, MAX_EVENTS),
    db.listOrdersSince(since),
  ]);

  const byEvent = visitorsByEvent(events);
  const eventCounts = new Map<EventName, number>();
  for (const event of events) {
    if (!isEventName(event.name)) continue;
    eventCounts.set(event.name, (eventCounts.get(event.name) ?? 0) + 1);
  }

  const visitorsOf = (name: EventName) => byEvent.get(name)?.size ?? 0;
  const landed = visitorsOf('page_view');

  /* ------------------------------------------------------------- funnel */

  const funnel = FUNNEL_STEPS.map((step, index) => {
    const visitors = visitorsOf(step.name);
    const previous = index === 0 ? visitors : visitorsOf(FUNNEL_STEPS[index - 1].name);
    return {
      name: step.name,
      label: step.label,
      hint: step.hint,
      visitors,
      events: eventCounts.get(step.name) ?? 0,
      rateFromTop: rate(visitors, landed),
      rateFromPrev: index === 0 ? 100 : rate(visitors, previous),
      lost: index === 0 ? 0 : Math.max(previous - visitors, 0),
    };
  });

  /* ------------------------------------------------- per-question falloff */

  const byStep = new Map<number, Set<string>>();
  for (const event of events) {
    if (event.name !== 'question_answered' || !event.step) continue;
    let set = byStep.get(event.step);
    if (!set) byStep.set(event.step, (set = new Set()));
    set.add(event.visitorId);
  }

  const startedQuiz = visitorsOf('quiz_start');
  const questions = QUESTIONS.map((question, index) => {
    const step = index + 1;
    const visitors = byStep.get(step)?.size ?? 0;
    const previous = index === 0 ? startedQuiz : byStep.get(step - 1)?.size ?? 0;
    return {
      step,
      chapter: question.chapter,
      question: question.question,
      visitors,
      rateFromStart: rate(visitors, startedQuiz),
      lost: Math.max(previous - visitors, 0),
    };
  });

  /* --------------------------------------------------------------- tiers */

  const paidOrders = orders.filter(
    (order) => order.status === 'paid' || order.status === 'fulfilled',
  );

  const tiers = PRODUCT_TIERS.map((tier) => {
    const clicks = new Set(
      events.filter((e) => e.name === 'checkout_click' && e.tier === tier).map((e) => e.visitorId),
    ).size;
    const reachedStripe = new Set(
      events.filter((e) => e.name === 'checkout_session' && e.tier === tier).map((e) => e.visitorId),
    ).size;
    const paid = paidOrders.filter((order) => order.productTier === tier);
    return {
      tier,
      name: PRODUCTS[tier].name,
      amount: PRODUCTS[tier].amount,
      clicks,
      reachedStripe,
      purchases: paid.length,
      revenueCents: paid.reduce((sum, order) => sum + order.amountPaid, 0),
      clickToPaid: rate(paid.length, clicks),
    };
  });

  /* --------------------------------------------------------------- daily */

  const dayKeys: string[] = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    dayKeys.push(dayOf(new Date(Date.now() - i * 86_400_000).toISOString()));
  }

  const dailyVisitors = new Map<string, Set<string>>();
  const dailyPageViews = new Map<string, number>();
  const dailyQuizDone = new Map<string, Set<string>>();
  for (const event of events) {
    const day = dayOf(event.createdAt);
    let set = dailyVisitors.get(day);
    if (!set) dailyVisitors.set(day, (set = new Set()));
    set.add(event.visitorId);

    if (event.name === 'page_view') {
      dailyPageViews.set(day, (dailyPageViews.get(day) ?? 0) + 1);
    }
    if (event.name === 'quiz_complete') {
      let done = dailyQuizDone.get(day);
      if (!done) dailyQuizDone.set(day, (done = new Set()));
      done.add(event.visitorId);
    }
  }

  const daily = dayKeys.map((day) => {
    const dayOrders = paidOrders.filter((order) => dayOf(order.createdAt) === day);
    return {
      day,
      visitors: dailyVisitors.get(day)?.size ?? 0,
      pageViews: dailyPageViews.get(day) ?? 0,
      quizCompletions: dailyQuizDone.get(day)?.size ?? 0,
      purchases: dayOrders.length,
      revenueCents: dayOrders.reduce((sum, order) => sum + order.amountPaid, 0),
    };
  });

  /* ---------------------------------------------- sources, devices, types */

  const checkoutVisitors = new Set(
    events.filter((e) => e.name === 'checkout_click').map((e) => e.visitorId),
  );

  /*
   * Source and device are attributed to each visitor once, from their earliest
   * event, rather than counted per event. Otherwise one reader who arrives from
   * a link and then keeps browsing appears under both that link and "direct",
   * and the chart adds up to more people than actually visited.
   *
   * `events` is newest-first, so writing on every pass leaves the oldest value
   * standing — which is the first thing we ever saw about that visitor.
   */
  const firstSource = new Map<string, string>();
  const firstDevice = new Map<string, string>();
  const firstCountry = new Map<string, string>();
  const firstRegion = new Map<string, string>();
  const archetypeMap = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.source) firstSource.set(event.visitorId, event.source);
    if (event.device) firstDevice.set(event.visitorId, event.device);
    if (event.country) firstCountry.set(event.visitorId, event.country);
    // Keyed by country too, because subdivision codes are only unique within
    // one — "WA" is both Washington and Western Australia.
    if (event.country && event.region) {
      firstRegion.set(event.visitorId, `${event.country}-${event.region}`);
    }
    if (event.archetype && event.name === 'result_view') {
      let set = archetypeMap.get(event.archetype);
      if (!set) archetypeMap.set(event.archetype, (set = new Set()));
      set.add(event.visitorId);
    }
  }

  const tally = (assignments: Map<string, string>) => {
    const counts = new Map<string, { visitors: number; checkouts: number }>();
    for (const [visitorId, key] of assignments) {
      let entry = counts.get(key);
      if (!entry) counts.set(key, (entry = { visitors: 0, checkouts: 0 }));
      entry.visitors += 1;
      if (checkoutVisitors.has(visitorId)) entry.checkouts += 1;
    }
    return counts;
  };

  const sources = [...tally(firstSource).entries()]
    .map(([source, entry]) => ({
      source,
      visitors: entry.visitors,
      // Visitors from this source who pressed buy — not who paid. A payment is
      // recorded against the order, which carries no browser id to join on.
      checkouts: entry.checkouts,
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 12);

  const devices = [...tally(firstDevice).entries()]
    .map(([device, entry]) => ({ device, visitors: entry.visitors }))
    .sort((a, b) => b.visitors - a.visitors);

  const countries = [...tally(firstCountry).entries()]
    .map(([country, entry]) => ({
      country,
      visitors: entry.visitors,
      checkouts: entry.checkouts,
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 20);

  const regions = [...tally(firstRegion).entries()]
    .map(([key, entry]) => {
      const [country, ...rest] = key.split('-');
      return {
        country,
        region: rest.join('-'),
        visitors: entry.visitors,
        checkouts: entry.checkouts,
      };
    })
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 15);

  const archetypes = [...archetypeMap.entries()]
    .map(([archetype, set]) => ({ archetype, visitors: set.size }))
    .sort((a, b) => b.visitors - a.visitors);

  /* ------------------------------------------------------------ delivery */

  const revenueCents = paidOrders.reduce((sum, order) => sum + order.amountPaid, 0);
  const countStatus = (status: Order['status']) =>
    orders.filter((order) => order.status === status).length;

  const totals = {
    visitors: new Set(events.map((e) => e.visitorId)).size,
    sessions: new Set(events.map((e) => e.sessionId)).size,
    pageViews: eventCounts.get('page_view') ?? 0,
    quizCompletions: visitorsOf('quiz_complete'),
    purchases: paidOrders.length,
    revenueCents,
    conversionRate: rate(paidOrders.length, landed),
  };

  const delivery = {
    purchases: paidOrders.length,
    downloadClicks: visitorsOf('download_click'),
    downloadsServed: visitorsOf('download_served'),
    templateClicks: visitorsOf('template_click'),
  };

  return {
    generatedAt: new Date().toISOString(),
    range: { since, days: windowDays },
    storage: {
      driver: getActiveDriver(),
      // The distinction that decides whether any of this is trustworthy: the
      // in-memory store is per-instance and wiped on every cold start, so on
      // serverless it reports a fraction of reality.
      durable: capabilities.postgres && getActiveDriver() === 'postgres',
      eventsStored: events.length,
      truncated: events.length >= MAX_EVENTS,
    },
    totals,
    funnel,
    questions,
    tiers,
    daily,
    sources,
    devices,
    countries,
    regions,
    archetypes,
    delivery,
    orders: {
      total: orders.length,
      pending: countStatus('pending'),
      paid: countStatus('paid'),
      fulfilled: countStatus('fulfilled'),
      failed: countStatus('failed'),
      revenueCents,
      recent: orders.slice(0, 25).map((order) => ({
        id: order.id,
        tier: order.productTier,
        status: order.status,
        amount: order.amountPaid,
        createdAt: order.createdAt,
      })),
    },
    kanban: buildKanban({ funnel, tiers, delivery, questions, landed }),
  };
}

/**
 * The same funnel arranged as a board: five columns for the five things a
 * visitor does, each holding the specific numbers that explain that stage.
 * Tone is what makes it scannable — a card turns amber or red when its rate
 * falls below what this funnel should be doing, so the worst column is
 * visible without reading a single figure.
 */
function buildKanban(input: {
  funnel: DashboardData['funnel'];
  tiers: DashboardData['tiers'];
  delivery: DashboardData['delivery'];
  questions: DashboardData['questions'];
  landed: number;
}): DashboardData['kanban'] {
  const step = (name: EventName) => input.funnel.find((f) => f.name === name);
  const pct = (value: number) => `${value.toFixed(1)}%`;

  const tone = (value: number, warn: number, bad: number): 'good' | 'warn' | 'bad' =>
    value >= warn ? 'good' : value >= bad ? 'warn' : 'bad';

  const worstQuestion = [...input.questions].sort((a, b) => b.lost - a.lost)[0];
  const bestTier = [...input.tiers].sort((a, b) => b.revenueCents - a.revenueCents)[0];

  return [
    {
      id: 'arrive',
      title: 'Arrived',
      visitors: input.landed,
      cards: [
        {
          label: 'Visitors',
          value: String(input.landed),
          detail: 'Unique browsers that opened the site in this window.',
          tone: 'plain',
        },
        {
          label: 'Pressed the CTA',
          value: pct(step('quiz_cta_click')?.rateFromTop ?? 0),
          detail: 'Of everyone who landed. Below 30% means the hero is not selling the quiz.',
          tone: tone(step('quiz_cta_click')?.rateFromTop ?? 0, 30, 15),
        },
      ],
    },
    {
      id: 'quiz',
      title: 'Took the quiz',
      visitors: step('quiz_start')?.visitors ?? 0,
      cards: [
        {
          label: 'Started',
          value: String(step('quiz_start')?.visitors ?? 0),
          detail: 'Saw question one.',
          tone: 'plain',
        },
        {
          label: 'Finished all seven',
          value: pct(step('quiz_complete')?.rateFromPrev ?? 0),
          detail: 'Of those who started. A good quiz holds 70%+.',
          tone: tone(step('quiz_complete')?.rateFromPrev ?? 0, 70, 45),
        },
        {
          label: 'Weakest question',
          value: worstQuestion ? `Q${worstQuestion.step}` : '—',
          detail: worstQuestion
            ? `“${worstQuestion.chapter}” lost ${worstQuestion.lost} people. Rewrite this one first.`
            : 'No answers recorded yet.',
          tone: worstQuestion && worstQuestion.lost > 0 ? 'warn' : 'plain',
        },
      ],
    },
    {
      id: 'result',
      title: 'Saw the result',
      visitors: step('result_view')?.visitors ?? 0,
      cards: [
        {
          label: 'Left an email',
          value: pct(step('optin_submit')?.rateFromTop ?? 0),
          detail: 'Of everyone who landed. These are the ones you can re-contact.',
          tone: tone(step('optin_submit')?.rateFromTop ?? 0, 20, 8),
        },
        {
          label: 'Scrolled to the offers',
          value: pct(step('offers_view')?.rateFromPrev ?? 0),
          detail: 'Of those who saw a result. Below 60% and the pitch is too far down the page.',
          tone: tone(step('offers_view')?.rateFromPrev ?? 0, 60, 35),
        },
      ],
    },
    {
      id: 'checkout',
      title: 'Went to buy',
      visitors: step('checkout_click')?.visitors ?? 0,
      cards: [
        ...input.tiers.map((tier) => ({
          label: `$${(tier.amount / 100).toFixed(0)} · ${tier.name}`,
          value: `${tier.purchases}/${tier.clicks}`,
          detail: `${tier.clicks} pressed buy, ${tier.purchases} paid (${pct(tier.clickToPaid)}).`,
          tone: tier.clicks === 0 ? ('plain' as const) : tone(tier.clickToPaid, 50, 25),
        })),
        {
          label: 'Best earner',
          value: bestTier && bestTier.revenueCents > 0 ? `$${(bestTier.revenueCents / 100).toFixed(2)}` : '—',
          detail: bestTier && bestTier.revenueCents > 0
            ? `${bestTier.name} is bringing in the most. Push this one.`
            : 'No revenue in this window yet.',
          tone: 'plain',
        },
      ],
    },
    {
      id: 'delivered',
      title: 'Got the product',
      visitors: input.delivery.downloadsServed,
      cards: [
        {
          label: 'PDFs delivered',
          value: `${input.delivery.downloadsServed}/${input.delivery.purchases}`,
          detail: 'Paying customers who actually received the file. A gap here causes refunds.',
          tone:
            input.delivery.purchases === 0
              ? 'plain'
              : tone(rate(input.delivery.downloadsServed, input.delivery.purchases), 80, 50),
        },
        {
          label: 'Notion planner opened',
          value: String(input.delivery.templateClicks),
          detail: 'Only the $5 tier includes it.',
          tone: 'plain',
        },
      ],
    },
  ];
}
