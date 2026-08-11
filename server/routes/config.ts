import { Router } from 'express';
import { PRODUCTS, PRODUCT_TIERS } from '../../shared/products.js';
import { getActiveDriver, getDb } from '../db/index.js';
import { capabilities, env } from '../env.js';
import { asyncRoute } from '../lib/http.js';
import { getCatalog } from '../services/catalog.js';

export const configRouter = Router();

/**
 * Public capability report. The client uses it to decide whether to show
 * checkout buttons, the AI teaser, and the sign-in entry point — so a missing
 * key degrades the UI instead of producing a dead button.
 *
 * Only booleans are exposed here; no key material or endpoints.
 */
configRouter.get(
  '/',
  asyncRoute(async (_req, res) => {
    // Prices come from Stripe when the catalogue is reachable, so re-pricing a
    // product in the dashboard updates the site without a deploy. Marketing
    // copy stays in the repo, where it is written against the layout.
    const catalog = await getCatalog();

    res.json({
      products: PRODUCT_TIERS.map((tier) => {
        const product = PRODUCTS[tier];
        const live = catalog?.get(tier);
        return {
          tier,
          name: product.name,
          headline: product.headline,
          kicker: product.kicker,
          amount: live?.amount ?? product.amount,
          currency: live?.currency ?? product.currency,
          description: product.description,
          deliverables: product.deliverables,
          badge: product.badge ?? null,
          available: capabilities.stripe || Boolean(env.paymentLinks[tier]),
        };
      }),
      features: {
        checkout: capabilities.stripe || capabilities.paymentLinks,
        checkoutMode: capabilities.stripe
          ? 'stripe_checkout'
          : capabilities.paymentLinks
            ? 'payment_link'
            : 'disabled',
        fulfillmentReady: capabilities.stripeWebhooks,
        ai: capabilities.gemini,
        email: capabilities.email,
        accounts: capabilities.email,
        persistence: true,
      },
    });
  }),
);

/**
 * Splits configuration problems by whether they would actually cost a sale.
 *
 * `warnings` are things that break a paying customer's experience; `advisories`
 * are real but survivable. Keeping them apart is what makes `readyToSell`
 * worth reading — a flag that stays false over a missing nice-to-have is a
 * flag nobody looks at twice.
 */
function readiness(): { warnings: string[]; advisories: string[] } {
  const warnings: string[] = [];
  const advisories: string[] = [];

  if (capabilities.stripe && !capabilities.stripeLiveMode) {
    warnings.push(
      'Stripe is in TEST mode. Real cards are declined, and test mode has its own separate product catalogue.',
    );
  }
  if (capabilities.stripe && !capabilities.stripeWebhooks) {
    warnings.push(
      'STRIPE_WEBHOOK_SECRET is missing. Payments will succeed and nothing will be generated or delivered.',
    );
  }
  if (!capabilities.secretConfigured) {
    warnings.push(
      'APP_SECRET is unset, so download links are signed with the development default. Set it before selling.',
    );
  }
  if (capabilities.email && capabilities.mailFromIsShared) {
    warnings.push(
      'MAIL_FROM uses Resend’s shared onboarding sender, which only delivers to your own account address. Verify a domain, or customers receive nothing.',
    );
  }
  if (!capabilities.email) {
    warnings.push('RESEND_API_KEY is missing. Orders still fulfil, but nothing is emailed.');
  }
  // Not a warning: the success screen and the download link both re-verify the
  // purchase against Stripe, so delivery no longer depends on a shared store.
  // It does, however, decide whether the /admin funnel numbers are real.
  if (!capabilities.postgres) {
    advisories.push(
      'No DATABASE_URL. Purchases are recovered from Stripe so downloads still work, but order history, sign-in and the /admin funnel counts will be empty or badly undercounted.',
    );
  }
  if (!capabilities.adminDashboard) {
    advisories.push(
      env.adminPassword
        ? 'The /admin dashboard is closed because APP_SECRET is unset — an admin session cannot be signed securely without it.'
        : 'APP_SECRET_PW is not set, so the /admin dashboard refuses every login.',
    );
  }

  return { warnings, advisories };
}

/** Operational readiness, for the deploy checklist and uptime pings. */
configRouter.get(
  '/health',
  asyncRoute(async (_req, res) => {
    let database = 'ok';
    try {
      await getDb();
    } catch (error) {
      database = (error as Error).message;
    }

    const { warnings, advisories } = readiness();

    res.json({
      status: 'ok',
      /** True when nothing left would fail a paying customer. */
      readyToSell: warnings.length === 0,
      warnings,
      advisories,
      stripeMode: capabilities.stripe ? (capabilities.stripeLiveMode ? 'live' : 'test') : null,
      env: env.nodeEnv,
      database: { driver: getActiveDriver(), status: database },
      integrations: {
        stripe: capabilities.stripe,
        stripeWebhooks: capabilities.stripeWebhooks,
        paymentLinks: capabilities.paymentLinks,
        gemini: capabilities.gemini,
        email: capabilities.email,
        postgres: capabilities.postgres,
        notionTemplate: capabilities.notionTemplate,
        appSecret: capabilities.secretConfigured,
        adminDashboard: capabilities.adminDashboard,
      },
    });
  }),
);
