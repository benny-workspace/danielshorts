import type { ArchetypeId } from './archetypes';

export interface QuizOption {
  text: string;
  archetype: ArchetypeId;
}

export interface QuizQuestion {
  /** Short editorial label rendered above the question. */
  chapter: string;
  question: string;
  options: QuizOption[];
}

export const QUESTIONS: QuizQuestion[] = [
  {
    chapter: 'The first flutter',
    question:
      'When walking home after a long day, what unexpected moment makes your heart flutter?',
    options: [
      {
        text: 'Someone quietly handing you your favourite hot drink without asking.',
        archetype: 'best_friend',
      },
      {
        text: 'A sleek car slowing down to offer an umbrella in a sudden drizzle.',
        archetype: 'heir',
      },
      {
        text: 'Someone standing up for a stranger on the bus and smiling at you afterwards.',
        archetype: 'leader',
      },
      {
        text: 'Noticing someone sketching the evening sky in a quiet park corner.',
        archetype: 'artist',
      },
      {
        text: 'Exchanging witty banter with someone who always tries to beat your score.',
        archetype: 'rival',
      },
    ],
  },
  {
    chapter: 'Caught in the rain',
    question: 'A sudden rainstorm traps you at school or work. What is your instinct?',
    options: [
      {
        text: 'Wait comfortably with someone who knows your umbrella story by heart.',
        archetype: 'best_friend',
      },
      {
        text: "Watch someone arrange a private shuttle so your shoes don't get wet.",
        archetype: 'heir',
      },
      {
        text: 'Take charge to organise extra coats and make sure everyone gets home safely.',
        archetype: 'leader',
      },
      {
        text: 'Admire the rhythm of raindrops on glass and draft a dreamy poem or doodle.',
        archetype: 'artist',
      },
      {
        text: 'Challenge someone to a dash through the rain to see who reaches the café first.',
        archetype: 'rival',
      },
    ],
  },
  {
    chapter: 'How you love',
    question: 'How do you prefer to show care when someone you cherish is stressed?',
    options: [
      {
        text: 'Preparing a cosy home-cooked meal and sitting together in peaceful silence.',
        archetype: 'best_friend',
      },
      {
        text: 'Sending a thoughtful, high-quality care package directly to their door.',
        archetype: 'heir',
      },
      {
        text: 'Writing an encouraging note with actionable advice and strong support.',
        archetype: 'leader',
      },
      {
        text: 'Creating a customised music playlist or handwritten sketch for them.',
        archetype: 'artist',
      },
      {
        text: 'Helping them solve their hardest problem while keeping the mood light with jokes.',
        archetype: 'rival',
      },
    ],
  },
  {
    chapter: 'The hero shot',
    question:
      'In a story where someone is treated unfairly, what kind of hero scene moves you most?',
    options: [
      {
        text: 'The quiet companion who stays by their side through every hardship without hesitation.',
        archetype: 'best_friend',
      },
      {
        text: 'The powerful figure who steps in and breaks rules to protect them.',
        archetype: 'heir',
      },
      {
        text: 'The brave voice speaking truth to authority in front of the entire assembly.',
        archetype: 'leader',
      },
      {
        text: 'The gentle soul who creates a safe haven where they can heal and be vulnerable.',
        archetype: 'artist',
      },
      {
        text: 'The sharp-witted rival who secretly orchestrates justice behind the scenes.',
        archetype: 'rival',
      },
    ],
  },
  {
    chapter: 'Golden hour',
    question: 'What setting feels most like your ideal romantic afternoon?',
    options: [
      {
        text: 'Browsing a neighbourhood market and sharing ice cream on a sunny bench.',
        archetype: 'best_friend',
      },
      {
        text: 'Strolling through a private rooftop garden with an enchanting city view.',
        archetype: 'heir',
      },
      {
        text: 'Volunteering together at a community event followed by animated coffee debate.',
        archetype: 'leader',
      },
      {
        text: 'Visiting a quiet art gallery or flower shop tucked in a sunlit alley.',
        archetype: 'artist',
      },
      {
        text: 'An intense game of trivia or arcade games where the winner picks dinner.',
        archetype: 'rival',
      },
    ],
  },
  {
    chapter: 'Under pressure',
    question:
      'When facing an unexpected personal challenge, what quality do you rely on most?',
    options: [
      {
        text: 'Unwavering patience and belief that steady support brings peace.',
        archetype: 'best_friend',
      },
      {
        text: 'Determination to overcome limitations and build your independent path.',
        archetype: 'heir',
      },
      {
        text: 'Uncompromising sense of purpose and belief in doing what is right.',
        archetype: 'leader',
      },
      {
        text: 'Creative intuition and finding beauty even in chaotic moments.',
        archetype: 'artist',
      },
      {
        text: 'Sharp strategic thinking and turning challenges into opportunities.',
        archetype: 'rival',
      },
    ],
  },
  {
    chapter: 'The detail that stays',
    question: 'What small detail means the most to you in a deep relationship?',
    options: [
      {
        text: 'Remembering a tiny preference you mentioned months ago in passing.',
        archetype: 'best_friend',
      },
      {
        text: 'Protecting your comfort and peace of mind before you even ask.',
        archetype: 'heir',
      },
      {
        text: 'Supporting your ambitions and inspiring you to stand tall for your values.',
        archetype: 'leader',
      },
      {
        text: 'Noticing subtle shifts in your mood that nobody else pays attention to.',
        archetype: 'artist',
      },
      {
        text: 'Knowing how to challenge you to grow while always having your back.',
        archetype: 'rival',
      },
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
