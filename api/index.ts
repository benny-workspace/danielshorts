/**
 * Vercel serverless entry.
 *
 * vercel.json rewrites every /api/* request here, and the Express app routes on
 * the original URL. Static assets are served by Vercel's CDN from dist/, so
 * this function only ever handles API traffic.
 */
import { createApiApp } from '../server/app';

export default createApiApp();
