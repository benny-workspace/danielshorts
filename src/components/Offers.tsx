import type { ArchetypeId } from '@shared/archetypes';
import type { ProductTier } from '@shared/products';
import { ArrowDown, ArrowRight, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { image } from '../assets';
import { track, trackingIds, trackOnce } from '../lib/analytics';
import { createCheckoutSession, type AppConfig, type PublicProduct } from '../lib/api';
import { Reveal, useMoney, useToast } from './primitives';

const IMAGE_KEYS: Record<ProductTier, string> = {
  blueprint: 'product_blueprint',
  bundle: 'product_bundle',
  coaching: 'product_coaching',
};

/** Where the cue scrolls to. */
const OFFERS_ID = 'offers';

/**
 * The interruption between the result and the offers.
 *
 * The result reads as an ending — readers took it as the whole thing and left,
 * never learning there was more. This exists to break that, so it is loud on
 * purpose: full-width, high contrast, an arrow that keeps moving, and a tap
 * target that scrolls rather than expecting anyone to keep going by themselves.
 */
export function OffersCue() {
  const scroll = () => {
    document.getElementById(OFFERS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-4 pt-10 sm:px-8">
      <Reveal>
        <button
          type="button"
          onClick={scroll}
          className="group block w-full rounded-[var(--radius-card)] border border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.06)] px-6 py-10 text-center transition-colors hover:bg-[rgb(var(--accent)/0.11)] sm:py-12"
        >
          <p className="label label-accent">Wait —</p>
          <h2 className="display-xl mt-3 text-balance">This is what you missed.</h2>
          <p className="mx-auto mt-4 max-w-[30ch] text-sm leading-relaxed text-ink-2">
            Your result is one page. The rest of your story is written below.
          </p>
          <span className="mt-7 inline-flex items-center gap-2.5 text-[rgb(var(--accent))]">
            <span className="label label-accent">See it</span>
            <ArrowDown
              size={20}
              strokeWidth={2}
              className="animate-[cue-bounce_1.4s_ease-in-out_infinite]"
            />
          </span>
        </button>
      </Reveal>

      <style>{`
        @keyframes cue-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[cue-bounce_1\\.4s_ease-in-out_infinite\\] { animation: none; }
        }
      `}</style>
    </section>
  );
}

export function Offers({
  config,
  email,
  answers,
  winner,
  attemptId,
}: {
  config: AppConfig | null;
  email: string | null;
  answers: ArchetypeId[];
  winner: ArchetypeId;
  attemptId: string | null;
}) {
  const toast = useToast();
  const money = useMoney();
  const [pending, setPending] = useState<ProductTier | null>(null);
  const [emailPrompt, setEmailPrompt] = useState(email ?? '');
  /** The product a buyer has chosen, while the email dialog is open. */
  const [chosen, setChosen] = useState<PublicProduct | null>(null);
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

  /**
   * Pressing buy opens the dialog rather than starting checkout.
   *
   * The click is recorded here, not after the address is given: this is the
   * moment of intent, and counting it here is what makes an abandoned dialog
   * visible on the dashboard instead of looking like nobody was interested.
   */
  const choose = (product: PublicProduct) => {
    track('checkout_click', {
      tier: product.tier,
      archetype: winner,
      value: product.amount,
    });
    setChosen(product);
  };

  const buy = async (product: PublicProduct, buyerEmail: string) => {
    setPending(product.tier);
    try {
      const session = await createCheckoutSession({
        tier: product.tier,
        userEmail: buyerEmail,
        winningArchetype: winner,
        quizAnswers: answers,
        quizAttemptId: attemptId,
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
    <section
      id={OFFERS_ID}
      ref={sectionRef}
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 pb-20 pt-8 sm:px-8 md:pb-28"
    >
      <Reveal>
        <p className="label label-accent">Written from your answers</p>
        <h2 className="display-lg mt-3 max-w-[20ch]">Your full story.</h2>
      </Reveal>


      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {products.map((product, index) => {
          const featured = product.tier === 'bundle';
          return (
            <Reveal key={product.tier} delay={index * 90}>
              <article
                className={`card relative flex h-full flex-col ${featured ? 'md:-my-4 md:shadow-[0_24px_60px_-30px_rgb(var(--accent)/0.45)]' : ''}`}
                style={featured ? { borderColor: 'rgb(var(--accent) / 0.55)' } : undefined}
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={image(IMAGE_KEYS[product.tier])}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/20 to-transparent" />
                  {product.badge ? (
                    <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-[rgb(var(--accent))] px-3 py-1 shadow-sm">
                      <Sparkles size={11} strokeWidth={1.5} className="text-white" />
                      <span className="label !text-[0.5625rem] !tracking-[0.16em] !text-white">
                        {product.badge}
                      </span>
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="label">{product.kicker}</p>
                    <p className="numeral text-3xl text-ink">{money(product.amount)}</p>
                  </div>

                  <h3 className="display-md mt-4 text-balance">{product.name}</h3>

                  {/* The prose description used to sit here as well. Between a
                      headline, a paragraph and a bullet list, the paragraph was
                      the part nobody read — the bullets carry the same value in
                      a form that survives being skimmed. */}
                  <ul className="mt-5 space-y-2.5 border-t border-line-soft pt-5">
                    {product.deliverables.map((item) => (
                      <li key={item} className="flex gap-2.5 text-[0.8125rem] leading-snug text-ink-2">
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
                      onClick={() => choose(product)}
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
                      <p className="mt-3 text-center text-[0.6875rem] leading-relaxed text-ink-3">
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
          <p className="mt-6 border border-gold/25 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-ink-2">
            <span className="font-semibold text-gold">Setup note (only you see this):</span>{' '}
            payments will go through, but <code className="text-gold">STRIPE_WEBHOOK_SECRET</code>{' '}
            is not set — so blueprints will not generate or send automatically yet.
          </p>
        </Reveal>
      ) : null}

      <Reveal delay={240}>
        <p className="mt-8 text-center text-[0.6875rem] leading-relaxed text-ink-3">
          Stripe checkout · Instant download · For fun, not therapy.
        </p>
      </Reveal>

      <EmailDialog
        product={chosen}
        initialEmail={emailPrompt}
        busy={pending !== null}
        onCancel={() => setChosen(null)}
        onConfirm={(address) => {
          setEmailPrompt(address);
          void buy(chosen!, address);
        }}
      />
    </section>
  );
}

/**
 * Collects the delivery address at the last possible moment.
 *
 * One field and one button. There is no name field because nothing downstream
 * uses a name — asking for it would be a second thing to type in exchange for
 * nothing, at the exact point where a buyer is most likely to give up.
 */
function EmailDialog({
  product,
  initialEmail,
  busy,
  onCancel,
  onConfirm,
}: {
  product: PublicProduct | null;
  initialEmail: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (email: string) => void;
}) {
  const money = useMoney();
  const [value, setValue] = useState(initialEmail);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!product) return;
    setValue(initialEmail);
    setTouched(false);
    // Focus after paint, or the keyboard does not open on iOS.
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);

    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);

    // Stop the page behind the dialog scrolling under it on touch.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [product, initialEmail, onCancel]);

  if (!product) return null;

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

  /*
   * Rendered into <body> rather than in place. The offers live inside a <main>
   * that sets z-10, which caps every descendant's stacking against siblings of
   * main — including the falling-petal layer, which would otherwise paint over
   * the dialog however high its own z-index went.
   *
   * z-68 keeps it above the petals and the grain plate but below the toasts, so
   * a checkout error is still readable while the dialog is open.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-[68] flex items-end justify-center bg-ink/25 p-4 backdrop-blur-sm sm:items-center"
      style={{ animation: 'dialog-in 200ms ease-out' }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-title"
        className="panel-raised w-full max-w-sm p-6 sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="float-right -mr-1 -mt-1 p-1 text-ink-3 transition-colors hover:text-ink"
        >
          <X size={18} strokeWidth={1.8} />
        </button>

        <p className="label label-accent">{product.name}</p>
        <h2 id="buy-title" className="display-md mt-2">
          Get your bundle!
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
          Where should we send it? Arrives in under two minutes.
        </p>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (valid && !busy) onConfirm(value.trim());
          }}
        >
          <input
            ref={inputRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="go"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="you@example.com"
            aria-invalid={touched && !valid}
            className="field"
          />

          {touched && !valid ? (
            <p className="mt-2 text-xs text-rose-2">Check that address and try again.</p>
          ) : null}

          <button type="submit" disabled={busy} className="btn btn-primary mt-4 w-full">
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" strokeWidth={2} />
                Opening checkout…
              </>
            ) : (
              <>
                Get it for {money(product.amount)}
                <ArrowRight size={15} strokeWidth={1.8} />
              </>
            )}
          </button>
        </form>

        <p className="mt-3 text-center text-[0.6875rem] text-ink-3">
          Secure payment by Stripe.
        </p>
      </div>

      <style>{`
        @keyframes dialog-in { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>,
    document.body,
  );
}
