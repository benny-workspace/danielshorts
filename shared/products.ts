/**
 * The three paid tiers. Prices live here in minor units so the server can build
 * Stripe line items and the client can render prices from the same source.
 */

export type ProductTier = 'blueprint' | 'bundle' | 'coaching';

export interface Product {
  tier: ProductTier;
  name: string;
  /** Shown as the card headline. */
  headline: string;
  kicker: string;
  /** USD cents. */
  amount: number;
  currency: 'usd';
  description: string;
  deliverables: string[];
  imageKey: string;
  /** Rendered as a ribbon on the card when set. */
  badge?: string;
  /** Whether fulfilment generates and emails a personalised PDF. */
  generatesPdf: boolean;
  /**
   * Whether fulfilment also hands over the Notion planner. The link itself
   * lives in NOTION_TEMPLATE_URL, never in this file — see server/env.ts.
   */
  deliversTemplate?: boolean;
}

export const PRODUCTS: Record<ProductTier, Product> = {
  blueprint: {
    tier: 'blueprint',
    name: 'Romantic Blueprint',
    headline: 'Your 15-page romantic blueprint',
    kicker: 'Instant PDF download',
    amount: 200,
    currency: 'usd',
    description:
      'Your love language, your story arc, your red flags, and the scene you have been waiting for — written from your answers.',
    deliverables: [
      '15 pages, written for your result',
      'Your match with all 5 archetypes',
      'Your red flags, and what to do instead',
      'Ready in under 2 minutes',
    ],
    imageKey: 'product_blueprint',
    generatesPdf: true,
  },
  bundle: {
    tier: 'bundle',
    name: 'Premium Bundle',
    headline: '23 pages, your dream scene, all 5 books',
    kicker: 'Most popular',
    amount: 300,
    currency: 'usd',
    description:
      'The blueprint, expanded — plus your dream scene written shot by shot, and a book on every archetype you could meet.',
    deliverables: [
      'Everything in the $2 Blueprint',
      '23 pages instead of 15',
      'Your dream scene, written shot by shot',
      'All 5 compatibility books',
    ],
    imageKey: 'product_bundle',
    badge: 'Best value',
    generatesPdf: true,
  },
  coaching: {
    tier: 'coaching',
    name: 'The Aesthetic Planner Bundle',
    headline: 'Everything, plus the Notion planner',
    kicker: 'The complete kit',
    amount: 500,
    currency: 'usd',
    description:
      'Everything above, plus the Notion workspace that turns the reading into a routine you actually keep.',
    deliverables: [
      'Everything in the $3 Bundle',
      'The full Notion planner workspace',
      'Daily planner, habits, mood log, journal',
      'Goals, vision board, life dashboard',
      'Yours to keep, built for your phone',
    ],
    imageKey: 'product_coaching',
    generatesPdf: true,
    deliversTemplate: true,
  },
};

export const PRODUCT_TIERS: ProductTier[] = ['blueprint', 'bundle', 'coaching'];

export function isProductTier(value: unknown): value is ProductTier {
  return typeof value === 'string' && value in PRODUCTS;
}

export function formatPrice(amount: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}
