import {
  ARCHETYPES,
  ARCHETYPE_IDS,
  type Archetype,
  type ArchetypeId,
} from '@shared/archetypes';
import { getCompatibility } from '@shared/compatibility';
import type { QuizScore } from '@shared/questions';
import { Check, Download, Heart, Info, Share2 } from 'lucide-react';
import { useState } from 'react';
import { image } from '../assets';
import { downloadBlob, renderResultCard, shareArchetype } from '../lib/share';
import { Meter, Reveal, useToast } from './primitives';
import { DreamScene } from './DreamScene';

export function Result({
  archetype,
  score,
  favorited,
  onToggleFavorite,
}: {
  archetype: Archetype;
  score: QuizScore;
  favorited: boolean;
  onToggleFavorite: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);
  const [traitOpen, setTraitOpen] = useState(false);

  const others = ARCHETYPE_IDS.filter((id) => id !== archetype.id)
    .map((id) => ({ archetype: ARCHETYPES[id], compatibility: getCompatibility(archetype.id, id) }))
    .sort((a, b) => b.compatibility.percent - a.compatibility.percent);

  const handleShare = async () => {
    setBusy('share');
    try {
      const card = await renderResultCard(archetype, image(archetype.dreamMovie.sceneKey));
      const result = await shareArchetype(archetype, card ?? undefined);
      if (result.method === 'clipboard') toast('Link copied to your clipboard.');
      if (result.method === 'none') toast('Sharing is not available in this browser.', 'error');
    } catch {
      toast('Could not open the share sheet.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    setBusy('download');
    try {
      const card = await renderResultCard(archetype, image(archetype.dreamMovie.sceneKey));
      if (!card) throw new Error('render failed');
      downloadBlob(card, `kdrama-archetype-${archetype.id}.png`);
      toast('Your card is downloading.');
    } catch {
      toast('Could not generate your card.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {/* --------------------------------------------------------- reveal */}
      <section className="relative mx-auto w-full max-w-6xl px-5 pt-24 sm:px-8">
        <Reveal>
          <div className="flex items-center gap-3">
            <span className="rule-accent" />
            <p className="label">Your romance archetype</p>
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="display-md text-ivory-3">{archetype.essence}</p>
              <h1 className="display-xl mt-2 max-w-[15ch] text-balance">{archetype.title}</h1>
            </div>

            <div className="flex items-center gap-2">
              <ActionButton
                onClick={onToggleFavorite}
                active={favorited}
                label={favorited ? 'Saved' : 'Save'}
              >
                <Heart size={15} strokeWidth={1.5} fill={favorited ? 'currentColor' : 'none'} />
                {favorited ? 'Saved' : 'Save'}
              </ActionButton>
              <ActionButton onClick={handleShare} label="Share" busy={busy === 'share'}>
                <Share2 size={15} strokeWidth={1.5} />
                Share
              </ActionButton>
              <ActionButton onClick={handleDownload} label="Download card" busy={busy === 'download'}>
                <Download size={15} strokeWidth={1.5} />
                Card
              </ActionButton>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <p className="display-lg mt-8 max-w-[24ch] italic text-ivory-2">{archetype.hook}</p>
        </Reveal>
      </section>

      {/* ---------------------------------------------------- dream scene */}
      <section className="mx-auto mt-12 w-full max-w-6xl px-5 sm:px-8">
        <Reveal delay={80}>
          <DreamScene archetype={archetype} autoPlay />
        </Reveal>
      </section>

      {/* ------------------------------------------------------- the read */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] md:gap-16">
          <Reveal>
            <p className="prose-body text-[1.0625rem] leading-[1.8] md:text-lg">
              {archetype.desc}
            </p>

            <div className="relative mt-8 inline-block">
              <button
                type="button"
                onClick={() => setTraitOpen((open) => !open)}
                onMouseEnter={() => setTraitOpen(true)}
                onMouseLeave={() => setTraitOpen(false)}
                aria-expanded={traitOpen}
                className="flex items-center gap-2 border border-line px-3.5 py-2 text-left transition-colors hover:border-[rgb(var(--accent)/0.5)]"
              >
                <span className="label !tracking-[0.14em] label-accent">Core trait</span>
                <span className="text-sm text-ivory">{archetype.trait}</span>
                <Info size={13} strokeWidth={1.5} className="text-ivory-3" />
              </button>

              {traitOpen ? (
                <div
                  role="tooltip"
                  className="absolute bottom-full left-0 z-40 mb-2 w-[min(22rem,80vw)] border border-line bg-ink-800 p-4 shadow-2xl"
                  style={{ animation: 'fade-up 200ms cubic-bezier(0.16,1,0.3,1)' }}
                >
                  <p className="label label-accent mb-2">Why it lands on screen</p>
                  <p className="text-[0.8125rem] leading-relaxed text-ivory-2">
                    {archetype.traitExplanation}
                  </p>
                </div>
              ) : null}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="border-t border-line pt-6">
              <p className="label">What this looks like in you</p>
              <ul className="mt-6 space-y-5">
                {archetype.signals.map((signal) => (
                  <li key={signal} className="flex gap-3.5">
                    <Check
                      size={15}
                      strokeWidth={1.5}
                      className="mt-1 shrink-0"
                      style={{ color: `rgb(${archetype.accent})` }}
                    />
                    <span className="text-[0.9375rem] leading-relaxed text-ivory-2">{signal}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 border-t border-line-soft pt-6">
                <p className="label">Love language</p>
                <p className="display-md mt-2">{archetype.loveLanguage}</p>
              </div>

              <div className="mt-8 border-t border-line-soft pt-6">
                <p className="label">Answer spread</p>
                <div className="mt-4 space-y-3">
                  {score.ranking.map((row) => (
                    <div key={row.id} className="flex items-center gap-3">
                      <span className="w-[13ch] shrink-0 truncate text-xs text-ivory-3">
                        {ARCHETYPES[row.id].essence}
                      </span>
                      <div className="flex-1">
                        <Meter percent={row.percent} />
                      </div>
                      <span className="numeral w-9 shrink-0 text-right text-xs text-ivory-2">
                        {row.percent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------- compatibility */}
      <section className="border-y border-line-soft bg-ink-900">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 md:py-28">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="label label-accent">Compatibility</p>
                <h2 className="display-lg mt-3 max-w-[18ch]">
                  How you play against the other four.
                </h2>
              </div>
              <p className="max-w-[36ch] text-sm leading-relaxed text-ivory-3">
                Higher is not better — it is simply less friction. The most-watched
                pairings usually sit somewhere in the middle.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 border-t border-line">
            {others.map(({ archetype: other, compatibility }, index) => (
              <Reveal key={other.id} delay={index * 70}>
                <article
                  className="group grid items-center gap-5 border-b border-line py-7 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.1fr)_5rem] md:gap-8"
                  style={{ ['--accent' as string]: other.accent }}
                >
                  <div className="relative hidden h-24 w-24 overflow-hidden md:block">
                    <img
                      src={image(other.imageKey)}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="h-full w-full object-cover opacity-60 transition-all duration-700 group-hover:scale-105 group-hover:opacity-90"
                    />
                  </div>

                  <div>
                    <p className="label !tracking-[0.14em]" style={{ color: `rgb(${other.accent})` }}>
                      {other.essence}
                    </p>
                    <h3 className="display-md mt-1.5">{other.shortTitle}</h3>
                    <p className="mt-1.5 text-xs text-ivory-3">{compatibility.label}</p>
                  </div>

                  <p className="text-[0.875rem] leading-relaxed text-ivory-2">
                    {compatibility.desc}
                  </p>

                  <div className="md:text-right">
                    <p className="numeral text-3xl" style={{ color: `rgb(${other.accent})` }}>
                      {compatibility.percent}
                      <span className="text-base text-ivory-3">%</span>
                    </p>
                    <div className="mt-2">
                      <Meter percent={compatibility.percent} delay={index * 90} />
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <style>{`@keyframes fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </>
  );
}

function ActionButton({
  children,
  onClick,
  label,
  active = false,
  busy = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center gap-2 border px-3.5 py-2.5 text-xs font-medium transition-all duration-200 disabled:opacity-50 ${
        active
          ? 'border-[rgb(var(--accent)/0.55)] bg-[rgb(var(--accent)/0.1)] text-[rgb(var(--accent))]'
          : 'border-line text-ivory-2 hover:border-[rgb(var(--accent)/0.45)] hover:text-ivory'
      }`}
    >
      {children}
    </button>
  );
}

/** Compact archetype tile used in the saved-archetypes panel. */
export function ArchetypeTile({
  id,
  onRemove,
}: {
  id: ArchetypeId;
  onRemove?: () => void;
}) {
  const archetype = ARCHETYPES[id];
  return (
    <div
      className="flex items-center gap-4 border border-line-soft p-3"
      style={{ ['--accent' as string]: archetype.accent }}
    >
      <img
        src={image(archetype.imageKey)}
        alt=""
        aria-hidden="true"
        className="h-14 w-14 shrink-0 object-cover opacity-80"
      />
      <div className="min-w-0 flex-1">
        <p className="label !tracking-[0.12em] label-accent">{archetype.essence}</p>
        <p className="mt-1 truncate text-sm text-ivory">{archetype.shortTitle}</p>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-xs text-ivory-3 transition-colors hover:text-rose-2"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}
