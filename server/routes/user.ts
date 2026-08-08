import { Router } from 'express';
import { getArchetype, isArchetypeId } from '../../shared/archetypes';
import { PRODUCTS } from '../../shared/products';
import { getDb, type Order } from '../db';
import { asyncRoute, badRequest, rateLimit } from '../lib/http';
import { currentUser } from './auth';

export const userRouter = Router();

function toPublicOrder(order: Order) {
  const product = PRODUCTS[order.productTier];
  return {
    id: order.id,
    productTier: order.productTier,
    productName: product?.name ?? order.productTier,
    productHeadline: product?.headline ?? '',
    amountPaid: order.amountPaid,
    currency: order.currency,
    status: order.status,
    // Withheld until fulfilment succeeds so the UI never links to a dead file.
    downloadUrl: order.status === 'fulfilled' ? order.downloadUrl : null,
    archetype: order.winningArchetype,
    archetypeTitle: order.winningArchetype
      ? getArchetype(order.winningArchetype).title
      : null,
    createdAt: order.createdAt,
  };
}

/** Order history for the signed-in reader. */
userRouter.get(
  '/orders',
  rateLimit({ windowMs: 60_000, max: 60, key: 'orders' }),
  asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to view your orders', code: 'unauthenticated' });
      return;
    }

    const db = await getDb();
    const orders = await db.listOrdersByEmail(user.email);
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      orders: orders.map(toPublicOrder),
    });
  }),
);

userRouter.get(
  '/favorites',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in first', code: 'unauthenticated' });
      return;
    }
    const favorites = await (await getDb()).listFavorites(user.id);
    res.json({
      favorites: favorites.map((favorite) => ({
        ...favorite,
        title: getArchetype(favorite.archetypeId).title,
      })),
    });
  }),
);

userRouter.post(
  '/favorites',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in first', code: 'unauthenticated' });
      return;
    }
    const { archetypeId } = req.body ?? {};
    if (!isArchetypeId(archetypeId)) badRequest('Unknown archetype id', 'invalid_archetype');

    const db = await getDb();
    const favorite = await db.addFavorite(user.id, archetypeId);
    res.status(201).json({ favorite });
  }),
);

userRouter.delete(
  '/favorites/:archetypeId',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in first', code: 'unauthenticated' });
      return;
    }
    const { archetypeId } = req.params;
    if (!isArchetypeId(archetypeId)) badRequest('Unknown archetype id', 'invalid_archetype');

    await (await getDb()).removeFavorite(user.id, archetypeId);
    res.json({ ok: true });
  }),
);

userRouter.get(
  '/quiz-history',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in first', code: 'unauthenticated' });
      return;
    }
    const attempts = await (await getDb()).listQuizAttempts(user.id);
    res.json({
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        winningArchetype: attempt.winningArchetype,
        title: getArchetype(attempt.winningArchetype).title,
        scoreBreakdown: attempt.scoreBreakdown,
        completedAt: attempt.completedAt,
      })),
    });
  }),
);
