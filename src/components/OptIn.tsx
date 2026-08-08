import type { Archetype } from '@shared/archetypes';
import { ArrowRight, Loader2, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { image } from '../assets';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function OptIn({
  archetype,
  onSubmit,
  onSkip,
  submitting,
}: {
  archetype: Archetype;
  onSubmit: (email: string, name: string) => void;
  onSkip: () => void;
  submitting: boolean;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const valid = useMemo(() => EMAIL_RE.test(email.trim()), [email]);
  const showError = touched && email.length > 0 && !valid;

  // The still resolves as the address becomes valid — a small reward for
  // finishing the form rather than another progress bar.
  const blur = valid ? 0 : Math.max(4, 22 - email.length * 1.1);

  return (
    <section className="relative mx-auto grid min-h-[92svh] w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-24 sm:px-8 md:grid-cols-2 md:gap-16">
      <div className="relative order-2 md:order-1">
        <div className="film-frame aspect-[4/5] w-full">
          <img
            src={image(archetype.imageKey)}
            alt=""
            aria-hidden="true"
            className="h-full w-full scale-105 object-cover transition-all duration-[1400ms] ease-out"
            style={{ filter: `blur(${blur}px) saturate(${valid ? 1 : 0.6})`, opacity: valid ? 0.9 : 0.55 }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-6">
            <p className="label label-accent">Result ready</p>
            <p
              className="display-md mt-2 transition-all duration-700"
              style={{ opacity: valid ? 1 : 0.35, filter: valid ? 'none' : 'blur(5px)' }}
            >
              {valid ? archetype.title : 'The ▮▮▮▮▮▮ ▮▮▮▮ ▮▮▮▮▮▮'}
            </p>
          </div>
        </div>
      </div>

      <div className="order-1 md:order-2">
        <div className="flex items-center gap-3">
          <span className="rule-accent" />
          <p className="label">Step 3 of 3</p>
        </div>

        <h2 className="display-lg mt-6 max-w-[16ch]">Your archetype is ready.</h2>

        <p className="prose-body mt-5 max-w-[46ch]">
          Tell us where to send it. You will get your result on screen straight away —
          the email is so you can find it again, and so we can send your blueprint if you
          decide you want one.
        </p>

        <form
          className="mt-9 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!valid || submitting) return;
            onSubmit(email.trim(), name.trim());
          }}
        >
          <div>
            <label htmlFor="optin-name" className="label mb-2 block">
              First name <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="optin-name"
              type="text"
              autoComplete="given-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="What should we call you?"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="optin-email" className="label mb-2 block">
              Email address
            </label>
            <input
              id="optin-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="you@example.com"
              aria-invalid={showError}
              aria-describedby={showError ? 'optin-error' : undefined}
              className="field"
              style={showError ? { borderColor: 'rgb(var(--accent) / 0.8)' } : undefined}
            />
            {showError ? (
              <p id="optin-error" className="mt-2 text-xs text-rose-2">
                That address does not look right yet.
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!valid || submitting}
            className="btn btn-primary w-full"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" strokeWidth={2} />
                Developing your scene…
              </>
            ) : (
              <>
                Reveal my result
                <ArrowRight size={16} strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 flex items-start gap-2.5 text-xs leading-relaxed text-ivory-3">
          <Lock size={13} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          <p>
            One email with your result. No list swapping, no third-party sharing, and you
            can unsubscribe from the first message.
          </p>
        </div>

        <button type="button" onClick={onSkip} className="btn btn-quiet mt-4 text-xs">
          Skip and just show me the result
        </button>
      </div>
    </section>
  );
}
