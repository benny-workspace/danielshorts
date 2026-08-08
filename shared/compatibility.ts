import type { ArchetypeId } from './archetypes.js';

export interface Compatibility {
  percent: number;
  label: string;
  desc: string;
}

type Matrix = Record<ArchetypeId, Partial<Record<ArchetypeId, Compatibility>>>;

export const COMPATIBILITY_MATRIX: Matrix = {
  best_friend: {
    heir: {
      percent: 88,
      label: 'Slow-Burn Comfort vs High-Stakes Wealth',
      desc: "Your quiet loyalty softens the heir's guarded exterior, giving them a comforting sanctuary away from high-stakes pressures.",
    },
    leader: {
      percent: 95,
      label: 'Unshakeable Moral Alliance',
      desc: 'A deeply harmonious partnership built on mutual trust, shared integrity, and quiet emotional safety.',
    },
    artist: {
      percent: 92,
      label: 'Gentle Soulmates',
      desc: "You nurture the artist's quiet inner world with patient warmth, sharing sunlit afternoons filled with unspoken understanding.",
    },
    rival: {
      percent: 85,
      label: 'Warm Harbour for a Fiery Spirit',
      desc: 'Playful teasing turns into deep trust as your steady loyalty becomes their ultimate safety net when challenges arise.',
    },
  },
  heir: {
    best_friend: {
      percent: 88,
      label: 'High-Stakes Romance & Safe Harbour',
      desc: 'Behind your grand gestures lies a secret longing for the simple, honest comfort only a childhood companion provides.',
    },
    leader: {
      percent: 90,
      label: 'Power Couple Dynamic',
      desc: 'Rivalling ideals clash with electric intensity before transforming into a formidable, highly respected union.',
    },
    artist: {
      percent: 94,
      label: 'Private Sanctuary Arc',
      desc: 'Your vast resources create a quiet haven where the gentle artist can create freely without world interruption.',
    },
    rival: {
      percent: 96,
      label: 'Intoxicating Spark & High Chemistry',
      desc: 'Sharp wits and fierce pride collide continuously, creating irresistible screen chemistry and fierce protection.',
    },
  },
  leader: {
    best_friend: {
      percent: 95,
      label: 'Enduring Support & Loyalty',
      desc: 'Your courageous public stance is anchored by steady, quiet private support, creating an unbreakable romantic foundation.',
    },
    heir: {
      percent: 90,
      label: 'Principles vs Power',
      desc: 'A compelling dynamic where moral courage challenges aristocratic influence, eventually forging a legendary partnership.',
    },
    artist: {
      percent: 89,
      label: 'Warm Shield & Creative Muse',
      desc: "You defend the gentle artist's delicate spirit from harsh societal pressures, inspiring their greatest creative works.",
    },
    rival: {
      percent: 93,
      label: 'Spirited Debates & Growth',
      desc: 'Two passionate minds constantly push each other to excel through witty intellectual sparring and fierce loyalty.',
    },
  },
  artist: {
    best_friend: {
      percent: 92,
      label: 'Soulful Connection & Peace',
      desc: 'Shared quietude and gentle observation allow romance to bloom naturally without noise or superficial drama.',
    },
    heir: {
      percent: 94,
      label: 'Hidden Refuge & Vulnerability',
      desc: 'Your sunlit studio offers the intense heir an enchanting escape where they can drop their heavy armour.',
    },
    leader: {
      percent: 89,
      label: 'Creative Inspiration & Shield',
      desc: "Your poetic depth softens the leader's intense sense of duty, giving them a comforting space to recharge.",
    },
    rival: {
      percent: 91,
      label: 'Contrast & Colour',
      desc: 'Bold, competitive energy meets quiet artistic sensitivity, creating a rich contrast where opposites inspire each other.',
    },
  },
  rival: {
    best_friend: {
      percent: 85,
      label: 'Banter to Warmth',
      desc: 'Your competitive teasing melts into deep affection when you realise their quiet presence is your favourite place to be.',
    },
    heir: {
      percent: 96,
      label: 'Unstoppable Sparks & High Drama',
      desc: 'Two proud, sharp-witted personalities collide with electric energy, masking deep secret protection behind clever banter.',
    },
    leader: {
      percent: 93,
      label: 'Witty Debates & Mutual Respect',
      desc: 'Sparkling intellectual friction transforms into profound mutual admiration as you both champion causes together.',
    },
    artist: {
      percent: 91,
      label: 'Fiery Spark meets Quiet Depth',
      desc: 'Your vibrant, teasing energy challenges the artist to step into the spotlight while they teach you the beauty of quiet moments.',
    },
  },
};

const FALLBACK: Compatibility = {
  percent: 90,
  label: 'Captivating K-Drama Synergy',
  desc: 'A rich storytelling dynamic filled with emotional resonance and chemistry.',
};

export function getCompatibility(from: ArchetypeId, to: ArchetypeId): Compatibility {
  return COMPATIBILITY_MATRIX[from]?.[to] ?? FALLBACK;
}
