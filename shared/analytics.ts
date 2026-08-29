import type { ProductTier } from './products.js';

/**
 * The funnel, named once and shared by the browser, the API and the dashboard.
 *
 * Every step a visitor can reach is an event here, in the order they happen.
 * Keeping the list in one shared module is what stops the tracking calls and
 * the dashboard from drifting apart — a renamed step breaks the build rather
 * than silently emptying a chart.
 */
export const EVENT_NAMES = [
  /** Any page load. The top of the funnel and the denominator for everything. */
  'page_view',
  /** Pressed a "begin the quiz" call to action. */
  'quiz_cta_click',
  /** The questionnaire actually opened — question one is on screen. */
  'quiz_start',
  /** One answer chosen. `step` carries which question, 1-based. */
  'question_answered',
  /** Every question answered. */
  'quiz_complete',
  /**
   * Retired. The email gate between the quiz and the result was removed — it
   * was the largest single drop in the funnel, and this traffic arrives with no
   * intention of signing up for anything. The names stay so that rows recorded
   * before the change still parse; nothing emits them now.
   */
  'optin_view',
  'optin_submit',
  'optin_skip',
  /** The archetype result was revealed. */
  'result_view',
  /** The three offer cards were scrolled into view. */
  'offers_view',
  /** Pressed buy on a tier. `tier` carries which one. */
  'checkout_click',
  /** A Stripe Checkout Session was created — the buyer reached the card form. */
  'checkout_session',
  /** Returned from Stripe having cancelled. */
  'checkout_cancelled',
  /** Payment confirmed. `value` carries the amount in cents. */
  'purchase',
  /** Pressed the download button on the success screen or in the account sheet. */
  'download_click',
  /** The PDF was actually streamed back. The click above can fail; this cannot. */
  'download_served',
  /** Opened the Notion planner link. */
  'template_click',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

const EVENT_NAME_SET = new Set<string>(EVENT_NAMES);

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && EVENT_NAME_SET.has(value);
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/** What a single tracked event carries beyond its name. */
export interface EventProps {
  /** Which product a checkout/purchase event refers to. */
  tier?: ProductTier | null;
  /** 1-based question number for `question_answered`. */
  step?: number | null;
  /** The reader's archetype, once they have one. */
  archetype?: string | null;
  /** Amount in cents, for `purchase`. */
  value?: number | null;
  /** Path the event happened on. */
  path?: string | null;
}

/**
 * The ordered spine of the funnel: the steps every visitor passes through
 * before a tier is chosen. Tier-specific steps are counted separately, because
 * a visitor picks exactly one of three products and summing them as a single
 * funnel stage would double-count nothing but read as though it did.
 */
export const FUNNEL_STEPS: Array<{
  name: EventName;
  label: string;
  /** What to do when this step leaks, shown on the dashboard. */
  hint: string;
}> = [
  {
    name: 'page_view',
    label: 'Landed on the site',
    hint: 'Everyone who opened any page. The denominator for every rate below.',
  },
  {
    name: 'quiz_cta_click',
    label: 'Pressed “begin the quiz”',
    hint: 'A weak rate here is a hero problem — the headline or the first screen is not landing.',
  },
  {
    name: 'quiz_start',
    label: 'Reached question one',
    hint: 'Close to the row above. A gap means the quiz is slow to appear.',
  },
  {
    name: 'quiz_complete',
    label: 'Answered all seven',
    hint: 'Check the per-question chart to see exactly which question loses them.',
  },
  {
    name: 'result_view',
    label: 'Saw their archetype',
    hint: 'The payoff. Anyone who gets here has spent two minutes on you.',
  },
  {
    name: 'offers_view',
    label: 'Scrolled to the offers',
    hint: 'If this is far below the row above, the result page ends before the pitch.',
  },
  {
    name: 'checkout_click',
    label: 'Pressed buy',
    hint: 'The single most valuable rate on this page. Price, wording and card order all move it.',
  },
  {
    name: 'checkout_session',
    label: 'Reached Stripe',
    hint: 'A gap here is a bug, not a copy problem — the button failed to open checkout.',
  },
  {
    name: 'purchase',
    label: 'Paid',
    hint: 'Card abandonment lives between this row and the one above it.',
  },
  {
    name: 'download_served',
    label: 'Got the product',
    hint: 'A paid customer who never downloaded is a refund waiting to happen.',
  },
];
