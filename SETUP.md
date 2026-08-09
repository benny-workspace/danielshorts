# Setup guide

Everything below is optional. **The site already works and deploys with zero
keys** — the quiz, result, dream scene, compatibility, favourites and share card
all run today. Each section here switches on one more capability.

Check what is currently live at any time:

```
https://danielshorts.vercel.app/api/config/health
```

It returns a JSON object with a `true`/`false` for every integration. Use it
after each step below to confirm the key actually landed.

---

## Order to do things in

| # | Step | Time | What it unlocks |
|---|------|------|-----------------|
| 1 | [`APP_SECRET`](#1-app_secret-required-in-production) | 1 min | Secure download links (**do this first**) |
| 2 | [Stripe](#2-stripe-payments) | 20 min | Taking money |
| 3 | [Stripe webhook](#3-stripe-webhook-required-for-delivery) | 10 min | **Automatic delivery** |
| 4 | [Resend](#4-resend-email) | 10 min | Emailing the PDF + sign-in |
| 5 | [Gemini](#5-gemini-ai-personalisation) | 5 min | AI-written blueprints |
| 6 | [Database](#6-database-supabase-postgres) | 15 min | Orders surviving restarts |
| 7 | [`NOTION_TEMPLATE_URL`](#7-notion_template_url-the-5-product) | 2 min | Delivering the $5 planner |

Steps 2 and 3 together are what turn this into a business. Everything else is
polish.

---

## Going live

A `sk_test_` key means **no real customer can pay you** — Stripe only accepts
test cards, and test mode has its own separate product catalogue. Switching to
live is four variables:

| Variable | Why it blocks you |
|---|---|
| `STRIPE_SECRET_KEY` (the `sk_live_` one) | Test keys cannot take real money |
| `STRIPE_WEBHOOK_SECRET` | **Without it, payments succeed and nothing is delivered** |
| `APP_SECRET` | Download links fall back to a value published in this repo |
| `RESEND_API_KEY` | Nothing gets emailed; buyers only see the success screen |
| `MAIL_FROM` | The default sender only delivers to **your own** address (see step 4) |

`DATABASE_URL` is not strictly required but matters more than it looks in
production: without it each serverless instance keeps its own memory, so the
success screen can poll an instance that has never heard of the order. See
step 6.

The live product catalogue (`kdd_blueprint`, `kdd_bundle`, `kdd_coaching`) and
the live webhook endpoint pointing at `/api/webhooks/stripe` already exist.
Confirm everything landed:

```
https://danielshorts.vercel.app/api/config/health
```

That endpoint answers the question directly:

```json
{ "readyToSell": true, "stripeMode": "live", "warnings": [] }
```

`readyToSell` is only `true` when nothing left in `warnings` would silently
fail a paying customer — a missing webhook secret, a test-mode key, a sender
address that cannot reach anyone but you. Read the warnings; they name the
variable to fix.

---

## How to add an environment variable on Vercel

You will do this several times, so here it is once:

1. Go to <https://vercel.com/benny-workspaces-projects-38ae841b/danielshorts/settings/environment-variables>
2. **Key** = the name (e.g. `STRIPE_SECRET_KEY`), **Value** = the value
3. Tick **Production**, **Preview** and **Development**
4. Save
5. Go to **Deployments** → the latest one → **⋯** → **Redeploy**

> Environment variables only apply to *new* deployments. If you add a key and
> nothing changes, you skipped the redeploy.

For local development, put the same keys in a `.env` file in the project root
(copy `.env.example` to `.env`). That file is gitignored — never commit it.

---

## 1. `APP_SECRET` (required in production)

This signs your download links and sign-in sessions. Without it the app falls
back to a well-known development value, which means **anyone could forge a
download link**.

Generate one:

```bash
openssl rand -base64 32
```

Add it as `APP_SECRET`. That is the whole step.

> Changing this later invalidates all existing download links and signs
> everyone out. Set it once and leave it.

---

## 2. Stripe (payments)

There are two ways to do this. **I recommend Path A.**

### Path A — API key (recommended)

The app creates the checkout page itself, which means the buyer's quiz answers
travel with the payment automatically. That is what makes the PDF personalised.

1. Go to <https://dashboard.stripe.com/apikeys>
2. Copy the **Secret key** (starts with `sk_test_` in test mode, `sk_live_` in live mode)
3. Add it to Vercel as `STRIPE_SECRET_KEY`
4. Redeploy

You do **not** need to create the products by hand — the app does it for you.
See [your product catalogue](#your-product-catalogue) below.

Start in **test mode**. Stripe's test card is `4242 4242 4242 4242`, any future
expiry, any CVC. Switch to the `sk_live_` key when you are happy.

> The secret key is a password to your money. Never paste it into a chat, a
> commit, or a screenshot. It only ever goes in Vercel's environment variables.
> The publishable key (`pk_...`) is safe to share but this app does not need it.

### Path B — Payment Links (no code, but limited)

Use this if you would rather build the products by hand in Stripe's dashboard.

1. Go to <https://dashboard.stripe.com/products> → **Add product**
2. Create three products, one-time payment:

   | Product name | Price |
   |---|---|
   | Romantic Blueprint | $2.00 |
   | Premium Bundle | $3.00 |
   | The Aesthetic Planner Bundle | $5.00 |

3. On each product click **Create payment link**
4. In the link's settings, turn **on** "Collect customer's email address"
5. Copy each URL and add them to Vercel:

   ```
   STRIPE_PAYMENT_LINK_BLUEPRINT = https://buy.stripe.com/...
   STRIPE_PAYMENT_LINK_BUNDLE    = https://buy.stripe.com/...
   STRIPE_PAYMENT_LINK_COACHING  = https://buy.stripe.com/...
   ```

6. Redeploy

The app still creates an order first and appends `client_reference_id` to the
link, so the webhook can match the payment back to the right quiz answers.

**Path B trade-offs:** you maintain prices in two places, and if a buyer opens
the payment link directly (rather than through the site) there are no quiz
answers attached — they still get a blueprint, just a generic one for the
default archetype.

If you set `STRIPE_SECRET_KEY`, it wins and the payment links are ignored. That
is intentional: you can set up Path B now and upgrade to Path A later without
deleting anything.

### Your product catalogue

On Path A, the app keeps three real products in your Stripe dashboard — not
anonymous one-off charges. That means each sale is attributed to a product, you
get per-product reporting, and **you can edit them by hand**.

| Product ID | Tier | Default price |
|---|---|---|
| `kdd_blueprint` | Romantic Blueprint | $2.00 |
| `kdd_bundle` | Premium Bundle | $3.00 |
| `kdd_coaching` | The Aesthetic Planner Bundle | $5.00 |

They are created automatically the first time anyone loads the site after you
add `STRIPE_SECRET_KEY`. To create them right now instead of waiting:

```bash
curl -X POST https://danielshorts.vercel.app/api/admin/stripe/sync \
  -H "Authorization: Bearer YOUR_APP_SECRET"
```

(Or locally: `STRIPE_SECRET_KEY=sk_... npm run stripe:sync`.)

Either way it is safe to run repeatedly — anything that already exists is reused
exactly as you left it.

**Editing your products.** Once a product exists, Stripe is the boss. Change the
name, description or image at <https://dashboard.stripe.com/products> and the
app will never overwrite you — it only ever creates what is missing.

**Changing a price.** Stripe prices are immutable, so you replace rather than
edit. On the product, add a new price, then set its **lookup key** to the same
one the old price had (`kdd_blueprint`, `kdd_bundle` or `kdd_coaching`), ticking
the option to transfer the key. The site picks it up within five minutes — no
deploy needed, and the new amount shows on the pricing cards automatically.

> The names and descriptions shown *on the site* still come from
> `shared/products.ts`, because that copy is written to fit the layout. Your
> Stripe copy is what buyers see on the Stripe checkout page and their receipt.
> Prices are read from Stripe in both places.

---

## 3. Stripe webhook (required for delivery)

**Without this, payments succeed and nothing gets delivered.** This is the step
people skip. Do not skip it.

1. Go to <https://dashboard.stripe.com/webhooks> → **Add endpoint**
2. **Endpoint URL**:

   ```
   https://danielshorts.vercel.app/api/webhooks/stripe
   ```

3. **Events to send** — select these three:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `charge.refunded`
4. Save, then click **Reveal** under *Signing secret* and copy it (`whsec_...`)
5. Add to Vercel as `STRIPE_WEBHOOK_SECRET`
6. Redeploy

Verify: make a test purchase. In the Stripe dashboard the webhook attempt should
show `200`. On the site you should land on a "Writing your blueprint" panel that
turns into a download button within a few seconds.

> Do this once for **test mode** and again for **live mode** — they are separate
> endpoints with different signing secrets.

### Testing webhooks locally

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

That prints a temporary `whsec_...` for your local `.env`.

---

## 4. Resend (email)

Turns on the fulfilment email (with the PDF attached), the result email, and
magic-link sign-in.

1. Sign up at <https://resend.com> and go to **API Keys** → **Create**
2. Add it to Vercel as `RESEND_API_KEY`
3. Redeploy

Out of the box this sends from `onboarding@resend.dev`, which only delivers to
your own address. To email real customers you must verify a domain:

1. Resend → **Domains** → **Add Domain**
2. Add the DNS records they give you at your registrar
3. Once verified, set `MAIL_FROM` to something like
   `K-Drama Dreams <hello@yourdomain.com>`

Optionally set `MAIL_REPLY_TO` to the inbox you actually read.

**Until a domain is verified, customers will not receive emails.** Downloads
still work — the buyer gets the link on screen after paying — but plan on doing
this before running ads.

---

## 5. Gemini (AI personalisation)

Without it, blueprints use the built-in written fallback, which is a complete
product on its own. With it, the copy is rewritten around each reader's specific
answers.

1. Get a key at <https://aistudio.google.com/apikey>
2. Add to Vercel as `GEMINI_API_KEY`
3. Redeploy

The model is `gemini-2.5-flash` (override with `GEMINI_MODEL`). The key is
server-side only and is never sent to the browser. If a generation fails or
times out, the fallback is used automatically — a bad API key can never break a
purchase.

---

## 6. Database (Supabase Postgres)

Without it, an in-memory store is used. That works fine, but on Vercel each
serverless instance has its own memory, so **order history and sign-in do not
survive**. Downloads still work because the emailed link is self-contained.

Add this when you start caring about customer records.

1. Create a project at <https://supabase.com/dashboard>
2. **Project Settings → Database → Connection string → Session pooler**
3. Copy the URI and replace `[YOUR-PASSWORD]` with your database password
4. Add to Vercel as `DATABASE_URL`
5. Redeploy

The schema (`server/db/schema.ts`) applies itself on first boot — no migration
step. It creates `users`, `quiz_attempts`, `orders`, and `saved_favorites`, with
row-level security on and no public policies, since all access goes through the
server.

If the connection string is wrong, the app logs a warning and falls back to the
in-memory store rather than going down.

### Optional: archive PDFs to storage

Downloads re-render the PDF from the database, so this is purely a backup.

1. Supabase → **Storage** → **New bucket** named `blueprints` (private)
2. Add to Vercel:

   ```
   STORAGE_BUCKET_URL       = https://<project-ref>.supabase.co/storage/v1/object/blueprints
   SUPABASE_SERVICE_ROLE_KEY = <service_role key from Project Settings → API>
   ```

---

## 7. `NOTION_TEMPLATE_URL` (the $5 product)

The top tier delivers your **Aesthetic Planner Bundle** Notion template. The app
needs the share link to hand it over.

1. Open the template in Notion
2. **Share** → **Publish** (or **Share to web**), then **Copy link**
3. Add it to Vercel as `NOTION_TEMPLATE_URL`
4. Redeploy

Once set, buyers of the $5 tier get the link in three places: the fulfilment
email, the success screen after checkout, and their order history when signed in.

> **This link is not in the repository, on purpose.** This repo is public, and
> the link *is* the product — committing it would hand it out for free. Keep it
> in the environment only.

Two things worth doing in Notion so buyers can actually keep their copy:

- Turn **on** "Allow duplicate as template" in the share settings, otherwise
  they can read it but not save their own copy.
- Turn **off** comments and editing, so one buyer cannot change what the next
  one receives.

Without this variable, the tier still sells and still delivers the PDF — the
planner section is simply left out of the email rather than sending a dead link.

---

## Local development

```bash
npm install
cp .env.example .env      # then fill in what you have
npm run dev               # http://localhost:3000
```

One server handles both the API and the frontend, so there is no CORS or proxy
setup. Other commands:

```bash
npm run lint     # typecheck everything
npm run build    # production client + bundled server
npm start        # run the production build locally
```

---

## Troubleshooting

**"Checkout is not connected yet" on the product cards**
No `STRIPE_SECRET_KEY` and no payment links, or you added them but did not
redeploy. Check `/api/config/health`.

**No products showing in my Stripe dashboard**
They are created on first use, so nothing appears until someone loads the site
after `STRIPE_SECRET_KEY` was added. Force it now with the `curl` in
[your product catalogue](#your-product-catalogue). Also check you are looking at
the right mode — a `sk_test_` key creates them under **Test mode**, which is a
separate catalogue from live.

**I changed a price in Stripe but the site shows the old one**
Either the new price is missing the lookup key (see
[your product catalogue](#your-product-catalogue)), or you are inside the
five-minute cache. Wait it out, or redeploy to clear it immediately.

**Buyers of the $5 tier get no planner link**
`NOTION_TEMPLATE_URL` is not set — see step 7. Confirm with
`/api/config/health`, which reports `notionTemplate: true` once it is live.

**Payment worked, no email, no download**
`STRIPE_WEBHOOK_SECRET` is missing or wrong — see step 3. In the Stripe
dashboard, open the webhook endpoint and look at recent deliveries. A `400`
means the signing secret does not match; a `503` means it is not set at all.

**Emails not arriving**
Either `RESEND_API_KEY` is missing, or you are still on `onboarding@resend.dev`,
which only delivers to your own Resend account address. Verify a domain.

**Order history empty after signing in**
Expected without `DATABASE_URL` — serverless instances do not share memory.

**Download link says expired**
They last `DOWNLOAD_TTL_HOURS` (default 72). Raise it, or have the customer
reply to their receipt.

**Korean text missing from the PDF**
Known limitation. PDFKit's built-in fonts cannot render Hangul, so it is
stripped from the PDF rather than printed as boxes. The Korean line still shows
on the website. Fixing it means embedding a Korean TTF (e.g. Noto Sans KR) and
registering it in `server/services/pdf.ts`.
