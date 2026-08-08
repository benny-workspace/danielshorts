import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { env } from './env.js';
import { HttpError } from './lib/http.js';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { checkoutRouter } from './routes/checkout.js';
import { configRouter } from './routes/config.js';
import { downloadRouter } from './routes/download.js';
import { quizRouter } from './routes/quiz.js';
import { userRouter } from './routes/user.js';
import { webhookRouter } from './routes/webhooks.js';

/**
 * Builds the API. Deliberately free of static-file and Vite concerns so the
 * same app can be mounted by the dev server, the bundled Node server, and the
 * serverless handler.
 */
export function createApiApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // The client is served from the same origin, so no cross-origin access is
  // required. `origin: false` sends no CORS headers, which — combined with
  // credentials — stops another site from reading a signed-in reader's orders
  // from their browser. Set APP_URL only if you genuinely serve the client
  // from a different host.
  app.use(
    cors({
      origin: env.appUrl || false,
      credentials: true,
    }),
  );

  // Mounted before the JSON parser: Stripe signatures are computed over the
  // raw bytes, which a parsed body would destroy.
  app.use('/api/webhooks', webhookRouter);

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  app.use('/api/config', configRouter);
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/quiz', quizRouter);
  app.use('/api/user', userRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/download', downloadRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown endpoint', code: 'not_found' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }

    const message = (error as Error)?.message ?? 'Unexpected server error';
    console.error('[kdrama] unhandled error:', message);
    res.status(500).json({
      error: env.nodeEnv === 'production' ? 'Something went wrong on our end.' : message,
      code: 'internal_error',
    });
  });

  return app;
}
