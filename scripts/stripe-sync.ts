/**
 * Creates the Stripe Products and Prices for every tier.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:sync
 *
 * Safe to run as often as you like — anything that already exists is reused
 * exactly as the dashboard has it, never overwritten.
 */
import 'dotenv/config';
import { formatPrice } from '../shared/products.js';
import { capabilities, env } from '../server/env.js';
import { syncCatalog } from '../server/services/catalog.js';

async function main(): Promise<void> {
  if (!capabilities.stripe) {
    console.error('STRIPE_SECRET_KEY is not set. Add it to .env or pass it inline.');
    process.exit(1);
  }

  const live = !env.stripeSecretKey.startsWith('sk_test_');
  console.log(`Syncing catalogue in ${live ? 'LIVE' : 'TEST'} mode…\n`);

  const catalog = await syncCatalog();

  for (const entry of catalog) {
    const state = entry.createdProduct
      ? 'created'
      : entry.createdPrice
        ? 'new price'
        : 'already existed';
    console.log(
      `  ${entry.tier.padEnd(10)} ${formatPrice(entry.amount, entry.currency).padEnd(6)} ` +
        `${entry.productId}  ${entry.priceId}  (${state})`,
    );
  }

  console.log(
    `\nDone. Edit them at https://dashboard.stripe.com/${live ? '' : 'test/'}products`,
  );
}

main().catch((error: unknown) => {
  console.error('\nSync failed:', (error as Error).message);
  process.exit(1);
});
