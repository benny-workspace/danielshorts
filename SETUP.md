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
| 6 | [Database](#6-database-supabase-postgres) | 15 min | Orders surviving restarts + real funnel numbers |
| 7 | [`NOTION_TEMPLATE_URL`](#7-notion_template_url-the-5-product) | 2 min | Delivering the $5 planner |
| 8 | [`APP_SECRET_PW`](#8-app_secret_pw-the-private-dashboard-at-admin) | 1 min | The `/admin` funnel dashboard |

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

`DATABASE_URL` is genuinely optional for taking money. Each serverless instance
keeps its own memory, so an instance may never have heard of a given order —
but both the success screen and the download link carry the Stripe session id
and re-verify the purchase against Stripe, so the buyer still gets their files.
What you lose without it is order *history*: signing in shows an empty library.
See step 6.

The live product catalogue (`kdd_blueprint`, `kdd_bundle`, `kdd_coaching`) and
the live webhook endpoint pointing at `/api/webhooks/stripe` already exist.
Confirm everything landed:

```
https://danielshorts.vercel.app/api/config/health
```

That endpoint answers the question directly:

```json
{ "readyToSell": true, "stripeMode": "live", "warnings": [], "advisories": [] }
```

`readyToSell` is `true` when nothing left in `warnings` would fail a paying
customer — a missing webhook secret, a test-mode key, a sender address that
cannot reach anyone but you. Each warning names the variable to fix.

`advisories` are real but survivable, so they do not hold the flag down. A
missing `DATABASE_URL` lands here: buyers still receive everything, you just
have no order history.

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

Without it, an in-memory store is used. That works fine for selling, but on
Vercel each serverless instance has its own memory, so **order history, sign-in
and the `/admin` funnel counts do not survive**. Downloads still work because
the emailed link is self-contained, and sales and revenue on the dashboard stay
accurate because they are read from Stripe rather than from events.

Add this when you start caring about customer records — or the moment you want
the dashboard to tell you the truth.

1. Create a project at <https://supabase.com/dashboard>
2. **Project Settings → Database → Connection string → Session pooler**
3. Copy the URI and replace `[YOUR-PASSWORD]` — **including the square
   brackets** — with your database password
4. Add to Vercel as `DATABASE_URL` (that exact name), ticked for Production
5. Redeploy

> **It must be the pooler string, not the direct one.** The direct host,
> `db.<ref>.supabase.co`, publishes an IPv6 address and no IPv4 one. Vercel's
> functions have no IPv6 egress, so that host can never resolve there however
> correct the password is — you get a bare `ENOTFOUND` and a silent fall back to
> the in-memory store. The pooler host is dual-stack and works:
>
> | | Direct (**will not work on Vercel**) | Session pooler (use this) |
> |---|---|---|
> | Host | `db.<ref>.supabase.co` | `aws-0-<region>.pooler.supabase.com` |
> | User | `postgres` | `postgres.<ref>` |
>
> Note the username differs too — the pooler needs the project ref appended, and
> copying only the hostname across is the usual way this goes wrong.

`GET /api/config/health` names both of these mistakes explicitly if you hit
them, rather than leaving you to guess from a connection error.

### Or just connect Supabase to Vercel from their dashboards

Supabase's Vercel integration wires the two together for you — but it **does not
create a `DATABASE_URL`**. It injects its own names:

```
POSTGRES_URL              ← pooled, what this app prefers
POSTGRES_PRISMA_URL       ← pooled, with pgbouncer flags
POSTGRES_URL_NON_POOLING  ← direct, and therefore IPv6-only
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, …
```

All of them are read automatically, in that order, so there is nothing to
rename after connecting the integration. An explicit `DATABASE_URL` still wins
when present. `SUPABASE_URL` also gives the PDF archive bucket its address, so
storage needs no separate configuration either.

### Reading the health report

`database.source` names the variable the string was actually read from, which
splits apart two failures that used to look identical:

| `driver` | `source` | Meaning |
|---|---|---|
| `postgres` | `POSTGRES_URL` | Connected. Nothing to do. |
| `memory` | `null` | No connection string found under any name. |
| `memory` | `POSTGRES_URL` | **Found it, and connecting failed.** The driver error is in the runtime logs. |

That last row is the one that used to be invisible — it reported `postgres:
true` while every write went to memory.

The schema (`server/db/schema.ts`) applies itself on first boot — no migration
step. It creates `users`, `quiz_attempts`, `orders`, `saved_favorites` and
`analytics_events`, with row-level security on and no public policies, since all
access goes through the server.

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

## 8. `APP_SECRET_PW` (the private dashboard at `/admin`)

`https://your-site/admin` is a funnel dashboard: how many people land, press the
quiz button, answer each of the seven questions, reach the offers, press buy,
reach Stripe, pay, and download what they bought — with a board view, a line
chart over time, per-product revenue, traffic sources and per-question drop-off.

1. Add `APP_SECRET_PW` to Vercel with any password you like (`ADMIN_PASSWORD` also works)
2. Make sure `APP_SECRET` is also set — it signs the dashboard session
3. Redeploy, open `/admin`, enter the password

**There is no default password.** With `APP_SECRET_PW` unset,
every login is refused rather than the app shipping a value that is printed in
this public repository. The session is an http-only, `SameSite=Strict` cookie
that expires after 12 hours; login is rate limited to five attempts a minute.

### What the numbers mean

- **Counted in visitors, not clicks.** One person reloading five times is one
  visitor, so the conversion rates are not quietly deflated.
- **Sales and revenue come from the orders table**, which the payment path
  writes itself — so they stay correct even for a buyer whose browser blocked
  the tracking call.
- **"Pressed buy" vs "reached Stripe"** is the one pair to watch for bugs
  rather than copy: a gap there means the button failed to open checkout.

### It needs `DATABASE_URL` to be worth reading

Funnel events go to the same store as everything else. Without a database that
is per-instance memory on Vercel, wiped whenever the instance sleeps — so
visitor and click counts read far below reality. The dashboard says so in an
amber banner at the top until you set it. Sales and revenue are unaffected.

### Tracking specifics

First-party and same-origin, so ad blockers that eat hosted analytics tags do
not eat this. No third-party script, no cookies, and no fingerprinting: a random
id in `localStorage` identifies a browser and another in `sessionStorage`
identifies a visit. No email or name is ever written to the events table.

**Location** comes from Vercel's edge, which resolves it from the request before
your code runs — nothing to configure, and a visitor cannot fake or block it.
It is recorded down to country and region (state/province) but deliberately not
city: country and state tell you where to advertise, while a city plus a
persistent visitor id starts describing a person rather than a market. These
headers only exist on a real deployment, so the geography panel stays empty when
you run the site locally.

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

**Checkout button fails and nothing reaches Stripe's payment page**
Check the Vercel runtime logs for `POST /api/checkout/create-session`. If it
reads *"the product tax code is missing … required for Managed Payments"*, your
account has Managed Payments enabled, which refuses any product without a tax
class. The app handles this by switching Managed Payments off per session, so
checkout works with tax left to you. To use it instead, pick a code at
<https://dashboard.stripe.com/settings/tax> and set `STRIPE_TAX_CODE` — the
products are updated with it automatically on the next sync.

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
