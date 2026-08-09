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
    headline: 'Your 15-Page Personalised Romantic Blueprint',
    kicker: 'Instant PDF download',
    amount: 200,
    currency: 'usd',
    description:
      'A full compatibility breakdown written around your exact answers — love language, story arc, red flags, and the scene your heart is actually waiting for.',
    deliverables: [
      '15-page PDF, personalised to your archetype',
      'Compatibility breakdown against all 5 archetypes',
      'Red-flag warnings written for your specific pattern',
      'Delivered to your inbox in under two minutes',
    ],
    imageKey: 'product_blueprint',
    generatesPdf: true,
  },
  bundle: {
    tier: 'bundle',
    name: 'Premium Bundle',
    headline: 'Blueprint + AI Dream Outcome Script + All 5 Archetype Books',
    kicker: 'Most popular',
    amount: 300,
    currency: 'usd',
    description:
      'Everything in the Blueprint, plus a custom AI-written dream outcome video script in your own story, and the complete compatibility library for all five archetypes.',
    deliverables: [
      'Everything in the Romantic Blueprint',
      'Expanded to a 23-page premium edition',
      'Your Dream Outcome Script, written shot by shot',
      'All 5 Archetype Compatibility Books',
    ],
    imageKey: 'product_bundle',
    badge: 'Best value',
    generatesPdf: true,
  },
  coaching: {
    tier: 'coaching',
    name: 'The Aesthetic Planner Bundle',
    headline: 'Your Blueprint + the Full Aesthetic Planner Bundle in Notion',
    kicker: 'The complete kit',
    amount: 500,
    currency: 'usd',
    description:
      'Everything above, plus the Notion workspace that turns the reading into a routine — daily planner, habit and mood tracking, journal, goals and vision board, all feeding one life dashboard.',
    deliverables: [
      'Everything in the Premium Bundle, all 23 pages',
      'The Aesthetic Planner Bundle — a full Notion workspace',
      'Daily planner, habit tracker, mood log and journal',
      'Goals, vision board, Future Me and a life-stats dashboard',
      'Built for mobile, yours to duplicate and keep',
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
