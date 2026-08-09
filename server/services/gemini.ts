import { ARCHETYPES, getArchetype } from '../../shared/archetypes.js';
import { getCompatibility } from '../../shared/compatibility.js';
import { QUESTIONS } from '../../shared/questions.js';
import { capabilities, env, log } from '../env.js';
import type { BlueprintContent, BlueprintRequest } from './blueprint.js';

const RESPONSE_SCHEMA = {
  type: 'object',
  required: [
    'subtitle',
    'openingLetter',
    'coreTruth',
    'loveLanguage',
    'strengths',
    'redFlags',
    'communicationTips',
    'dreamScenario',
    'dreamScript',
    'thirtyDayPlan',
    'affirmations',
    'closing',
  ],
  properties: {
    subtitle: { type: 'string' },
    openingLetter: { type: 'string' },
    coreTruth: { type: 'array', items: { type: 'string' } },
    loveLanguage: {
      type: 'object',
      required: ['name', 'why', 'examples'],
      properties: {
        name: { type: 'string' },
        why: { type: 'string' },
        examples: { type: 'array', items: { type: 'string' } },
      },
    },
    strengths: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'detail'],
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
      },
    },
    redFlags: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'why', 'reframe'],
        properties: {
          pattern: { type: 'string' },
          why: { type: 'string' },
          reframe: { type: 'string' },
        },
      },
    },
    communicationTips: {
      type: 'array',
      items: {
        type: 'object',
        required: ['situation', 'say', 'avoid'],
        properties: {
          situation: { type: 'string' },
          say: { type: 'string' },
          avoid: { type: 'string' },
        },
      },
    },
    dreamScenario: {
      type: 'object',
      required: ['title', 'hangul', 'scenes'],
      properties: {
        title: { type: 'string' },
        hangul: { type: 'string' },
        scenes: { type: 'array', items: { type: 'string' } },
      },
    },
    dreamScript: {
      type: 'object',
      required: ['logline', 'beats'],
      properties: {
        logline: { type: 'string' },
        beats: {
          type: 'array',
          items: {
            type: 'object',
            required: ['heading', 'direction', 'line'],
            properties: {
              heading: { type: 'string' },
              direction: { type: 'string' },
              line: { type: 'string' },
            },
          },
        },
      },
    },
    thirtyDayPlan: {
      type: 'array',
      items: {
        type: 'object',
        required: ['week', 'focus', 'actions'],
        properties: {
          week: { type: 'string' },
          focus: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    affirmations: { type: 'array', items: { type: 'string' } },
    closing: { type: 'string' },
  },
} as const;

/**
 * Slug lines and action beats for the fallback script. Written to fit any of
 * the five archetypes, then specialised at build time with that archetype's
 * trait and love language so it does not read as boilerplate.
 */
const SCRIPT_HEADINGS = [
  'INT. THE PLACE YOU ALWAYS END UP — LATE AFTERNOON',
  'EXT. THE STREET OUTSIDE — CONTINUOUS',
  'EXT. UNDER THE BLOSSOM TREES — GOLDEN HOUR',
  'INT. THE DOORWAY — NIGHT',
  'EXT. THE SAME PLACE, ONE YEAR LATER — DAY',
  'INT. HOME, NOW SHARED — MORNING',
];

const SCRIPT_DIRECTIONS: Array<(trait: string, loveLanguage: string) => string> = [
  (trait) =>
    `They arrive first, the way they always do. Two cups on the table before the other person is through the door — the small ${trait} that nobody has ever thanked them for. The camera stays on their hands.`,
  (_trait, loveLanguage) =>
    `Outside, the noise drops away. They rehearse the sentence twice under their breath and lose it both times. What they want is not a grand gesture; it is ${loveLanguage}, returned.`,
  () =>
    `Petals come down between them. The other person turns, already halfway to a joke, and stops — because this time the look is not being hidden. A long beat. The joke never arrives.`,
  () =>
    `Neither steps through the door. The whole year is standing in that gap. Then one hand moves first, and the waiting is finally over.`,
  () =>
    `The same table, the same light, everything ordinary — except now there is no performance in it. They are not being chosen. They were chosen a long time ago.`,
  () =>
    `Morning, unremarkable and completely earned. The camera pulls back and leaves them to it.`,
];

function describeAnswers(answers: string[]): string {
  return answers
    .map((answer, index) => {
      const question = QUESTIONS[index];
      if (!question) return '';
      const chosen = question.options.find((o) => o.archetype === answer);
      if (!chosen) return '';
      return `Q${index + 1} (${question.chapter}): "${question.question}"\n   → chose: "${chosen.text}"`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildPrompt(request: BlueprintRequest): string {
  const archetype = getArchetype(request.archetype);
  const breakdown = Object.entries(request.scoreBreakdown)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${ARCHETYPES[id as keyof typeof ARCHETYPES]?.title ?? id}: ${count}`)
    .join(', ');

  return `You are the head writer for "K-Drama Dreams", a boutique romance-personality studio. You are writing a paid, 15-page personalised Romantic Blueprint for one reader. It must feel handwritten for them — never generic, never listicle-flavoured.

READER PROFILE
- Name: ${request.name?.trim() || 'the reader (no name given — address them warmly as "you")'}
- Winning archetype: ${archetype.title} (${archetype.essence})
- Core trait: ${archetype.trait}
- Why this lands in K-drama: ${archetype.traitExplanation}
- Score spread across archetypes: ${breakdown || 'evenly split'}

THEIR ACTUAL QUIZ ANSWERS
${describeAnswers(request.answers)}

WRITING RULES
1. Reference at least four of their specific answers by their content, not by number. Show them you read what they picked.
2. Warm, cinematic, literary. Second person. Short paragraphs. No emoji. No "As an AI". No bullet-point voice in prose fields.
3. This is entertainment and self-reflection, not clinical psychology or therapy. Never diagnose. Never claim to predict the future as fact.
4. "redFlags" means patterns in *their own* romantic wiring that can quietly cost them — self-aware, kind, specific. Never about a named real person.
5. Korean lines must be natural, drama-quality Korean — not transliterated English.

LENGTH TARGETS
- openingLetter: 130–180 words, addressed directly to them.
- coreTruth: exactly 4 paragraphs, 60–90 words each.
- strengths: exactly 4 items, detail 40–60 words.
- redFlags: exactly 3 items.
- communicationTips: exactly 5 items covering conflict, distance, jealousy, asking for what they need, and repair after a fight.
- dreamScenario.scenes: exactly 6 cinematic beats, present tense, 25–40 words each.
- dreamScript: a filmable version of that same scene, for the premium edition.
  logline is one sentence under 30 words. beats has exactly 6 entries, matching
  the 6 scenes in order. Per beat: "heading" is a slug line in screenplay form
  (e.g. "INT. RECORD SHOP — RAIN, LATE AFTERNOON"), "direction" is 25–40 words
  of present-tense action describing what the camera sees, and "line" is a
  single spoken line of dialogue in English, in their voice, under 20 words.
- thirtyDayPlan: exactly 4 weeks, 3 actions each.
- affirmations: exactly 7 short lines.
- closing: 60–90 words.
- subtitle: one evocative line under 12 words.

Return JSON only, matching the provided schema.`;
}

/**
 * Asks Gemini for the personalised blueprint body. Returns null when no API key
 * is configured or the call fails, so callers can drop to the written fallback.
 */
export async function generateBlueprintWithGemini(
  request: BlueprintRequest,
): Promise<Partial<BlueprintContent> | null> {
  if (!capabilities.gemini) return null;

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

    const response = await ai.models.generateContent({
      model: env.geminiModel,
      contents: buildPrompt(request),
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        temperature: 1,
        maxOutputTokens: 8192,
      },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Partial<BlueprintContent>;
    log('gemini blueprint generated for', request.archetype);
    return parsed;
  } catch (error) {
    console.error('[kdrama] gemini generation failed:', (error as Error).message);
    return null;
  }
}

/**
 * Deterministic, hand-written blueprint used when Gemini is unavailable. It is
 * a real product on its own — the AI path only adds per-answer specificity.
 */
export function buildFallbackBlueprint(request: BlueprintRequest): BlueprintContent {
  const archetype = getArchetype(request.archetype);
  const answered = request.answers.filter(Boolean).length || QUESTIONS.length;
  const matchCount = request.scoreBreakdown[request.archetype] ?? 0;
  const dominance = Math.round((matchCount / answered) * 100) || 60;

  const others = (Object.keys(ARCHETYPES) as Array<keyof typeof ARCHETYPES>)
    .filter((id) => id !== archetype.id)
    .map((id) => {
      const compatibility = getCompatibility(archetype.id, id);
      return {
        archetype: ARCHETYPES[id].title,
        percent: compatibility.percent,
        dynamic: compatibility.label,
        advice: compatibility.desc,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  return {
    archetype: archetype.id,
    archetypeTitle: archetype.title,
    subtitle: archetype.hook,
    openingLetter: `You answered ${answered} questions, and ${dominance}% of your instincts pointed to the same place: ${archetype.title}. That is not a coincidence, and it is not a horoscope. It is a pattern you have been running for years — the kind of love you reach for when nobody is watching and there is no reason to perform.\n\nThis blueprint is about that pattern. What it gives you, what it quietly costs you, and how to ask for the thing you actually want without apologising for wanting it. Read it slowly. The parts that sting are usually the parts worth keeping.`,
    coreTruth: [
      `${archetype.desc}`,
      `Your defining trait is ${archetype.trait.toLowerCase()}. ${archetype.traitExplanation}`,
      `In practice this means you rarely fall for the loudest person in the room. You fall for the one whose behaviour is consistent across weeks, not the one whose opening line was best. That is a slower way to fall, and a far more durable one.`,
      `The risk is the mirror image of the gift: because you read people carefully, you will forgive a great deal before you ever say anything. Naming what you need early is not a threat to the relationship. It is the relationship.`,
    ],
    loveLanguage: {
      name: archetype.loveLanguage,
      why: `You register love through ${archetype.loveLanguage.toLowerCase()} — the evidence that someone kept you in mind when you were not in the room. Grand gestures are pleasant; being remembered accurately is what actually lands.`,
      examples: archetype.signals,
    },
    strengths: archetype.signals.map((signal, index) => ({
      title: ['Emotional accuracy', 'Staying power', 'Quiet standards'][index] ?? 'Depth',
      detail: `${signal}. It is why people trust you quickly and why the ones who stay tend to stay for a long time.`,
    })),
    redFlags: [
      {
        pattern: 'You wait to be chosen instead of choosing.',
        why: 'Reading people well makes it easy to sit back and let the other person set the pace, which reads as disinterest to anyone less fluent than you.',
        reframe: 'Make one small, explicit move per week. Clarity is a kindness, not a risk.',
      },
      {
        pattern: 'You absorb friction rather than naming it.',
        why: 'Keeping the peace short-term builds a private ledger the other person never gets to see, and resentment compounds silently.',
        reframe: 'Raise the small thing on the day it happens. Small conversations prevent large ones.',
      },
      {
        pattern: 'You mistake intensity for compatibility.',
        why: 'Emotional highs feel like proof, but the thing that lasts is boredom handled well — how you two are on an ordinary Tuesday.',
        reframe: 'Judge a connection by its calm days, not its dramatic ones.',
      },
    ],
    communicationTips: [
      {
        situation: 'When a conflict starts',
        say: '"I want to get this right more than I want to win it. Can we slow down?"',
        avoid: 'Going quiet and deciding privately that they should have known.',
      },
      {
        situation: 'When they go distant',
        say: '"I noticed you have been further away this week. Is it me, or is it everything else?"',
        avoid: 'Matching their distance to see how long they take to notice.',
      },
      {
        situation: 'When jealousy shows up',
        say: '"That made me feel further from you. I would like to feel close again."',
        avoid: 'Interrogating the situation instead of naming the feeling.',
      },
      {
        situation: 'When you need something',
        say: '"Here is the specific thing that would help me. Would that work for you?"',
        avoid: 'Hinting and then feeling let down when the hint is missed.',
      },
      {
        situation: 'Repairing after a fight',
        say: '"I am not over it yet, but I am not going anywhere. Give me tonight."',
        avoid: 'Declaring it fine before it is fine.',
      },
    ],
    compatibility: others,
    dreamScenario: {
      title: `${archetype.title} — Final Episode`,
      hangul: archetype.dreamMovie.hangul,
      scenes: archetype.dreamMovie.subtitles,
    },
    dreamScript: {
      logline: `${archetype.title}: the person who has been paying attention all along finally says the thing out loud — and finds out they were never the only one holding it in.`,
      // Built from the same beats as the dream scene, so the printed script and
      // the on-site film tell one story rather than two.
      beats: archetype.dreamMovie.subtitles.map((subtitle, index) => ({
        heading: SCRIPT_HEADINGS[index] ?? `SCENE ${index + 1} — CONTINUOUS`,
        direction:
          SCRIPT_DIRECTIONS[index]?.(archetype.trait.toLowerCase(), archetype.loveLanguage.toLowerCase()) ??
          'They hold the look a beat longer than they mean to. Neither one moves to fill the silence.',
        line: subtitle,
      })),
    },
    thirtyDayPlan: [
      {
        week: 'Week 1',
        focus: 'Notice the pattern',
        actions: [
          'Write down the three moments this week that made you feel most seen.',
          'Name the one thing you wanted to say and did not.',
          'Say it, in one sentence, to the person it was about.',
        ],
      },
      {
        week: 'Week 2',
        focus: 'Raise your floor',
        actions: [
          'Decide the one behaviour you will stop tolerating.',
          'Practise a direct request once, on something low-stakes.',
          'Reply honestly to one message you would normally soften.',
        ],
      },
      {
        week: 'Week 3',
        focus: 'Move first',
        actions: [
          'Initiate one plan instead of waiting to be invited.',
          'Tell one person specifically what you appreciate about them.',
          'Let one silence sit without filling it.',
        ],
      },
      {
        week: 'Week 4',
        focus: 'Choose on purpose',
        actions: [
          'Reread Week 1 and mark what changed.',
          'Write the version of the relationship you actually want, in present tense.',
          'Take the smallest real step toward it this week.',
        ],
      },
    ],
    affirmations: [
      'I am allowed to want what I want, out loud.',
      'Consistency is the standard, not the bonus.',
      'I do not audition for people who already have my loyalty.',
      'Being known is worth the discomfort of being clear.',
      'I choose calm over intensity.',
      'The right person will not need to be convinced.',
      'I am not too much. I have simply been asking too quietly.',
    ],
    closing: `The story you keep imagining is not a fantasy about someone else. It is a description of how you want to be treated, written in the only language your heart trusts. Take it seriously. Ask for it plainly. The people worth having will meet you there, and the ones who will not have just saved you a great deal of time.`,
    aiGenerated: false,
  };
}

/** Gemini result merged over the fallback, so every field is always populated. */
export async function composeBlueprint(
  request: BlueprintRequest,
): Promise<BlueprintContent> {
  const fallback = buildFallbackBlueprint(request);
  const ai = await generateBlueprintWithGemini(request);
  if (!ai) return fallback;

  return {
    ...fallback,
    ...ai,
    archetype: fallback.archetype,
    archetypeTitle: fallback.archetypeTitle,
    // Percentages are product data, not something the model should invent.
    compatibility: fallback.compatibility,
    // A half-filled script would print as blank pages in a paid PDF, so the
    // model's version is only taken when it actually has beats in it.
    dreamScript: ai.dreamScript?.beats?.length ? ai.dreamScript : fallback.dreamScript,
    aiGenerated: true,
  };
}
