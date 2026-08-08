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
  /** Public origin used for redirects, download links and magic links. */
  appUrl: str('APP_URL', str('VERCEL_URL') ? `https://${str('VERCEL_URL')}` : ''),

  stripeSecretKey: str('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: str('STRIPE_WEBHOOK_SECRET'),
  /**
   * Optional Stripe Payment Link per tier. When set, checkout redirects here
   * instead of creating an API Checkout Session — this is the no-code path.
   */
  paymentLinks: {
    blueprint: str('STRIPE_PAYMENT_LINK_BLUEPRINT'),
    bundle: str('STRIPE_PAYMENT_LINK_BUNDLE'),
    coaching: str('STRIPE_PAYMENT_LINK_COACHING'),
  },

  geminiApiKey: str('GEMINI_API_KEY', str('GOOGLE_API_KEY')),
  geminiModel: str('GEMINI_MODEL', 'gemini-2.5-flash'),

  resendApiKey: str('RESEND_API_KEY'),
  mailFrom: str('MAIL_FROM', 'K-Drama Dreams <onboarding@resend.dev>'),
  mailReplyTo: str('MAIL_REPLY_TO'),

  databaseUrl: str('DATABASE_URL'),
  /** Signs download tokens and magic links. Falls back to an ephemeral value. */
  appSecret: str('APP_SECRET', 'dev-only-insecure-secret-change-me'),

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
  get secretConfigured() {
    return env.appSecret !== 'dev-only-insecure-secret-change-me';
  },
};

export function resolveAppUrl(req?: { protocol?: string; get?(h: string): string | undefined }): string {
  if (env.appUrl) return env.appUrl.replace(/\/$/, '');
  const host = req?.get?.('host');
  if (host) {
    const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return `http://localhost:${env.port}`;
}

export function log(...args: unknown[]): void {
  if (env.verboseLogs || env.nodeEnv !== 'production') {
    console.log('[kdrama]', ...args);
  }
}
