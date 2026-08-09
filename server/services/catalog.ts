import type Stripe from 'stripe';
import { PRODUCTS, PRODUCT_TIERS, type Product, type ProductTier } from '../../shared/products.js';
import { capabilities, env, log } from '../env.js';
import { getStripe } from './stripe.js';

/**
 * Keeps a real Stripe Product + Price behind each tier, instead of inventing an
 * anonymous line item at checkout time.
 *
 * Why it matters: an inline `price_data` line item shows up in Stripe as a
 * one-off with no catalogue entry, so there is nothing to edit, no sales
 * reporting per product, and no way to change a price without a code deploy.
 * With real objects, the Stripe dashboard becomes the place to edit names,
 * descriptions, images and prices — and this app follows along.
 */

/** Tags every object this app owns, so they are recognisable in the dashboard. */
const APP_TAG = 'kdrama-dreams';

/**
 * Deterministic product ids. Stripe is unusual in letting the caller choose a
 * Product id, which turns "create it once" into a retrieve-or-create instead of
 * a search. That means no duplicates however many times this runs, and no
 * dependence on the search index, which is only eventually consistent.
 */
const productIdFor = (tier: ProductTier) => `kdd_${tier}`;

/**
 * Prices are immutable in Stripe — changing an amount means creating a new
 * Price — so the stable handle is a lookup key rather than an id.
 */
const lookupKeyFor = (tier: ProductTier) => `kdd_${tier}`;

export interface CatalogEntry {
  tier: ProductTier;
  productId: string;
  priceId: string;
  /** Live amount in Stripe, which may differ from the repo default. */
  amount: number;
  currency: string;
  /** True when this run created the objects rather than reusing them. */
  createdProduct: boolean;
  createdPrice: boolean;
}

const CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; entries: Map<ProductTier, CatalogEntry> } | null = null;

function isMissing(error: unknown): boolean {
  const e = error as { code?: string; statusCode?: number };
  return e?.code === 'resource_missing' || e?.statusCode === 404;
}

async function ensureProduct(
  stripe: Stripe,
  tier: ProductTier,
  product: Product,
): Promise<{ product: Stripe.Product; created: boolean }> {
  const id = productIdFor(tier);

  try {
    const existing = await stripe.products.retrieve(id);

    // The one field that is healed rather than left alone. Everything else —
    // name, description, images — belongs to the dashboard, but a product with
    // no tax code makes Managed Payments reject checkout entirely, so a
    // configured code is applied to a product that is missing one.
    if (env.stripeTaxCode && !existing.tax_code) {
      log('adding missing tax code to', id);
      return {
        product: await stripe.products.update(id, { tax_code: env.stripeTaxCode }),
        created: false,
      };
    }

    // Deliberately not patched back to the repo's copy. Once the product
    // exists, the dashboard owns its name, description and images — otherwise
    // every deploy would silently undo the seller's edits.
    return { product: existing, created: false };
  } catch (error) {
    if (!isMissing(error)) throw error;
  }

  const created = await stripe.products.create({
    id,
    name: product.name,
    description: product.description,
    metadata: { app: APP_TAG, tier },
    ...(env.stripeTaxCode ? { tax_code: env.stripeTaxCode } : {}),
  });

  log('created stripe product', created.id);
  return { product: created, created: true };
}

async function ensurePrice(
  stripe: Stripe,
  tier: ProductTier,
  product: Product,
): Promise<{ price: Stripe.Price; created: boolean }> {
  const lookupKey = lookupKeyFor(tier);

  // Reading by lookup key is what makes dashboard price changes work: to
  // re-price, create a new Price carrying the same key with
  // `transfer_lookup_key`, and this resolves to it on the next cache miss.
  const found = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });

  if (found.data[0]) return { price: found.data[0], created: false };

  const created = await stripe.prices.create({
    product: productIdFor(tier),
    currency: product.currency,
    unit_amount: product.amount,
    lookup_key: lookupKey,
    // Claims the key back if an archived price is still holding it, which
    // would otherwise fail the create outright.
    transfer_lookup_key: true,
    metadata: { app: APP_TAG, tier },
  });

  log('created stripe price', created.id, 'for', tier);
  return { price: created, created: true };
}

async function ensureTier(stripe: Stripe, tier: ProductTier): Promise<CatalogEntry> {
  const product = PRODUCTS[tier];
  const productResult = await ensureProduct(stripe, tier, product);
  const priceResult = await ensurePrice(stripe, tier, product);

  return {
    tier,
    productId: productResult.product.id,
    priceId: priceResult.price.id,
    amount: priceResult.price.unit_amount ?? product.amount,
    currency: priceResult.price.currency ?? product.currency,
    createdProduct: productResult.created,
    createdPrice: priceResult.created,
  };
}

/**
 * Creates anything missing and returns the full catalogue. Safe to run
 * repeatedly — existing objects are reused untouched.
 */
export async function syncCatalog(stripe: Stripe = getStripe()): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];

  // Sequential on purpose: three calls at startup are cheap, and it keeps the
  // Stripe rate limiter out of the picture entirely.
  for (const tier of PRODUCT_TIERS) {
    entries.push(await ensureTier(stripe, tier));
  }

  cache = { at: Date.now(), entries: new Map(entries.map((e) => [e.tier, e])) };
  return entries;
}

/**
 * Cached catalogue for request paths. Never throws: if Stripe is unreachable or
 * unconfigured, callers fall back to the repo's own prices rather than failing
 * the page or the checkout.
 */
export async function getCatalog(): Promise<Map<ProductTier, CatalogEntry> | null> {
  if (!capabilities.stripe) return null;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.entries;

  try {
    await syncCatalog();
    return cache?.entries ?? null;
  } catch (error) {
    console.error('[kdrama] stripe catalog sync failed:', (error as Error).message);
    // Keep serving a stale catalogue if we have one — an expired entry is far
    // better than dropping back to an anonymous line item mid-sale.
    return cache?.entries ?? null;
  }
}

/** The Price to charge for a tier, or null to fall back to an inline amount. */
export async function resolvePriceId(tier: ProductTier): Promise<string | null> {
  const catalog = await getCatalog();
  return catalog?.get(tier)?.priceId ?? null;
}
