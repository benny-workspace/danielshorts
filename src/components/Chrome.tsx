import { Heart, User } from 'lucide-react';
import { Reveal } from './primitives';

export function Header({
  onOpenLibrary,
  savedCount,
  onHome,
}: {
  onOpenLibrary: () => void;
  savedCount: number;
  onHome: () => void;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line-soft bg-ink-950/72 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <button
          type="button"
          onClick={onHome}
          className="group flex items-center gap-2.5"
          aria-label="K-Drama Dreams — home"
        >
          <span
            className="h-1.5 w-1.5 rounded-full transition-transform duration-300 group-hover:scale-150"
            style={{ background: 'rgb(var(--accent))' }}
          />
          <span className="label !tracking-[0.24em] !text-ivory">K-Drama Dreams</span>
        </button>

        <button
          type="button"
          onClick={onOpenLibrary}
          className="flex items-center gap-2 border border-line px-3 py-1.5 text-xs text-ivory-2 transition-colors hover:border-[rgb(var(--accent)/0.5)] hover:text-ivory"
        >
          {savedCount > 0 ? (
            <>
              <Heart size={13} strokeWidth={1.6} fill="currentColor" />
              <span className="numeral">{savedCount}</span>
              <span className="hidden sm:inline">saved</span>
            </>
          ) : (
            <>
              <User size={13} strokeWidth={1.6} />
              <span>My library</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}

const STATS = [
  { value: '949,672', label: 'Views in 28 days' },
  { value: '16,093', label: 'Community followers' },
  { value: '+87%', label: 'Monthly growth' },
  { value: '3,256', label: 'Products purchased' },
  { value: '1,357', label: 'Relationships sparked' },
];

export function Proof() {
  return (
    <section className="border-t border-line-soft bg-ink-950">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 md:py-24">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display-lg max-w-[16ch]">Built on a real audience.</h2>
            <p className="max-w-[26ch] text-sm leading-relaxed text-ivory-3">
              Numbers from our community and the readers who used these guides.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid grid-cols-2 gap-px border border-line-soft bg-line-soft sm:grid-cols-3 lg:grid-cols-5">
          {STATS.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 60}>
              <div className="h-full bg-ink-950 px-5 py-7">
                <p className="numeral text-3xl text-ivory md:text-[2.5rem]">{stat.value}</p>
                <p className="mt-2 text-[0.6875rem] leading-snug text-ivory-3">{stat.label}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={220}>
          <p className="mt-8 max-w-[44ch] border-l-2 border-[rgb(var(--accent)/0.5)] pl-5 text-sm leading-relaxed text-ivory-2">
            Reported by readers who got clear on what they wanted — and then went and
            asked for it.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line-soft bg-ink-950">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="display-md">K-Drama Dreams</p>
            <p className="mt-2 max-w-[30ch] text-xs leading-relaxed text-ivory-3">
              For people who take their K-dramas seriously.
            </p>
          </div>

          <div className="flex flex-col gap-2 text-xs text-ivory-3 sm:items-end">
            <a
              href="mailto:john.john37530@gmail.com"
              className="transition-colors hover:text-ivory"
            >
              john.john37530@gmail.com
            </a>
            <a
              href="https://www.facebook.com/danieldoshorts"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-ivory"
            >
              Facebook · @danieldoshorts
            </a>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line-soft pt-6 text-[0.6875rem] text-ivory-3 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} K-Drama Dreams. All rights reserved.</p>
          <p>Created for entertainment and creative self-reflection.</p>
        </div>
      </div>
    </footer>
  );
}
