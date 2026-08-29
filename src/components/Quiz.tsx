import { ARCHETYPES, type ArchetypeId } from '@shared/archetypes';
import { QUESTIONS } from '@shared/questions';
import { ArrowLeft, ListChecks } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from './primitives';

const KEYS = ['A', 'B', 'C', 'D', 'E'];
const SWIPE_THRESHOLD = 56;

export function Quiz({
  answers,
  onAnswer,
  onComplete,
  onExit,
}: {
  answers: Array<ArchetypeId | null>;
  onAnswer: (index: number, archetype: ArchetypeId) => void;
  /**
   * Handed the finished set rather than reading it from the parent's state.
   *
   * The seventh answer now finishes the quiz by itself, and the parent's
   * `answers` has not necessarily been committed by the time this fires — so
   * passing them explicitly is what stops the last choice being dropped from
   * the score.
   */
  onComplete: (finalAnswers: ArchetypeId[]) => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const question = QUESTIONS[index];
  const selected = answers[index] ?? null;
  const answeredCount = answers.filter(Boolean).length;
  const progress = Math.round(((index + 1) / QUESTIONS.length) * 100);
  const isLast = index === QUESTIONS.length - 1;

  const goTo = useCallback((next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  }, [index]);

  const goBack = useCallback(() => {
    if (index === 0) {
      onExit();
      return;
    }
    goTo(index - 1);
  }, [index, onExit, goTo]);

  const select = useCallback(
    (archetype: ArchetypeId) => {
      onAnswer(index, archetype);

      // Give the selection state a beat to read, then move. The last answer
      // ends the quiz rather than revealing a button to press: every extra tap
      // between finishing and the reward costs readers who were already done.
      window.setTimeout(() => {
        if (!isLast) {
          setDirection(1);
          setIndex((current) => (current === index ? current + 1 : current));
          return;
        }

        // Built here from the props plus the choice just made, so it is
        // complete regardless of whether the parent has re-rendered yet.
        const final = [...answers];
        final[index] = archetype;
        onComplete(final.filter(Boolean) as ArchetypeId[]);
      }, 420);
    },
    [answers, index, isLast, onAnswer, onComplete],
  );

  // Keyboard: A–E (or 1–5) to answer, arrows to navigate.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (historyOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;

      const letter = KEYS.indexOf(event.key.toUpperCase());
      const digit = Number(event.key) - 1;
      const optionIndex = letter >= 0 ? letter : digit;

      if (optionIndex >= 0 && optionIndex < question.options.length) {
        event.preventDefault();
        select(question.options[optionIndex].archetype);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goBack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [question, select, goBack, historyOpen]);

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    touchStart.current = null;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    // Ignore mostly-vertical gestures so page scrolling still feels natural.
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx > 0) goBack();
  };

  return (
    <section
      className="relative mx-auto flex min-h-[92svh] w-full max-w-6xl flex-col px-5 pb-12 pt-24 sm:px-8"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ------------------------------------------------------- progress */}
      <div className="flex items-center gap-4">
        <div className="flex flex-1 gap-1.5" role="list" aria-label="Quiz progress">
          {QUESTIONS.map((item, i) => {
            const done = Boolean(answers[i]);
            const current = i === index;
            return (
              <button
                key={item.chapter}
                type="button"
                role="listitem"
                aria-label={`Question ${i + 1}${done ? ', answered' : ''}`}
                aria-current={current ? 'step' : undefined}
                // Only allow jumping to questions already reached.
                disabled={!done && i > answeredCount}
                onClick={() => goTo(i)}
                className="group h-6 flex-1 disabled:cursor-not-allowed"
              >
                <span
                  className="block h-[2px] w-full transition-all duration-500"
                  style={{
                    background: current
                      ? 'rgb(var(--accent))'
                      : done
                        ? 'rgb(var(--accent) / 0.4)'
                        : 'var(--color-line)',
                    transform: current ? 'scaleY(2)' : undefined,
                  }}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex shrink-0 items-center gap-2 text-ink-3 transition-colors hover:text-ink"
          aria-label="Review your choices"
        >
          <ListChecks size={15} strokeWidth={1.5} />
          <span className="label !tracking-[0.12em]">
            {answeredCount}/{QUESTIONS.length}
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------- question */}
      <div
        key={index}
        className="grid flex-1 items-start gap-10 pt-14 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] md:gap-16 md:pt-20"
        style={{
          animation: `quiz-in 520ms cubic-bezier(0.16,1,0.3,1)`,
          ['--enter-x' as string]: direction === 1 ? '28px' : '-28px',
        }}
      >
        <div className="md:sticky md:top-28">
          <div className="flex items-baseline gap-4">
            <span className="numeral text-5xl text-ink/20 md:text-6xl">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="label">{question.chapter}</span>
          </div>

          <h2 className="display-lg mt-6 max-w-[20ch] text-balance">{question.question}</h2>
        </div>

        <div className="space-y-2.5">
          {question.options.map((option) => {
            const isSelected = selected === option.archetype;
            return (
              <button
                key={option.text}
                type="button"
                onClick={() => select(option.archetype)}
                data-selected={isSelected}
                className="option"
                style={{ ['--accent' as string]: ARCHETYPES[option.archetype].accent }}
              >
                {/* The emoji takes the badge slot the letter used to hold. The
                    A–E shortcuts still work; they were only ever useful on a
                    keyboard, and almost nobody arrives here with one. */}
                <span className="option-key" aria-hidden="true">
                  {option.emoji}
                </span>
                <span className="text-[0.9375rem] leading-snug">{option.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------------------------------------------------- nav */}
      <div className="mt-12 flex items-center justify-between border-t border-line-soft pt-6">
        <button type="button" onClick={goBack} className="btn btn-quiet">
          <ArrowLeft size={15} strokeWidth={1.5} />
          {index === 0 ? 'Back to start' : 'Previous'}
        </button>

        <span className="label">{progress}% complete</span>
      </div>

      <Sheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        eyebrow="So far"
        title="Your choices"
      >
        <ol className="space-y-5">
          {QUESTIONS.map((item, i) => {
            const answer = answers[i];
            const chosen = answer
              ? item.options.find((option) => option.archetype === answer)
              : null;
            return (
              <li key={item.chapter} className="border-b border-line-soft pb-5 last:border-0">
                <button
                  type="button"
                  disabled={!chosen && i > answeredCount}
                  onClick={() => {
                    goTo(i);
                    setHistoryOpen(false);
                  }}
                  className="w-full text-left disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="numeral text-sm text-ink/25">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="label !tracking-[0.14em]">{item.chapter}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">
                    {chosen ? chosen.text : <span className="italic text-ink-3">Not answered yet</span>}
                  </p>
                </button>
              </li>
            );
          })}
        </ol>
      </Sheet>

      <style>{`
        @keyframes quiz-in {
          from { opacity: 0; transform: translateX(var(--enter-x)); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </section>
  );
}
