import 'dotenv/config';

function str(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: Number(str('PORT', '3000')),
  /**
   * Explicit public origin. Left empty unless APP_URL is set — deliberately
   * NOT derived from VERCEL_URL, which is the per-deployment hostname
   * (danielshorts-kq5vcl1f2-….vercel.app) rather than the stable domain, and
   * would bake a throwaway host into emailed download links.
   */
  appUrl: str('APP_URL'),
  /** Vercel's stable production domain, used as a last-resort fallback. */
  productionUrl: str('VERCEL_PROJECT_PRODUCTION_URL'),

  stripeSecretKey: str('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: str('STRIPE_WEBHOOK_SECRET'),
  /**
   * Stripe tax code for the digital products, e.g. `txcd_10000000`.
   *
   * Opt-in, and deliberately not defaulted: it decides how tax is calculated
   * and remitted on every sale, which is the seller's call, not a guess this
   * code should make. Setting it puts each product in that class and lets
   * Managed Payments run; leaving it empty turns Managed Payments off per
   * session so ordinary Checkout works and tax stays the seller's own
   * responsibility.
   */
  stripeTaxCode: str('STRIPE_TAX_CODE'),
  /**
   * Optional Stripe Payment Link per tier. When set, checkout redirects here
   * instead of creating an API Checkout Session — this is the no-code path.
   */
  paymentLinks: {
    blueprint: str('STRIPE_PAYMENT_LINK_BLUEPRINT'),
    bundle: str('STRIPE_PAYMENT_LINK_BUNDLE'),
    coaching: str('STRIPE_PAYMENT_LINK_COACHING'),
  },

  /**
   * Share link to the Notion planner delivered with the top tier. Kept in the
   * environment rather than in the repo: this repository is public, and the
   * link is the product — committing it would hand it out for free.
   */
  notionTemplateUrl: str('NOTION_TEMPLATE_URL'),

  geminiApiKey: str('GEMINI_API_KEY', str('GOOGLE_API_KEY')),
  geminiModel: str('GEMINI_MODEL', 'gemini-2.5-flash'),

  resendApiKey: str('RESEND_API_KEY'),
  mailFrom: str('MAIL_FROM', 'K-Drama Dreams <onboarding@resend.dev>'),
  mailReplyTo: str('MAIL_REPLY_TO'),

  databaseUrl: str('DATABASE_URL'),
  /** Signs download tokens and magic links. Falls back to an ephemeral value. */
  appSecret: str('APP_SECRET', 'dev-only-insecure-secret-change-me'),
  /**
   * Opens the /admin dashboard. There is no default: unset means the dashboard
   * refuses every login rather than shipping a guessable one, which matters
   * because this repository is public.
   *
   * Note this is a password to type, and quite separate from APP_SECRET above,
   * which is a signing key nobody ever types. `ADMIN_PASSWORD` is accepted as
   * an alias so either name works.
   */
  adminPassword: str('APP_SECRET_PW', str('ADMIN_PASSWORD')),

  storageBucketUrl: str('STORAGE_BUCKET_URL'),
  /** Where generated PDFs land when no bucket is configured. */
  localStorageDir: str('LOCAL_STORAGE_DIR', '.data/files'),

  downloadTtlHours: Number(str('DOWNLOAD_TTL_HOURS', '72')),
  verboseLogs: bool('VERBOSE_LOGS', false),
};

/**
 * Which optional integrations are wired up. The app runs with all of these
 * false — every route falls back to a local, keyless implementation — so a
 * fresh clone works before any credentials exist.
 */
export const capabilities = {
  get stripe() {
    return Boolean(env.stripeSecretKey);
  },
  get stripeWebhooks() {
    return Boolean(env.stripeSecretKey && env.stripeWebhookSecret);
  },
  get paymentLinks() {
    return Object.values(env.paymentLinks).some(Boolean);
  },
  get gemini() {
    return Boolean(env.geminiApiKey);
  },
  get email() {
    return Boolean(env.resendApiKey);
  },
  get postgres() {
    return Boolean(env.databaseUrl);
  },
  get notionTemplate() {
    return Boolean(env.notionTemplateUrl);
  },
  /**
   * Whether the configured Stripe key takes real money. Test keys are prefixed
   * `sk_test_`; everything else (including restricted `rk_live_` keys) is live.
   */
  get stripeLiveMode() {
    return Boolean(env.stripeSecretKey) && !env.stripeSecretKey.startsWith('sk_test_');
  },
  /**
   * Resend's shared onboarding sender only delivers to the account owner's own
   * address. It is fine for a smoke test and useless for customers, which is a
   * difference no other signal in the app would reveal.
   */
  get mailFromIsShared() {
    return /@resend\.dev\b/i.test(env.mailFrom);
  },
  get secretConfigured() {
    return env.appSecret !== 'dev-only-insecure-secret-change-me';
  },
  /**
   * The dashboard needs both: a password to check, and a real APP_SECRET to
   * sign the resulting session with. Signing an admin cookie with the published
   * development secret would let anyone who read the source mint one.
   */
  get adminDashboard() {
    return Boolean(env.adminPassword) && capabilities.secretConfigured;
  },
};

/**
 * The origin to build user-facing links from, most-specific first: an explicit
 * APP_URL, then the host the request actually arrived on (so links match the
 * domain the reader is using), then Vercel's stable production domain.
 */
export function resolveAppUrl(req?: {
  protocol?: string;
  get?(h: string): string | undefined;
}): string {
  if (env.appUrl) return env.appUrl.replace(/\/$/, '');

  const host = req?.get?.('host');
  if (host) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    return `${local ? 'http' : 'https'}://${host}`;
  }

  if (env.productionUrl) return `https://${env.productionUrl}`;
  return `http://localhost:${env.port}`;
}

export function log(...args: unknown[]): void {
  if (env.verboseLogs || env.nodeEnv !== 'production') {
    console.log('[kdrama]', ...args);
  }
}
