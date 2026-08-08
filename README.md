# K-Drama Dreams

A romance-archetype quiz and digital product funnel. Seven questions map a
reader onto one of five K-drama love-interest archetypes, play their result back
as a cinematic "dream outcome" scene, and sell them a personalised 15-page
Romantic Blueprint generated from their own answers.

Live at **<https://danielshorts.vercel.app>**.

> **New here?** Read [SETUP.md](./SETUP.md) — it walks through connecting Stripe,
> email, AI, and the database, in order, with the exact values to paste where.

---

## Stack

| Layer | Choice |
|---|---|
| Client | React 19 · TypeScript · Vite · Tailwind v4 |
| Server | Express 4 (one app, three entry points) |
| Payments | Stripe Checkout Sessions, or Payment Links |
| AI | `@google/genai` · `gemini-2.5-flash` |
| PDF | PDFKit, typeset server-side |
| Email | Resend |
| Data | Postgres (Supabase) with an in-memory fallback |

Everything degrades. With no credentials at all the site still runs the full
quiz, result, and share flow — each integration switches on independently.

---

## Layout

```
shared/            Data used by BOTH client and server — archetypes, questions,
                   scoring, compatibility, products. One source of truth.
server/
  app.ts           Express app factory (API only, no static concerns)
  env.ts           Env parsing + capability flags
  routes/          checkout · webhooks · ai · quiz · user · auth · download · config
  services/        stripe · gemini · pdf · email · storage · fulfillment
  db/              Adapter interface, Postgres + in-memory drivers, schema.sql
src/               React client
  components/      Landing · Quiz · OptIn · DreamScene · Result · Offers · …
  lib/             api · audio (OST synth) · share (canvas card) · storage
server.ts          Local entry: Express + Vite middleware (dev) / dist (prod)
api/index.ts       Vercel serverless entry — mounts the same Express app
```

### Three entry points, one API

`server/app.ts` builds the Express app and knows nothing about how it is served.
`server.ts` wraps it for local development (Vite in middleware mode) and for a
self-hosted production run (static `dist/`). `api/index.ts` exports it as a
Vercel serverless function, with `vercel.json` rewriting `/api/*` to it while
the CDN serves `dist/`. The API behaves identically in all three.

---

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/config` | Public product list + capability flags |
| `GET` | `/api/config/health` | Which integrations are configured |
| `POST` | `/api/quiz/save-result` | Persist an attempt, optionally email the result |
| `POST` | `/api/checkout/create-session` | Create order → Stripe Checkout or Payment Link |
| `GET` | `/api/checkout/order/:id` | Poll fulfilment status after redirect |
| `POST` | `/api/webhooks/stripe` | Signed Stripe events → fulfilment |
| `POST` | `/api/ai/generate-blueprint` | Blueprint (preview free, full needs a token) |
| `GET` | `/api/download/:token` | Signed, time-limited PDF download |
| `POST` | `/api/auth/magic-link` · `GET /verify` · `GET /me` · `POST /signout` | Passwordless sign-in |
| `GET` | `/api/user/orders` · `/favorites` · `/quiz-history` | Signed-in reader data |

### How a purchase flows

```
Buyer clicks a tier
  └─ POST /api/checkout/create-session
       creates a `pending` order carrying quizAttemptId + winningArchetype
       returns a Stripe Checkout URL (or a Payment Link + client_reference_id)
Buyer pays on Stripe
  └─ POST /api/webhooks/stripe   (signature verified against the raw body)
       resolves the order, marks it `paid`
       Gemini writes the blueprint  ─ falls back to written copy on any failure
       PDFKit typesets 15 pages
       archived to object storage   ─ optional
       signed download token minted (JWT, expires in DOWNLOAD_TTL_HOURS)
       Resend emails the link + PDF + receipt
       order marked `fulfilled`
Buyer is redirected back to /?checkout=success&order=…
  └─ the page polls GET /api/checkout/order/:id until the download link appears
```

Fulfilment is idempotent: a replayed webhook returns the existing link instead
of regenerating and re-sending. The webhook acknowledges Stripe *before* doing
the work, so a slow PDF render cannot cause a retry storm.

### Why downloads re-render

The PDF is not read from disk. `orders.blueprint` stores the generated document
as JSON and `/api/download/:token` typesets it on demand. Serverless instances
do not share a filesystem, so a file written during the webhook would often be
missing when the download request lands on a different instance. Object storage
is supported but stays optional.

---

## Design

Dark, warm and cinematic — film-still imagery, a high-contrast display serif
(Instrument Serif) against a tight grotesque (Inter), one accent that re-tints
per archetype through the `--accent` custom property, and a fixed film-grain
plate over the whole page. Tokens live in `src/index.css` under `@theme`.

Motion is CSS-driven and fully disabled under `prefers-reduced-motion`. The
dream-scene score is synthesised live with the Web Audio API — no audio files.
The shareable result card is drawn on a canvas rather than screenshotting the
DOM, so it is identical across browsers.

---

## Commands

```bash
npm run dev     # Express + Vite on :3000
npm run lint    # tsc --noEmit across client, server and shared
npm run build   # vite build + esbuild bundle of the server
npm start       # run the production build
```

---

## Notes

- Quiz content, archetypes and prices live in `shared/` and are read by both
  runtimes; change them in one place.
- `/api/ai/generate-blueprint` returns a teaser for free callers. The full
  document requires a signed download token from a fulfilled order.
- Rate limiting is per-instance and in-memory — enough to blunt casual abuse of
  the AI endpoint, not a substitute for a real limiter at scale.
- Result copy is written for entertainment and self-reflection. The AI prompt
  explicitly forbids diagnostic or clinical framing.
