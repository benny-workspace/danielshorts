import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { env } from './env';
import { HttpError } from './lib/http';
import { aiRouter } from './routes/ai';
import { authRouter } from './routes/auth';
import { checkoutRouter } from './routes/checkout';
import { configRouter } from './routes/config';
import { downloadRouter } from './routes/download';
import { quizRouter } from './routes/quiz';
import { userRouter } from './routes/user';
import { webhookRouter } from './routes/webhooks';

/**
 * Builds the API. Deliberately free of static-file and Vite concerns so the
 * same app can be mounted by the dev server, the bundled Node server, and the
 * serverless handler.
 */
export function createApiApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: env.appUrl || true,
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
