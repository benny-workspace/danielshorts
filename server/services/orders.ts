import type Stripe from 'stripe';
import { isArchetypeId, type ArchetypeId } from '../../shared/archetypes.js';
import { isProductTier, PRODUCTS, type ProductTier } from '../../shared/products.js';
import { getDb, type Order } from '../db/index.js';
import { capabilities, log } from '../env.js';
import { fulfillOrder } from './fulfillment.js';
import { getStripe } from './stripe.js';

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

/**
 * Rebuilds and fulfils an order from its Stripe Checkout Session.
 *
 * This is what lets the paid flow survive without a shared database. Each
 * serverless instance keeps its own in-memory store, so the instance handling
 * the success poll — or the later download click — may never have seen the
 * order. Rather than fail the buyer, it asks Stripe, which is the authority on
 * whether the money actually arrived.
 *
 * Safe because the session id only ever reaches the buyer, in their own
 * redirect URL or inside their signed download token, and an unpaid session
 * returns null. Fulfilment is idempotent, so repeat calls return the existing
 * work instead of regenerating it.
 */
export async function recoverOrderFromSession(
  sessionId: string,
  appUrl: string,
): Promise<Order | null> {
  if (!capabilities.stripe) return null;

  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') {
    log('recovery attempted for an unpaid session:', sessionId);
    return null;
  }

  const metadata = metaOf(session);
  const order = await resolveOrderForPayment({
    orderId: session.client_reference_id ?? metadata?.orderId,
    stripeSessionId: session.id,
    email: emailFromSession(session),
    amount: session.amount_total,
    metadata,
  });
  if (!order) return null;

  if (order.status === 'fulfilled' && order.downloadUrl) return order;

  const { answers, scoreBreakdown } = answersFromMetadata(metadata);
  const result = await fulfillOrder({
    orderId: order.id,
    appUrl,
    answers: answers.length ? answers : undefined,
    scoreBreakdown: answers.length ? scoreBreakdown : undefined,
  });

  return result?.order ?? null;
}
