import type { ArchetypeId } from '@shared/archetypes';
import type { ProductTier } from '@shared/products';
import { ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { image } from '../assets';
import { track, trackingIds, trackOnce } from '../lib/analytics';
import { createCheckoutSession, type AppConfig, type PublicProduct } from '../lib/api';
import { Reveal, useMoney, useToast } from './primitives';

const IMAGE_KEYS: Record<ProductTier, string> = {
  blueprint: 'product_blueprint',
  bundle: 'product_bundle',
  coaching: 'product_coaching',
};

export function Offers({
  config,
  email,
  answers,
  winner,
  attemptId,
  name,
}: {
  config: AppConfig | null;
  email: string | null;
  answers: ArchetypeId[];
  winner: ArchetypeId;
  attemptId: string | null;
  name?: string;
}) {
  const toast = useToast();
  const money = useMoney();
  const [pending, setPending] = useState<ProductTier | null>(null);
  const [emailPrompt, setEmailPrompt] = useState(email ?? '');
  const sectionRef = useRef<HTMLElement | null>(null);

  const products = config?.products ?? [];
  const checkoutEnabled = config?.features.checkout ?? false;

  /*
   * "Reached the offers" means the cards were actually on screen, not merely
   * mounted — this section renders below the result, so most of the page can
   * exist without anyone ever scrolling far enough to see the prices.
   */
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          trackOnce('offers_view', 'offers_view', { archetype: winner });
          observer.disconnect();
        }
      },
      // A third of the block visible is a fair reading of "saw the offers".
      { threshold: 0.33 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [winner]);

  const buy = async (product: PublicProduct) => {
    const buyerEmail = (email ?? emailPrompt).trim();
    if (!buyerEmail) {
      toast('Add your email above so we know where to send it.', 'error');
      return;
    }

    // Recorded before the request, so a checkout that fails to open is still
    // counted as intent. The gap between this and "reached Stripe" on the
    // dashboard is exactly the failure the last release fixed.
    track('checkout_click', {
      tier: product.tier,
      archetype: winner,
      value: product.amount,
    });

    setPending(product.tier);
    try {
      const session = await createCheckoutSession({
        tier: product.tier,
        userEmail: buyerEmail,
        winningArchetype: winner,
        quizAnswers: answers,
        quizAttemptId: attemptId,
        name,
        ...trackingIds(),
      });

      if (session.url) {
        window.location.assign(session.url);
        return;
      }
      toast(session.error ?? 'Checkout is not available right now.', 'error');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setPending(null);
    }
  };

  if (!products.length) return null;

  return (
    <section ref={sectionRef} className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="label label-accent">Go deeper</p>
            <h2 className="display-lg mt-3 max-w-[20ch]">
              The full read, written from your answers.
            </h2>
          </div>
          <p className="max-w-[36ch] text-sm leading-relaxed text-ivory-3">
            Your result is the headline. These are the pages underneath it — your
            patterns, your blind spots, and the words for what you have been trying to
            ask for.
          </p>
        </div>
      </Reveal>

      {!email ? (
        <Reveal delay={80}>
          <div className="mt-10 flex flex-col gap-3 border border-line-soft p-4 sm:flex-row sm:items-center">
            <label htmlFor="offer-email" className="label shrink-0">
              Deliver to
            </label>
            <input
              id="offer-email"
              type="email"
              value={emailPrompt}
              onChange={(event) => setEmailPrompt(event.target.value)}
              placeholder="you@example.com"
              className="field"
            />
          </div>
        </Reveal>
      ) : null}

      <div className="mt-10 grid gap-px border border-line-soft bg-line-soft md:grid-cols-3">
        {products.map((product, index) => {
          const featured = product.tier === 'bundle';
          return (
            <Reveal key={product.tier} delay={index * 90}>
              <article
                className={`relative flex h-full flex-col bg-ink-900 ${featured ? 'md:-my-4 md:shadow-[0_30px_80px_-40px_rgb(var(--accent)/0.6)]' : ''}`}
                style={featured ? { boxShadow: 'inset 0 0 0 1px rgb(var(--accent) / 0.35)' } : undefined}
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={image(IMAGE_KEYS[product.tier])}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-full w-full object-cover opacity-55 transition-opacity duration-700 hover:opacity-75"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/50 to-transparent" />
                  {product.badge ? (
                    <span className="absolute left-4 top-4 flex items-center gap-1.5 border border-[rgb(var(--accent)/0.5)] bg-ink-950/80 px-2.5 py-1 backdrop-blur-sm">
                      <Sparkles size={11} strokeWidth={1.5} className="text-[rgb(var(--accent))]" />
                      <span className="label !text-[0.5625rem] !tracking-[0.16em] label-accent">
                        {product.badge}
                      </span>
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="label">{product.kicker}</p>
                    <p className="numeral text-3xl text-ivory">{money(product.amount)}</p>
                  </div>

                  <h3 className="display-md mt-4 text-balance">{product.name}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-ivory-3">{product.headline}</p>

                  <p className="mt-4 text-[0.8125rem] leading-relaxed text-ivory-2">
                    {product.description}
                  </p>

                  <ul className="mt-6 space-y-2.5 border-t border-line-soft pt-5">
                    {product.deliverables.map((item) => (
                      <li key={item} className="flex gap-2.5 text-[0.8125rem] leading-snug text-ivory-2">
                        <Check
                          size={13}
                          strokeWidth={1.6}
                          className="mt-0.5 shrink-0 text-[rgb(var(--accent))]"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-7">
                    <button
                      type="button"
                      onClick={() => buy(product)}
                      disabled={!checkoutEnabled || !product.available || pending !== null}
                      className={`btn w-full ${featured ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      {pending === product.tier ? (
                        <>
                          <Loader2 size={15} className="animate-spin" strokeWidth={2} />
                          Opening checkout…
                        </>
                      ) : (
                        <>
                          Get it for {money(product.amount)}
                          <ArrowRight size={15} strokeWidth={1.6} />
                        </>
                      )}
                    </button>

                    {!checkoutEnabled || !product.available ? (
                      <p className="mt-3 text-center text-[0.6875rem] leading-relaxed text-ivory-3">
                        Checkout is not connected yet.
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>

      {config && checkoutEnabled && !config.features.fulfillmentReady ? (
        <Reveal delay={200}>
          <p className="mt-6 border border-gold/25 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-ivory-2">
            <span className="font-semibold text-gold">Setup note (only you see this):</span>{' '}
            payments will go through, but <code className="text-gold">STRIPE_WEBHOOK_SECRET</code>{' '}
            is not set — so blueprints will not generate or send automatically yet.
          </p>
        </Reveal>
      ) : null}

      <Reveal delay={240}>
        <p className="mt-8 text-center text-[0.6875rem] leading-relaxed text-ivory-3">
          Secure payment by Stripe · Instant email delivery · Written for entertainment
          and self-reflection, not clinical advice.
        </p>
      </Reveal>
    </section>
  );
}
