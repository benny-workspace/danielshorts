import { Router, raw } from 'express';
import type Stripe from 'stripe';
import { isArchetypeId, type ArchetypeId } from '../../shared/archetypes.js';
import { isProductTier, PRODUCTS, type ProductTier } from '../../shared/products.js';
import { getDb, type Order } from '../db/index.js';
import { capabilities, log, resolveAppUrl } from '../env.js';
import { asyncRoute } from '../lib/http.js';
import { fulfillOrder } from '../services/fulfillment.js';
import { constructWebhookEvent } from '../services/stripe.js';

export const webhookRouter = Router();

type StripeMetadata = Record<string, string | undefined> | null | undefined;

function metaOf(object: unknown): StripeMetadata {
  return (object as { metadata?: StripeMetadata } | null)?.metadata ?? null;
}

function tierFromAmount(amount: number | null | undefined): ProductTier {
  const match = (Object.keys(PRODUCTS) as ProductTier[]).find(
    (tier) => PRODUCTS[tier].amount === amount,
  );
  return match ?? 'blueprint';
}

/**
 * Finds the order this payment belongs to. Checkout Sessions carry the id in
 * `client_reference_id`; API-created sessions also carry it in metadata. When
 * nothing matches (e.g. a Payment Link opened without going through our
 * checkout endpoint) an order is created from what Stripe gave us so the buyer
 * is still fulfilled.
 */
async function resolveOrder(params: {
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
  log('no matching order; creating one from webhook payload for', params.email);

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

async function handlePaidEvent(
  order: Order,
  metadata: StripeMetadata,
  appUrl: string,
  amount?: number | null,
): Promise<void> {
  const db = await getDb();

  await db.updateOrder(order.id, {
    status: 'paid',
    ...(amount ? { amountPaid: amount } : {}),
  });

  const answers = (metadata?.quizAnswers ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(isArchetypeId);

  const scoreBreakdown = answers.reduce<Record<string, number>>((acc, answer) => {
    acc[answer] = (acc[answer] ?? 0) + 1;
    return acc;
  }, {});

  await fulfillOrder({
    orderId: order.id,
    appUrl,
    answers: answers.length ? answers : undefined,
    scoreBreakdown: answers.length ? scoreBreakdown : undefined,
  });
}

/**
 * Stripe signs the exact bytes it sent, so this route must see the raw body.
 * `express.raw` is mounted here only — the JSON parser is applied after this
 * router in app.ts.
 */
webhookRouter.post(
  '/stripe',
  raw({ type: 'application/json', limit: '1mb' }),
  asyncRoute(async (req, res) => {
    if (!capabilities.stripeWebhooks) {
      res.status(503).json({
        error:
          'Webhooks are not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
        code: 'webhooks_unconfigured',
      });
      return;
    }

    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(payload, signature);
    } catch (error) {
      console.error('[kdrama] webhook signature verification failed:', (error as Error).message);
      res.status(400).json({ error: `Webhook signature verification failed` });
      return;
    }

    // Acknowledge before fulfilling: Stripe retries on timeout, and fulfilment
    // is idempotent, so a slow PDF render must not turn into a duplicate event.
    res.json({ received: true, type: event.type });

    const appUrl = resolveAppUrl(req);

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.payment_status !== 'paid') {
            log('checkout.session.completed but not paid, ignoring:', session.id);
            return;
          }
          const metadata = metaOf(session);
          const order = await resolveOrder({
            orderId: session.client_reference_id ?? metadata?.orderId,
            stripeSessionId: session.id,
            email:
              session.customer_details?.email ??
              session.customer_email ??
              metadata?.userEmail,
            amount: session.amount_total,
            metadata,
          });
          if (!order) {
            console.error('[kdrama] could not resolve order for session', session.id);
            return;
          }
          const db = await getDb();
          if (!order.stripeSessionId) {
            await db.updateOrder(order.id, { stripeSessionId: session.id });
          }
          await handlePaidEvent(order, metadata, appUrl, session.amount_total);
          return;
        }

        case 'payment_intent.succeeded': {
          const intent = event.data.object as Stripe.PaymentIntent;
          const metadata = metaOf(intent);
          // Checkout flows also emit checkout.session.completed; fulfilment is
          // idempotent, so whichever lands first wins and the other no-ops.
          const order = await resolveOrder({
            orderId: metadata?.orderId,
            email: intent.receipt_email ?? metadata?.userEmail,
            amount: intent.amount_received || intent.amount,
            metadata,
          });
          if (!order) {
            log('payment_intent.succeeded with no resolvable order:', intent.id);
            return;
          }
          await handlePaidEvent(order, metadata, appUrl, intent.amount_received);
          return;
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          const metadata = metaOf(charge);
          if (!metadata?.orderId) return;
          const db = await getDb();
          await db.updateOrder(metadata.orderId, { status: 'refunded' });
          return;
        }

        default:
          log('unhandled stripe event:', event.type);
      }
    } catch (error) {
      console.error('[kdrama] webhook handler error:', (error as Error).message);
    }
  }),
);
