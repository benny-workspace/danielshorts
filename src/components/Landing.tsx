import { ARCHETYPES, ARCHETYPE_IDS } from '@shared/archetypes';
import { QUESTIONS } from '@shared/questions';
import { ArrowRight } from 'lucide-react';
import { image } from '../assets';
import { Reveal } from './primitives';

const STEPS = [
  { n: '01', title: 'Seven questions', body: 'Pick the scene that moves you.' },
  { n: '02', title: 'Your archetype', body: 'One of five leads. Plus your match with the rest.' },
  { n: '03', title: 'Your dream scene', body: 'Played out like a final-episode confession.' },
];

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative min-h-[92svh] overflow-hidden vignette">
        <div className="absolute inset-0">
          <img
            src={image('hero')}
            alt=""
            aria-hidden="true"
            className="h-full w-full scale-105 object-cover object-[50%_35%] opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-ink-950/35" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/55 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[92svh] max-w-6xl flex-col justify-end px-5 pb-16 pt-28 sm:px-8 md:pb-24">
          <Reveal>
            <div className="flex items-center gap-3">
              <span className="rule-accent" />
              <p className="label">Interactive romance profile</p>
            </div>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="display-xl mt-6 max-w-[16ch] text-ivory">
              Which K-drama love interest is written for you?
            </h1>
          </Reveal>

          <Reveal delay={180}>
            <p className="prose-body mt-7 max-w-[40ch]">
              Seven scenes. Five leads. One pattern you have been running for years.
            </p>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <button type="button" onClick={onStart} className="btn btn-primary group">
                Start the quiz
                <ArrowRight
                  size={16}
                  strokeWidth={2}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </button>
              <p className="text-sm text-ivory-3">
                {QUESTIONS.length} questions · 2 minutes · free
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------------- the five */}
      <section className="relative z-10 border-t border-line-soft bg-ink-950">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="label label-accent">The cast</p>
                <h2 className="display-lg mt-3 max-w-[18ch]">
                  Five leads. One of them is yours.
                </h2>
              </div>
              <p className="max-w-[30ch] text-sm leading-relaxed text-ivory-3">
                Each one is a different answer to: what does being loved well look
                like to you?
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-px border border-line-soft bg-line-soft sm:grid-cols-2 lg:grid-cols-5">
            {ARCHETYPE_IDS.map((id, index) => {
              const archetype = ARCHETYPES[id];
              return (
                <Reveal key={id} delay={index * 70}>
                  <article
                    className="group relative h-full overflow-hidden bg-ink-900"
                    style={{ ['--accent' as string]: archetype.accent }}
                  >
                    <div className="relative aspect-[4/5] overflow-hidden lg:aspect-[3/4]">
                      <img
                        src={image(archetype.imageKey)}
                        alt={archetype.title}
                        loading="lazy"
                        className="h-full w-full object-cover opacity-70 transition-all duration-[900ms] ease-out group-hover:scale-105 group-hover:opacity-90"
                      />
                      {/* Runs to solid ink-900 so the title block below, which
                          is pulled up over the still, always sits on a clean
                          ground rather than on busy image detail. */}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/75 to-transparent" />
                      <span className="numeral absolute left-4 top-3 text-2xl text-ivory/35">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>

                    <div className="relative -mt-12 px-4 pb-6">
                      <p
                        className="label mb-2"
                        style={{ color: `rgb(${archetype.accent})` }}
                      >
                        {archetype.essence}
                      </p>
                      <h3 className="display-md text-ivory">{archetype.shortTitle}</h3>
                      <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-ivory-3">
                        {archetype.hook}
                      </p>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- how it works */}
      <section className="relative z-10 border-t border-line-soft bg-ink-900">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
          <div className="grid gap-12 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, index) => (
              <Reveal key={step.n} delay={index * 90}>
                <div className="border-t border-line pt-6">
                  <span className="numeral text-4xl text-ivory/20">{step.n}</span>
                  <h3 className="display-md mt-4">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ivory-3">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={220}>
            <div className="mt-16 flex flex-col items-start gap-5 border-t border-line pt-10 sm:flex-row sm:items-center sm:justify-between">
              <p className="display-md max-w-[22ch]">
                Two minutes. True for years.
              </p>
              <button type="button" onClick={onStart} className="btn btn-primary group">
                Find my archetype
                <ArrowRight
                  size={16}
                  strokeWidth={2}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
