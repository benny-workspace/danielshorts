import { Router } from 'express';
import { isArchetypeId, type ArchetypeId } from '../../shared/archetypes.js';
import { isProductTier, PRODUCTS } from '../../shared/products.js';
import { scoreQuiz } from '../../shared/questions.js';
import { getDb } from '../db/index.js';
import { capabilities, env, log, resolveAppUrl } from '../env.js';
import { asyncRoute, badRequest, optionalString, parseEmail, rateLimit } from '../lib/http.js';
import { idsForOrder, track } from '../services/analytics.js';
import { resolvePriceId } from '../services/catalog.js';
import { recoverOrderFromSession } from '../services/orders.js';
import { buildPaymentLinkUrl, createCheckoutSession } from '../services/stripe.js';

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

    // Optional: the browser passes the ids it is already tracking with, so the
    // server-side half of the funnel lines up with the client-side half.
    const visitorId = optionalString(req.body?.visitorId, 64);
    const sessionId = optionalString(req.body?.sessionId, 64);
    const visitorIds = visitorId && sessionId ? { visitorId, sessionId } : {};

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

      // Recorded here rather than in the browser because this is the moment
      // that actually matters: the buyer reached a working payment page. A
      // click that failed to open checkout is a click, never a session — which
      // is exactly the gap worth being able to see.
      await track({
        name: 'checkout_session',
        ...idsForOrder(order.id),
        // The browser's own ids when it sent them, so the click and the session
        // belong to one person in the funnel rather than two.
        ...visitorIds,
        tier,
        archetype,
        value: product.amount,
      });

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
    const sessionId = optionalString(req.query.session_id, 96);

    let order = await db.getOrder(String(req.params.id));

    // Fall back to Stripe when the order is unknown here, or known but still
    // waiting on a webhook that may never reach this instance.
    if (sessionId && (!order || order.status === 'pending' || !order.downloadUrl)) {
      try {
        order = (await recoverOrderFromSession(sessionId, resolveAppUrl(req))) ?? order;
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
