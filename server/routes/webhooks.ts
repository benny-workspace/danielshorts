import { Router, raw } from 'express';
import type Stripe from 'stripe';
import { getDb, type Order } from '../db/index.js';
import { capabilities, log, resolveAppUrl } from '../env.js';
import { asyncRoute } from '../lib/http.js';
import { fulfillOrder } from '../services/fulfillment.js';
import {
  answersFromMetadata,
  emailFromSession,
  metaOf,
  resolveOrderForPayment,
  type StripeMetadata,
} from '../services/orders.js';
import { constructWebhookEvent } from '../services/stripe.js';

export const webhookRouter = Router();

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

  const { answers, scoreBreakdown } = answersFromMetadata(metadata);

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
          const order = await resolveOrderForPayment({
            orderId: session.client_reference_id ?? metadata?.orderId,
            stripeSessionId: session.id,
            email: emailFromSession(session),
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
          const order = await resolveOrderForPayment({
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
