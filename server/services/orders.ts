import type Stripe from 'stripe';
import { isArchetypeId, type ArchetypeId } from '../../shared/archetypes.js';
import { isProductTier, PRODUCTS, type ProductTier } from '../../shared/products.js';
import { getDb, type Order } from '../db/index.js';
import { log } from '../env.js';

export type StripeMetadata = Record<string, string | undefined> | null | undefined;

export function metaOf(object: unknown): StripeMetadata {
  return (object as { metadata?: StripeMetadata } | null)?.metadata ?? null;
}

function tierFromAmount(amount: number | null | undefined): ProductTier {
  const match = (Object.keys(PRODUCTS) as ProductTier[]).find(
    (tier) => PRODUCTS[tier].amount === amount,
  );
  return match ?? 'blueprint';
}

/**
 * Finds the order a payment belongs to. Checkout Sessions carry the id in
 * `client_reference_id`; API-created sessions also carry it in metadata. When
 * nothing matches — a Payment Link opened directly, or an in-memory store on a
 * different serverless instance — an order is built from what Stripe gave us so
 * the buyer is still fulfilled.
 *
 * Shared by the webhook and by the success screen's recovery path, which must
 * agree on which order a session maps to or they would fulfil twice.
 */
export async function resolveOrderForPayment(params: {
  orderId?: string;
  stripeSessionId?: string;
  email?: string;
  amount?: number | null;
  metadata: StripeMetadata;
}): Promise<Order | null> {
  const db = await getDb();

  if (params.orderId) {
    const byId = await db.getOrder(params.orderId);
    if (byId) return byId;
  }

  if (params.stripeSessionId) {
    const bySession = await db.getOrderByStripeSession(params.stripeSessionId);
    if (bySession) return bySession;
  }

  if (!params.email) return null;

  const tier = isProductTier(params.metadata?.tier)
    ? params.metadata.tier
    : tierFromAmount(params.amount);
  const archetype: ArchetypeId = isArchetypeId(params.metadata?.winningArchetype)
    ? (params.metadata.winningArchetype as ArchetypeId)
    : 'best_friend';

  const user = await db.upsertUser(params.email);
  log('no matching order; creating one from stripe payload for', params.email);

  return db.createOrder({
    stripeSessionId: params.stripeSessionId ?? null,
    userId: user.id,
    email: params.email,
    productTier: tier,
    amountPaid: params.amount ?? PRODUCTS[tier].amount,
    currency: 'usd',
    status: 'paid',
    downloadUrl: null,
    storageKey: null,
    blueprint: null,
    winningArchetype: archetype,
    quizAttemptId: params.metadata?.quizAttemptId || null,
    failureReason: null,
  });
}

/** The quiz answers Stripe carried through checkout, for personalisation. */
export function answersFromMetadata(metadata: StripeMetadata): {
  answers: ArchetypeId[];
  scoreBreakdown: Record<string, number>;
} {
  const answers = (metadata?.quizAnswers ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(isArchetypeId);

  const scoreBreakdown = answers.reduce<Record<string, number>>((acc, answer) => {
    acc[answer] = (acc[answer] ?? 0) + 1;
    return acc;
  }, {});

  return { answers, scoreBreakdown };
}

/** Narrow helper so both callers read the buyer's address the same way. */
export function emailFromSession(session: Stripe.Checkout.Session): string | undefined {
  return (
    session.customer_details?.email ??
    session.customer_email ??
    metaOf(session)?.userEmail ??
    undefined
  );
}
