import type { Archetype } from '@shared/archetypes';
import { Music, Pause, Play, RotateCcw, SkipForward, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { image } from '../assets';
import { OstPlayer } from '../lib/audio';
import { useReducedMotion } from './primitives';

const BEAT_MS = 5600;

/** Alternating Ken-Burns anchors so consecutive beats never push identically. */
const ORIGINS = ['50% 40%', '38% 55%', '62% 42%', '45% 62%', '55% 38%', '50% 50%'];

export function DreamScene({
  archetype,
  autoPlay = false,
}: {
  archetype: Archetype;
  autoPlay?: boolean;
}) {
  const beats = archetype.dreamMovie.subtitles;
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const reducedMotion = useReducedMotion();

  const ost = useRef<OstPlayer | null>(null);
  if (!ost.current && typeof window !== 'undefined') ost.current = new OstPlayer();

  useEffect(() => () => ost.current?.dispose(), []);

  // Reset whenever the archetype changes so a replay never shows stale beats.
  useEffect(() => {
    setBeat(0);
    setPlaying(false);
    setStarted(false);
  }, [archetype.id]);

  const play = useCallback(() => {
    setStarted(true);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (autoPlay) {
      const id = window.setTimeout(play, 700);
      return () => window.clearTimeout(id);
    }
  }, [autoPlay, play]);

  useEffect(() => {
    if (!playing) return;

    const id = window.setInterval(() => {
      setBeat((current) => {
        if (current >= beats.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, BEAT_MS);

    return () => window.clearInterval(id);
  }, [playing, beats.length]);

  const nextBeat = useCallback(() => {
    setStarted(true);
    setBeat((current) => Math.min(current + 1, beats.length - 1));
  }, [beats.length]);

  const replay = useCallback(() => {
    setBeat(0);
    setStarted(true);
    setPlaying(true);
  }, []);

  const toggleMusic = useCallback(async () => {
    const player = ost.current;
    if (!player) return;
    const nowPlaying = await player.toggle(
      archetype.id === 'rival' || archetype.id === 'heir' ? 'bright' : 'warm',
    );
    setMusicOn(nowPlaying);
  }, [archetype.id]);

  const progress = useMemo(
    () => ((beat + (started ? 1 : 0)) / beats.length) * 100,
    [beat, beats.length, started],
  );

  const finished = started && !playing && beat === beats.length - 1;

  return (
    <div className="film-frame aspect-[4/5] w-full sm:aspect-video lg:aspect-[21/9]">
      {/* scrubber */}
      <div className="absolute inset-x-0 top-0 z-30 h-[2px] bg-white/10">
        <div
          className="h-full transition-[width] duration-700 ease-out"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, rgb(${archetype.accent}), var(--color-gold))`,
          }}
        />
      </div>

      {/* still */}
      <img
        key={`${archetype.id}-${beat}`}
        src={image(archetype.dreamMovie.sceneKey)}
        alt={`${archetype.title} — dream outcome scene`}
        className={`h-full w-full object-cover ${started && !reducedMotion ? 'ken-burns' : 'scale-105'}`}
        style={{ ['--kb-origin' as string]: ORIGINS[beat % ORIGINS.length] }}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-ink-950/55" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_45%,transparent_38%,rgba(6,5,10,0.72)_100%)]" />

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-4">
        <span className="flex items-center gap-2 border border-white/15 bg-ink-950/70 px-2.5 py-1 backdrop-blur-md">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: `rgb(${archetype.accent})` }}
          />
          <span className="label !text-[0.625rem] !tracking-[0.16em] !text-ivory-2">
            Final episode · Dream outcome
          </span>
        </span>

        <div className="flex items-center gap-1.5">
          <SceneButton onClick={nextBeat} label="Next beat">
            <SkipForward size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">Next beat</span>
          </SceneButton>
          <SceneButton onClick={toggleMusic} label={musicOn ? 'Mute score' : 'Play score'} active={musicOn}>
            {musicOn ? <Music size={13} strokeWidth={1.5} /> : <VolumeX size={13} strokeWidth={1.5} />}
            <span className="hidden sm:inline">{musicOn ? 'Score on' : 'Score'}</span>
          </SceneButton>
        </div>
      </div>

      {/* centre control */}
      {(!started || finished) && (
        <button
          type="button"
          onClick={finished ? replay : play}
          aria-label={finished ? 'Replay scene' : 'Play scene'}
          className="absolute inset-0 z-20 m-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/70 bg-ink-950/45 text-ivory backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-ink-950/70 sm:h-20 sm:w-20"
        >
          <span
            className="absolute -inset-px rounded-full opacity-60"
            style={{ boxShadow: `0 0 0 1px rgb(${archetype.accent} / 0.5)` }}
          />
          {finished ? (
            <RotateCcw size={22} strokeWidth={1.4} />
          ) : (
            <Play size={24} strokeWidth={1.4} className="ml-1" fill="currentColor" />
          )}
        </button>
      )}

      {/* subtitles */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-14 text-center sm:px-10 sm:pb-16">
        <p
          key={`hangul-${beat}`}
          className="display text-sm italic tracking-wide transition-opacity duration-700 sm:text-base"
          style={{
            color: `rgb(${archetype.accent})`,
            opacity: started ? 0.9 : 0,
            textShadow: '0 2px 18px rgba(0,0,0,0.9)',
          }}
        >
          {archetype.dreamMovie.hangul}
        </p>

        <p
          key={`sub-${beat}`}
          className="subtitle-en mt-3"
          style={{
            opacity: started ? 1 : 0,
            transform: started ? 'none' : 'translateY(8px)',
            transition: 'opacity 600ms ease, transform 600ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {beats[beat]}
        </p>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {beats.map((_, i) => (
            <span
              key={i}
              className="beat-dot"
              style={{
                width: i === beat ? 22 : 8,
                background:
                  i === beat
                    ? `rgb(${archetype.accent})`
                    : i < beat
                      ? 'rgba(255,255,255,0.45)'
                      : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-white/10 bg-gradient-to-t from-ink-950/90 to-transparent px-3 py-2.5 sm:px-4">
        <span className="label !text-[0.625rem] !tracking-[0.16em]">
          Beat {beat + 1} / {beats.length}
        </span>

        <div className="flex items-center gap-1.5">
          {started && !finished ? (
            <SceneButton
              onClick={() => setPlaying((current) => !current)}
              label={playing ? 'Pause' : 'Resume'}
            >
              {playing ? <Pause size={13} strokeWidth={1.5} /> : <Play size={13} strokeWidth={1.5} />}
              <span className="hidden sm:inline">{playing ? 'Pause' : 'Resume'}</span>
            </SceneButton>
          ) : null}
          <SceneButton onClick={replay} label="Replay scene">
            <RotateCcw size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">Replay</span>
          </SceneButton>
        </div>
      </div>
    </div>
  );
}

function SceneButton({
  children,
  onClick,
  label,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex items-center gap-1.5 border px-2.5 py-1 text-[0.6875rem] font-medium backdrop-blur-md transition-all duration-200 ${
        active
          ? 'border-white/40 bg-white/15 text-ivory'
          : 'border-white/15 bg-ink-950/70 text-ivory-2 hover:border-white/35 hover:text-ivory'
      }`}
    >
      {children}
    </button>
  );
}
