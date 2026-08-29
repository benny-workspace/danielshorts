import type { ArchetypeId } from './archetypes.js';

export interface QuizOption {
  /**
   * Visual anchor, shown in place of the letter badge.
   *
   * This audience arrives from short-form video and scans rather than reads —
   * an emoji is parsed before the sentence beside it is, which is the whole
   * point of putting one on every answer.
   */
  emoji: string;
  text: string;
  archetype: ArchetypeId;
}

export interface QuizQuestion {
  /** Short editorial label rendered above the question. */
  chapter: string;
  question: string;
  options: QuizOption[];
}

/**
 * Seven questions, five answers each, always in the same archetype order:
 * best friend, heir, leader, artist, rival. Keeping that order fixed is what
 * lets an answer be rewritten without silently re-scoring the quiz.
 *
 * Answers are deliberately short. They were a full sentence each and read like
 * a novel on a phone; the pattern being measured survives the trim intact,
 * because it lives in which scene is chosen, not in how it is described.
 */
export const QUESTIONS: QuizQuestion[] = [
  {
    chapter: 'The first flutter',
    question: 'Walking home. What makes your heart jump?',
    options: [
      { emoji: '☕', text: 'Your drink, handed over. No asking.', archetype: 'best_friend' },
      { emoji: '🚗', text: 'An umbrella, from a car that slowed down.', archetype: 'heir' },
      { emoji: '🛡️', text: 'Someone defending a stranger.', archetype: 'leader' },
      { emoji: '🎨', text: 'Someone sketching the sky.', archetype: 'artist' },
      { emoji: '😏', text: 'Banter with someone trying to beat you.', archetype: 'rival' },
    ],
  },
  {
    chapter: 'Caught in the rain',
    question: 'Rain traps you inside. You…',
    options: [
      { emoji: '☔', text: 'Wait it out with your person.', archetype: 'best_friend' },
      { emoji: '🚙', text: 'Watch a ride appear for you.', archetype: 'heir' },
      { emoji: '🧥', text: 'Get everyone home safe.', archetype: 'leader' },
      { emoji: '🎧', text: 'Watch the drops and drift.', archetype: 'artist' },
      { emoji: '🏃', text: 'Race them to the café.', archetype: 'rival' },
    ],
  },
  {
    chapter: 'How you love',
    question: 'They are stressed. You…',
    options: [
      { emoji: '🍜', text: 'Cook. Sit with them. Say nothing.', archetype: 'best_friend' },
      { emoji: '🎁', text: 'Send something perfect to their door.', archetype: 'heir' },
      { emoji: '✍️', text: 'Write them a plan and back it.', archetype: 'leader' },
      { emoji: '🎵', text: 'Make them a playlist.', archetype: 'artist' },
      { emoji: '🧩', text: 'Fix it, and make them laugh doing it.', archetype: 'rival' },
    ],
  },
  {
    chapter: 'The hero shot',
    question: 'Someone gets treated unfairly. Best scene?',
    options: [
      { emoji: '🤝', text: 'The one who never leaves.', archetype: 'best_friend' },
      { emoji: '💼', text: 'The one who breaks rules to protect.', archetype: 'heir' },
      { emoji: '📣', text: 'The one who says it out loud.', archetype: 'leader' },
      { emoji: '🕯️', text: 'The one who makes them feel safe.', archetype: 'artist' },
      { emoji: '♟️', text: 'The one who fixes it in secret.', archetype: 'rival' },
    ],
  },
  {
    chapter: 'Golden hour',
    question: 'Your perfect afternoon together?',
    options: [
      { emoji: '🍦', text: 'Market stalls and shared ice cream.', archetype: 'best_friend' },
      { emoji: '🌇', text: 'A rooftop garden, city below.', archetype: 'heir' },
      { emoji: '☕', text: 'Volunteer, then argue over coffee.', archetype: 'leader' },
      { emoji: '🖼️', text: 'A quiet gallery down a sunlit alley.', archetype: 'artist' },
      { emoji: '🎮', text: 'Arcade. Winner picks dinner.', archetype: 'rival' },
    ],
  },
  {
    chapter: 'Under pressure',
    question: 'Everything goes wrong. What carries you?',
    options: [
      { emoji: '🌱', text: 'Patience. It always passes.', archetype: 'best_friend' },
      { emoji: '🔑', text: 'Building my own way out.', archetype: 'heir' },
      { emoji: '🧭', text: 'Doing the right thing anyway.', archetype: 'leader' },
      { emoji: '✨', text: 'Finding something beautiful in it.', archetype: 'artist' },
      { emoji: '♜', text: 'Out-thinking it.', archetype: 'rival' },
    ],
  },
  {
    chapter: 'The detail that stays',
    question: 'The smallest thing that means the most?',
    options: [
      { emoji: '🧠', text: 'They remembered something tiny.', archetype: 'best_friend' },
      { emoji: '🛋️', text: 'They protect your peace first.', archetype: 'heir' },
      { emoji: '🚀', text: 'They back what you are chasing.', archetype: 'leader' },
      { emoji: '🌙', text: 'They notice your mood shift.', archetype: 'artist' },
      { emoji: '🔥', text: 'They push you, and have your back.', archetype: 'rival' },
    ],
  },
];

export interface QuizScore {
  winner: ArchetypeId;
  /** Answer counts keyed by archetype, including zero-score archetypes. */
  breakdown: Record<ArchetypeId, number>;
  /** Winner's share of total answers, 0–100. */
  dominance: number;
  /** Every archetype ranked by score, winner first. */
  ranking: Array<{ id: ArchetypeId; count: number; percent: number }>;
}

/**
 * Scores a set of answers. Ties resolve toward the archetype whose winning
 * answer came first, so an early decisive choice beats a late one.
 */
export function scoreQuiz(answers: Array<ArchetypeId | null | undefined>): QuizScore {
  const breakdown = {
    best_friend: 0,
    heir: 0,
    leader: 0,
    artist: 0,
    rival: 0,
  } as Record<ArchetypeId, number>;

  const firstSeen = new Map<ArchetypeId, number>();

  answers.forEach((answer, index) => {
    if (!answer || !(answer in breakdown)) return;
    breakdown[answer] += 1;
    if (!firstSeen.has(answer)) firstSeen.set(answer, index);
  });

  const total = Object.values(breakdown).reduce((sum, n) => sum + n, 0) || 1;

  const ranking = (Object.keys(breakdown) as ArchetypeId[])
    .map((id) => ({
      id,
      count: breakdown[id],
      percent: Math.round((breakdown[id] / total) * 100),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (firstSeen.get(a.id) ?? Infinity) - (firstSeen.get(b.id) ?? Infinity);
    });

  return {
    winner: ranking[0].id,
    breakdown,
    dominance: ranking[0].percent,
    ranking,
  };
}
