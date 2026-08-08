import { Router } from 'express';
import { isArchetypeId, type ArchetypeId } from '../../shared/archetypes';
import { isProductTier, PRODUCTS } from '../../shared/products';
import { scoreQuiz } from '../../shared/questions';
import { getDb } from '../db';
import { capabilities, env, log, resolveAppUrl } from '../env';
import { asyncRoute, badRequest, optionalString, parseEmail, rateLimit } from '../lib/http';
import { buildPaymentLinkUrl, createCheckoutSession } from '../services/stripe';

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
      const session = await createCheckoutSession({
        tier,
        email,
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

/** Polled by the success screen while the webhook finishes fulfilment. */
checkoutRouter.get(
  '/order/:id',
  asyncRoute(async (req, res) => {
    const db = await getDb();
    const order = await db.getOrder(String(req.params.id));
    if (!order) {
      res.status(404).json({ error: 'Order not found', code: 'not_found' });
      return;
    }

    res.json({
      id: order.id,
      status: order.status,
      productTier: order.productTier,
      amountPaid: order.amountPaid,
      currency: order.currency,
      winningArchetype: order.winningArchetype,
      // Only exposed once fulfilment has actually completed.
      downloadUrl: order.status === 'fulfilled' ? order.downloadUrl : null,
      createdAt: order.createdAt,
    });
  }),
);
