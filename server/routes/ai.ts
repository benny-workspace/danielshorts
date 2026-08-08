import { Router } from 'express';
import { isArchetypeId, type ArchetypeId } from '../../shared/archetypes';
import { scoreQuiz } from '../../shared/questions';
import { getDb } from '../db';
import { capabilities } from '../env';
import { asyncRoute, optionalString, rateLimit } from '../lib/http';
import type { BlueprintContent } from '../services/blueprint';
import { composeBlueprint } from '../services/gemini';
import { verifyDownloadToken } from '../lib/tokens';

export const aiRouter = Router();

/** The teaser shown for free: enough to prove the writing is real, not the product. */
function toPreview(blueprint: BlueprintContent) {
  const [firstTruth] = blueprint.coreTruth;
  return {
    archetype: blueprint.archetype,
    archetypeTitle: blueprint.archetypeTitle,
    subtitle: blueprint.subtitle,
    openingLetter: blueprint.openingLetter,
    coreTruth: firstTruth ? [firstTruth] : [],
    loveLanguage: {
      name: blueprint.loveLanguage.name,
      why: blueprint.loveLanguage.why,
      examples: blueprint.loveLanguage.examples.slice(0, 2),
    },
    redFlags: blueprint.redFlags.slice(0, 1),
    communicationTips: blueprint.communicationTips.slice(0, 1),
    affirmations: blueprint.affirmations.slice(0, 3),
    aiGenerated: blueprint.aiGenerated,
    locked: {
      remainingRedFlags: Math.max(0, blueprint.redFlags.length - 1),
      remainingTips: Math.max(0, blueprint.communicationTips.length - 1),
      compatibilityRows: blueprint.compatibility.length,
      totalPages: 15,
    },
  };
}

/**
 * Generates the personalised blueprint from quiz answers.
 *
 * Free callers get a preview. The full document requires a signed download
 * token from a fulfilled order — the same token used for the PDF — so the paid
 * product cannot be pulled straight out of the API.
 */
aiRouter.post(
  '/generate-blueprint',
  rateLimit({ windowMs: 60_000, max: 8, key: 'ai-blueprint' }),
  asyncRoute(async (req, res) => {
    const answers: ArchetypeId[] = Array.isArray(req.body?.answers)
      ? req.body.answers.filter(isArchetypeId).slice(0, 20)
      : [];

    const archetype: ArchetypeId = isArchetypeId(req.body?.winningArchetype)
      ? req.body.winningArchetype
      : answers.length
        ? scoreQuiz(answers).winner
        : 'best_friend';

    const token = optionalString(req.body?.token, 800);
    let unlocked = false;

    if (token) {
      const claims = verifyDownloadToken(token);
      if (claims) {
        const order = await (await getDb()).getOrder(claims.orderId);
        unlocked = Boolean(order && order.status === 'fulfilled');
      }
    }

    const blueprint = await composeBlueprint({
      archetype,
      answers,
      scoreBreakdown: answers.length ? scoreQuiz(answers).breakdown : {},
      name: optionalString(req.body?.name),
    });

    res.json({
      aiEnabled: capabilities.gemini,
      unlocked,
      blueprint: unlocked ? blueprint : toPreview(blueprint),
    });
  }),
);
