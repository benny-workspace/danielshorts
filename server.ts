/**
 * Node entry point.
 *
 * Development: Express + Vite in middleware mode, so the API and the HMR client
 * share one origin on port 3000 and no proxy config is needed.
 *
 * Production: serves the built client from dist/ with an SPA fallback.
 *
 * Vercel does not use this file — it runs api/index.ts as a serverless function
 * and serves dist/ from its CDN. Both paths mount the identical Express API.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApiApp } from './server/app.js';
import { env } from './server/env.js';

const isProduction = env.nodeEnv === 'production';
const DIST_DIR = path.resolve(process.cwd(), 'dist');

async function start(): Promise<void> {
  const app = createApiApp();

  if (isProduction) {
    if (!fs.existsSync(DIST_DIR)) {
      throw new Error(`dist/ not found. Run "npm run build" before "npm start".`);
    }

    app.use(
      express.static(DIST_DIR, {
        index: false,
        maxAge: '1y',
        setHeaders(res, filePath) {
          // Hashed assets are immutable; the HTML shell must never be.
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );

    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(
      `\n  K-Drama Dreams  ·  ${isProduction ? 'production' : 'development'}\n  → http://localhost:${env.port}\n`,
    );
  });

  const shutdown = (signal: string) => () => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
