import { Router } from 'express';
import { getArchetype, isArchetypeId, type ArchetypeId } from '../../shared/archetypes.js';
import { scoreQuiz } from '../../shared/questions.js';
import { getDb } from '../db/index.js';
import { resolveAppUrl } from '../env.js';
import { asyncRoute, badRequest, optionalString, parseEmail, rateLimit } from '../lib/http.js';
import { sendResultEmail } from '../services/email.js';

export const quizRouter = Router();

/**
 * Persists a completed attempt so results survive across devices, and emails
 * the reader their archetype when they opted in.
 */
quizRouter.post(
  '/save-result',
  rateLimit({ windowMs: 60_000, max: 30, key: 'quiz-save' }),
  asyncRoute(async (req, res) => {
    const answers: ArchetypeId[] = Array.isArray(req.body?.answers)
      ? req.body.answers.filter(isArchetypeId).slice(0, 20)
      : [];

    if (!answers.length) badRequest('answers must be a non-empty array of archetype ids');

    const score = scoreQuiz(answers);
    const winner = isArchetypeId(req.body?.winningArchetype)
      ? (req.body.winningArchetype as ArchetypeId)
      : score.winner;

    const db = await getDb();

    const rawEmail = optionalString(req.body?.email, 254);
    const name = optionalString(req.body?.name);
    const user = rawEmail ? await db.upsertUser(parseEmail(rawEmail), name) : null;

    const attempt = await db.saveQuizAttempt({
      userId: user?.id ?? null,
      answers,
      winningArchetype: winner,
      scoreBreakdown: score.breakdown,
    });

    let emailed = false;
    if (user && req.body?.sendEmail !== false) {
      const archetype = getArchetype(winner);
      const result = await sendResultEmail({
        to: user.email,
        archetypeTitle: archetype.title,
        hook: archetype.hook,
        resultUrl: `${resolveAppUrl(req)}/?archetype=${winner}`,
      });
      emailed = result.sent;
    }

    res.status(201).json({
      attemptId: attempt.id,
      userId: user?.id ?? null,
      winningArchetype: winner,
      scoreBreakdown: score.breakdown,
      ranking: score.ranking,
      emailed,
    });
  }),
);
