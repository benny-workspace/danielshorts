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

  addFavorite(userId: string, archetypeId: ArchetypeId): Promise<SavedFavorite>;
  removeFavorite(userId: string, archetypeId: ArchetypeId): Promise<void>;
  listFavorites(userId: string): Promise<SavedFavorite[]>;
}
