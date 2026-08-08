import Stripe from 'stripe';
import { capabilities, env } from '../env.js';
import { PRODUCTS, type ProductTier } from '../../shared/products.js';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!capabilities.stripe) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!client) {
    // No apiVersion override: the installed SDK major and its pinned default
    // API version are tested together, and overriding them can desync types
    // from runtime behaviour.
    client = new Stripe(env.stripeSecretKey, {
      appInfo: { name: 'K-Drama Dreams', version: '2.0.0' },
      maxNetworkRetries: 2,
    });
  }
  return client;
}

export interface CheckoutMetadata {
  tier: ProductTier;
  winningArchetype: string;
  quizAnswers: string;
  quizAttemptId: string;
  userEmail: string;
  orderId: string;
}

/**
 * Stripe caps each metadata value at 500 characters, so long fields are
 * truncated rather than allowed to fail the whole session creation.
 */
function clampMetadata(meta: CheckoutMetadata): Record<string, string> {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, String(value ?? '').slice(0, 500)]),
  );
}

export async function createCheckoutSession(params: {
  tier: ProductTier;
  email?: string;
  metadata: CheckoutMetadata;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const product = PRODUCTS[params.tier];
  const metadata = clampMetadata(params.metadata);

  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: product.currency,
          unit_amount: product.amount,
          product_data: {
            name: product.name,
            description: product.headline,
          },
        },
      },
    ],
    ...(params.email ? { customer_email: params.email } : {}),
    client_reference_id: params.metadata.orderId,
    metadata,
    // Mirrored onto the PaymentIntent so payment_intent.succeeded carries it too.
    payment_intent_data: { metadata },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
  });
}

/**
 * Builds a Payment Link URL for the no-code path. `client_reference_id` is how
 * the webhook ties the payment back to the pending order row.
 */
export function buildPaymentLinkUrl(
  baseUrl: string,
  params: { orderId: string; email?: string },
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('client_reference_id', params.orderId);
  if (params.email) url.searchParams.set('prefilled_email', params.email);
  return url.toString();
}

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
}
