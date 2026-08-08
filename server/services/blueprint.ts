import type { ArchetypeId } from '../../shared/archetypes';

/** The structured document that both Gemini and the fallback writer produce. */
export interface BlueprintContent {
  archetype: ArchetypeId;
  archetypeTitle: string;
  subtitle: string;
  openingLetter: string;
  coreTruth: string[];
  loveLanguage: { name: string; why: string; examples: string[] };
  strengths: Array<{ title: string; detail: string }>;
  redFlags: Array<{ pattern: string; why: string; reframe: string }>;
  communicationTips: Array<{ situation: string; say: string; avoid: string }>;
  compatibility: Array<{
    archetype: string;
    percent: number;
    dynamic: string;
    advice: string;
  }>;
  dreamScenario: { title: string; hangul: string; scenes: string[] };
  thirtyDayPlan: Array<{ week: string; focus: string; actions: string[] }>;
  affirmations: string[];
  closing: string;
  /** True when written by Gemini rather than the deterministic fallback. */
  aiGenerated: boolean;
}

export interface BlueprintRequest {
  archetype: ArchetypeId;
  /** One archetype id per answered question, in order. */
  answers: ArchetypeId[];
  scoreBreakdown: Record<string, number>;
  name?: string | null;
}
