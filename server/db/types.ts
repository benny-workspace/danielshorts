import type { EventName } from '../../shared/analytics.js';
import type { ArchetypeId } from '../../shared/archetypes.js';
import type { ProductTier } from '../../shared/products.js';
import type { BlueprintContent } from '../services/blueprint.js';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  totalPurchases: number;
}

export interface QuizAttempt {
  id: string;
  userId: string | null;
  answers: ArchetypeId[];
  winningArchetype: ArchetypeId;
  scoreBreakdown: Record<string, number>;
  completedAt: string;
}

export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'failed' | 'refunded';

export interface Order {
  id: string;
  stripeSessionId: string | null;
  userId: string | null;
  email: string;
  productTier: ProductTier;
  amountPaid: number;
  currency: string;
  status: OrderStatus;
  downloadUrl: string | null;
  /** Server-side path/key of the archived asset, never returned to clients. */
  storageKey: string | null;
  /**
   * The generated blueprint body. Stored so download links can re-render the
   * PDF on demand without depending on a filesystem surviving between
   * serverless invocations.
   */
  blueprint: BlueprintContent | null;
  winningArchetype: ArchetypeId | null;
  quizAttemptId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedFavorite {
  id: string;
  userId: string;
  archetypeId: ArchetypeId;
  savedAt: string;
}

/**
 * One step taken by one visitor.
 *
 * Deliberately anonymous: `visitorId` and `sessionId` are random ids minted in
 * the browser, not derived from an IP or a fingerprint, and no email or name is
 * stored here. That keeps the funnel measurable without turning the events
 * table into a second copy of the customer list.
 */
export interface AnalyticsEvent {
  id: string;
  name: EventName;
  /** Stable per browser, so returning readers are one visitor, not two. */
  visitorId: string;
  /** Per visit, so a funnel can be measured within a single sitting. */
  sessionId: string;
  tier: ProductTier | null;
  /** 1-based question number, for per-question drop-off. */
  step: number | null;
  archetype: string | null;
  path: string | null;
  /** Referring host, or the utm_source when one was present. */
  source: string | null;
  device: string | null;
  /** Amount in cents on purchase events. */
  value: number | null;
  createdAt: string;
}

export interface Database {
  ready(): Promise<void>;

  upsertUser(email: string, name?: string | null): Promise<User>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  incrementPurchases(userId: string): Promise<void>;

  saveQuizAttempt(attempt: Omit<QuizAttempt, 'id' | 'completedAt'>): Promise<QuizAttempt>;
  getQuizAttempt(id: string): Promise<QuizAttempt | null>;
  listQuizAttempts(userId: string): Promise<QuizAttempt[]>;

  createOrder(
    order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Order>;
  updateOrder(id: string, patch: Partial<Order>): Promise<Order | null>;
  getOrder(id: string): Promise<Order | null>;
  getOrderByStripeSession(sessionId: string): Promise<Order | null>;
  listOrdersByEmail(email: string): Promise<Order[]>;
  /** Every order in a window, for the revenue side of the dashboard. */
  listOrdersSince(since: string): Promise<Order[]>;

  addFavorite(userId: string, archetypeId: ArchetypeId): Promise<SavedFavorite>;
  removeFavorite(userId: string, archetypeId: ArchetypeId): Promise<void>;
  listFavorites(userId: string): Promise<SavedFavorite[]>;

  recordEvent(event: Omit<AnalyticsEvent, 'id' | 'createdAt'>): Promise<void>;
  /**
   * Raw events in a window, newest first.
   *
   * Aggregation happens in TypeScript rather than SQL on purpose. At this
   * site's volume the whole window is a few thousand rows, and computing the
   * rollups in one place means the Postgres and in-memory drivers cannot
   * produce subtly different numbers. `limit` is the guard against that
   * assumption ever quietly becoming false.
   */
  listEvents(since: string, limit: number): Promise<AnalyticsEvent[]>;
}
