/**
 * Canonical archetype data. Imported by BOTH the browser bundle and the Node
 * server, so it must stay free of DOM/Node specifics and of asset imports —
 * `imageKey` / `sceneKey` are resolved to real URLs on the client only.
 */

export type ArchetypeId =
  | 'best_friend'
  | 'heir'
  | 'leader'
  | 'artist'
  | 'rival';

export interface DreamMovie {
  /** Key into the client-side asset map. */
  sceneKey: string;
  /** Korean line shown above the English subtitle. */
  hangul: string;
  /** One entry per scene beat. */
  subtitles: string[];
}

export interface Archetype {
  id: ArchetypeId;
  title: string;
  /** Short form used in tight spaces (chips, matrix rows, share text). */
  shortTitle: string;
  /** Two-word essence, set in the display serif. */
  essence: string;
  trait: string;
  traitExplanation: string;
  /** Single-sentence hook used on the result hero. */
  hook: string;
  desc: string;
  /** Three concrete traits rendered as an editorial list. */
  signals: string[];
  loveLanguage: string;
  /** Accent used for this archetype's UI moments, as `r g b`. */
  accent: string;
  imageKey: string;
  dreamMovie: DreamMovie;
}

export const ARCHETYPE_IDS: ArchetypeId[] = [
  'best_friend',
  'heir',
  'leader',
  'artist',
  'rival',
];

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  best_friend: {
    id: 'best_friend',
    title: 'The Devoted Childhood Best Friend',
    shortTitle: 'The Childhood Best Friend',
    essence: 'Quiet Devotion',
    trait: 'Quiet Loyalty & Understanding',
    traitExplanation:
      "In K-dramas, this trait satisfies viewers' deep longing for unwavering emotional safety, slow-burn devotion, and a partner who has loved them through every season.",
    hook: 'The person who was already there, every single time.',
    desc: "You thrive on deep-rooted trust, quiet consistency, and comforting emotional security. In your story arc, romance isn't about turbulent drama — it's about the person who has quietly observed your growth, remembered your smallest preferences, and stands firmly by your side through every season of life.",
    signals: [
      'You measure love in consistency, not intensity',
      'Being known matters more to you than being pursued',
      'You need a safe place before you can be brave',
    ],
    loveLanguage: 'Acts of quiet service',
    accent: '232 122 140',
    imageKey: 'archetype_best_friend',
    dreamMovie: {
      sceneKey: 'dream_best_friend',
      hangul: '처음부터 내 인생의 모든 행복은 항상 너였어',
      subtitles: [
        'For years, I quietly remembered your coffee order, your hard days, and your unspoken dreams…',
        'I watched you search for love elsewhere, holding back my heart because I feared losing you…',
        'But today, under the falling cherry blossoms, I realised I can no longer hide the truth.',
        "I don't just want to be the one who listens — I want to be the one you write your future with.",
        'In every timeline, you are my sanctuary, my home, and my forever love.',
      ],
    },
  },

  heir: {
    id: 'heir',
    title: 'The Enigmatic Second-Gen Heir',
    shortTitle: 'The Second-Gen Heir',
    essence: 'Guarded Fire',
    trait: 'Mysterious Tenderness & Grand Gestures',
    traitExplanation:
      'In K-dramas, this trait captivates viewers by contrasting high-stakes social power with secret, fiercely protective vulnerability reserved only for the lead.',
    hook: 'Cold to the world. Undone by exactly one person.',
    desc: 'You are drawn to intense loyalty disguised behind a cool exterior. Behind world expectations and sharp suits lies a fiercely protective heart ready to defy rules, create magical sanctuaries, and stand against the odds for the person who sees them for who they truly are.',
    signals: [
      'You are moved by restraint far more than by declarations',
      'You read the gesture nobody else noticed',
      'You want to be the exception, not the audience',
    ],
    loveLanguage: 'Protective grand gestures',
    accent: '216 180 120',
    imageKey: 'archetype_heir',
    dreamMovie: {
      sceneKey: 'dream_heir',
      hangul: '화려한 세상보다 내겐 너 하나가 전부야',
      subtitles: [
        'In a world built on artificial expectations and cold duty, I never trusted anyone…',
        'Until you looked past my title, held my hand in the rain, and saw the real me.',
        'Today, I leave behind the corporate politics and family pressure for good.',
        'I bought a quiet sanctuary where we can build a simple, magical life together.',
        'You are my only true luxury, my protective shield, and my lifelong promise.',
      ],
    },
  },

  leader: {
    id: 'leader',
    title: 'The Passionate Idealist Student Leader',
    shortTitle: 'The Idealist Leader',
    essence: 'Brave Warmth',
    trait: 'High Integrity & Warm Courage',
    traitExplanation:
      'In K-dramas, this trait resonates deeply because it pairs principled, heroic moral strength with adorable, flustered tenderness toward their love interest.',
    hook: 'Fearless in a crowd. Completely undone by you.',
    desc: 'You value courage, righteous passion, and moral clarity. Your ideal story features someone who speaks up for what is right, defends others with unwavering strength, and yet becomes endearing, flustered, and delightfully soft whenever they are around you.',
    signals: [
      'You fall for conviction before you fall for charm',
      'You want a partner who makes you braver, not smaller',
      'Shared purpose is your version of intimacy',
    ],
    loveLanguage: 'Words that mean something',
    accent: '138 180 214',
    imageKey: 'archetype_leader',
    dreamMovie: {
      sceneKey: 'dream_leader',
      hangul: '세상을 바꾸는 것보다 너를 지키는 게 내겐 더 가치 있어',
      subtitles: [
        'I spent my youth fighting for justice, speaking up for others, and standing alone in storms…',
        'Yet every time you walked into the room, my unshakeable confidence turned into flustered warmth.',
        'You taught me that the bravest thing I could ever do was let down my guard and let you in.',
        'I will stand between you and every hardship life ever sends your way.',
        'You are my courage, my moral anchor, and the sweetest victory of my life.',
      ],
    },
  },

  artist: {
    id: 'artist',
    title: 'The Soft & Creative Artist',
    shortTitle: 'The Creative Artist',
    essence: 'Gentle Depth',
    trait: 'Deep Observation & Quiet Sanctuaries',
    traitExplanation:
      "In K-dramas, this trait appeals to romantic souls through quiet emotional intimacy, artistic sensitivity, and peaceful sanctuaries away from life's noise.",
    hook: 'Loved in the details nobody else bothered to notice.',
    desc: 'You connect deeply through shared quietude, artistic sensitivity, and subtle details. Your romance arc unfolds in sunlit studios, rainy alleyways, and handwritten notes — where affection is expressed not through loud declarations, but through profound observation and gentle sanctuary.',
    signals: [
      'You feel most loved when you feel accurately seen',
      'Silence with the right person is your favourite sound',
      'You collect small moments the way others collect milestones',
    ],
    loveLanguage: 'Attention as affection',
    accent: '186 158 214',
    imageKey: 'archetype_artist',
    dreamMovie: {
      sceneKey: 'dream_artist',
      hangul: '내 모든 화폭의 끝은 항상 너라는 빛이었어',
      subtitles: [
        'In my sunlit studio, surrounded by blank canvases, I searched for true beauty…',
        'Every stroke of paint I mixed was secretly an attempt to capture the exact warmth of your smile.',
        'When the world felt overwhelming, you became the serene sanctuary where my soul found peace.',
        "I don't just want to paint you into my art — I want to build a quiet, beautiful life together.",
        'You are my eternal masterpiece, my muse, and my forever love story.',
      ],
    },
  },

  rival: {
    id: 'rival',
    title: 'The Witty Rival Turned Partner',
    shortTitle: 'The Witty Rival',
    essence: 'Electric Banter',
    trait: 'Playful Banter & Secret Protection',
    traitExplanation:
      'In K-dramas, this trait creates intoxicating screen chemistry through intellectual banter, playful friction, and secret, reliable protection when obstacles hit.',
    hook: 'Every argument was just an excuse to stay close.',
    desc: 'You love sharp intellect, playful banter, and mutual growth. In your story, love begins with clever teasing and competitive sparks, revealing a partner who quietly acts as your ultimate safety net when challenges arise.',
    signals: [
      'You need to be met, not managed',
      'Teasing is how you say something serious',
      'You want a rival in public and an ally in private',
    ],
    loveLanguage: 'Chosen closeness',
    accent: '228 87 111',
    imageKey: 'archetype_rival',
    dreamMovie: {
      sceneKey: 'dream_rival',
      hangul: '치열했던 모든 경쟁은 너에게 더 가까워지기 위한 변명이었어',
      subtitles: [
        'All those late-night debates, sharp banter, and competitive sparks were never about winning…',
        'It was the only way my stubborn heart knew how to stay in your orbit without giving myself away.',
        'When you broke down in the rain, I threw away my pride to hold the umbrella over you.',
        'I never cared about beating you — I only ever wanted to be worthy of standing by your side.',
        "You won my heart from the very first day, and I'll protect you for the rest of my life.",
      ],
    },
  },
};

export function isArchetypeId(value: unknown): value is ArchetypeId {
  return typeof value === 'string' && value in ARCHETYPES;
}

export function getArchetype(id: string | null | undefined): Archetype {
  return isArchetypeId(id) ? ARCHETYPES[id] : ARCHETYPES.best_friend;
}
