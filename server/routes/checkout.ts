import { Router } from 'express';
import { isArchetypeId, type ArchetypeId } from '../../shared/archetypes.js';
import { isProductTier, PRODUCTS } from '../../shared/products.js';
import { scoreQuiz } from '../../shared/questions.js';
import { getDb, type Order } from '../db/index.js';
import { capabilities, env, log, resolveAppUrl } from '../env.js';
import { asyncRoute, badRequest, optionalString, parseEmail, rateLimit } from '../lib/http.js';
import { resolvePriceId } from '../services/catalog.js';
import { fulfillOrder } from '../services/fulfillment.js';
import {
  answersFromMetadata,
  emailFromSession,
  metaOf,
  resolveOrderForPayment,
} from '../services/orders.js';
import { buildPaymentLinkUrl, createCheckoutSession, getStripe } from '../services/stripe.js';

export const checkoutRouter = Router();

function parseAnswers(value: unknown): ArchetypeId[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isArchetypeId).slice(0, 20);
}

/**
 * Creates a pending order, then hands back wherever the buyer should go:
 * a Stripe Checkout Session when an API key is present, otherwise a configured
 * Payment Link. The order id travels as `client_reference_id` either way, which
 * is what the webhook uses to reconnect the payment to the quiz answers.
 */
checkoutRouter.post(
  '/create-session',
  rateLimit({ windowMs: 60_000, max: 20, key: 'checkout' }),
  asyncRoute(async (req, res) => {
    const { tier, winningArchetype, quizAttemptId } = req.body ?? {};

    if (!isProductTier(tier)) {
      badRequest('Unknown product tier', 'invalid_tier');
    }

    const product = PRODUCTS[tier];
    const email = parseEmail(req.body?.userEmail ?? req.body?.email);
    const name = optionalString(req.body?.name);
    const answers = parseAnswers(req.body?.quizAnswers ?? req.body?.answers);
    const archetype: ArchetypeId = isArchetypeId(winningArchetype)
      ? winningArchetype
      : answers.length
        ? scoreQuiz(answers).winner
        : 'best_friend';

    const db = await getDb();
    const user = await db.upsertUser(email, name);

    // Reuse the attempt saved at result time when the client passes its id.
    let attemptId = optionalString(quizAttemptId, 64);
    if (attemptId && !(await db.getQuizAttempt(attemptId))) attemptId = null;

    if (!attemptId && answers.length) {
      const score = scoreQuiz(answers);
      const attempt = await db.saveQuizAttempt({
        userId: user.id,
        answers,
        winningArchetype: score.winner,
        scoreBreakdown: score.breakdown,
      });
      attemptId = attempt.id;
    }

    const order = await db.createOrder({
      stripeSessionId: null,
      userId: user.id,
      email,
      productTier: tier,
      amountPaid: product.amount,
      currency: product.currency,
      status: 'pending',
      downloadUrl: null,
      storageKey: null,
      blueprint: null,
      winningArchetype: archetype,
      quizAttemptId: attemptId,
      failureReason: null,
    });

    const appUrl = resolveAppUrl(req);
    const successUrl = `${appUrl}/?checkout=success&order=${order.id}`;
    const cancelUrl = `${appUrl}/?checkout=cancelled&order=${order.id}`;

    if (capabilities.stripe) {
      // Creates the catalogue entry on first use, so the products exist in
      // Stripe even if the sync script was never run.
      const priceId = await resolvePriceId(tier);

      const session = await createCheckoutSession({
        tier,
        email,
        priceId,
        metadata: {
          tier,
          winningArchetype: archetype,
          quizAnswers: answers.join(','),
          quizAttemptId: attemptId ?? '',
          userEmail: email,
          orderId: order.id,
        },
        successUrl: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl,
      });

      await db.updateOrder(order.id, { stripeSessionId: session.id });
      log('created stripe checkout session', session.id, 'for order', order.id);

      res.json({
        mode: 'stripe_checkout',
        orderId: order.id,
        sessionId: session.id,
        url: session.url,
      });
      return;
    }

    const paymentLink = env.paymentLinks[tier];
    if (paymentLink) {
      res.json({
        mode: 'payment_link',
        orderId: order.id,
        url: buildPaymentLinkUrl(paymentLink, { orderId: order.id, email }),
      });
      return;
    }

    res.status(503).json({
      mode: 'unconfigured',
      orderId: order.id,
      error:
        'Payments are not connected yet. Add STRIPE_SECRET_KEY, or a Payment Link for this tier, to your environment.',
      code: 'payments_unconfigured',
    });
  }),
);

/**
 * Recovers an order straight from Stripe when the local lookup comes up short.
 *
 * Two things make that necessary. Without a database the store is per-instance
 * memory, so the instance answering this poll may never have seen the order the
 * checkout instance created; and the webhook may simply not have landed yet.
 * Either way the buyer has paid and is sitting on the success screen, so we ask
 * Stripe directly rather than making them wait on an email.
 *
 * The session id is only ever handed to the buyer, in their own redirect URL,
 * and Stripe is the authority on whether it was actually paid — so this cannot
 * be used to mint a download for an unpaid order.
 */
async function recoverFromSession(
  sessionId: string,
  req: Parameters<typeof resolveAppUrl>[0],
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
    appUrl: resolveAppUrl(req),
    answers: answers.length ? answers : undefined,
    scoreBreakdown: answers.length ? scoreBreakdown : undefined,
  });

  return result?.order ?? null;
}

/** Polled by the success screen while the webhook finishes fulfilment. */
checkoutRouter.get(
  '/order/:id',
  asyncRoute(async (req, res) => {
    const db = await getDb();
    const sessionId = optionalString(req.query.session_id, 96);

    let order = await db.getOrder(String(req.params.id));

    // Fall back to Stripe when the order is unknown here, or known but still
    // waiting on a webhook that may never reach this instance.
    if (sessionId && (!order || order.status === 'pending' || !order.downloadUrl)) {
      try {
        order = (await recoverFromSession(sessionId, req)) ?? order;
      } catch (error) {
        log('session recovery failed:', (error as Error).message);
      }
    }

    if (!order) {
      res.status(404).json({ error: 'Order not found', code: 'not_found' });
      return;
    }

    const fulfilled = order.status === 'fulfilled';
    const product = isProductTier(order.productTier) ? PRODUCTS[order.productTier] : null;

    res.json({
      id: order.id,
      status: order.status,
      productTier: order.productTier,
      amountPaid: order.amountPaid,
      currency: order.currency,
      winningArchetype: order.winningArchetype,
      // Only exposed once fulfilment has actually completed.
      downloadUrl: fulfilled ? order.downloadUrl : null,
      // Same gate: the planner link is a paid deliverable, so it is only ever
      // returned for a paid-and-fulfilled order on a tier that includes it.
      templateUrl: fulfilled && product?.deliversTemplate ? env.notionTemplateUrl || null : null,
      createdAt: order.createdAt,
    });
  }),
);
