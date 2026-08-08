import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type {
  Database,
  Order,
  OrderStatus,
  QuizAttempt,
  SavedFavorite,
  User,
} from './types';
import type { ArchetypeId } from '../../shared/archetypes';
import type { ProductTier } from '../../shared/products';
import { log } from '../env';

const SCHEMA_FALLBACK_PATHS = [
  // tsx / vite-node: resolve next to this file.
  (() => {
    try {
      return path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
    } catch {
      return '';
    }
  })(),
  path.resolve(process.cwd(), 'server/db/schema.sql'),
];

function readSchema(): string {
  for (const candidate of SCHEMA_FALLBACK_PATHS) {
    if (candidate && fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  throw new Error('server/db/schema.sql not found');
}

type Row = Record<string, unknown>;

function toUser(row: Row): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: (row.name as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    totalPurchases: Number(row.total_purchases ?? 0),
  };
}

function toQuizAttempt(row: Row): QuizAttempt {
  return {
    id: String(row.id),
    userId: (row.user_id as string | null) ?? null,
    answers: (row.answers as ArchetypeId[]) ?? [],
    winningArchetype: row.winning_archetype as ArchetypeId,
    scoreBreakdown: (row.score_breakdown as Record<string, number>) ?? {},
    completedAt: new Date(row.completed_at as string).toISOString(),
  };
}

function toOrder(row: Row): Order {
  return {
    id: String(row.id),
    stripeSessionId: (row.stripe_session_id as string | null) ?? null,
    userId: (row.user_id as string | null) ?? null,
    email: String(row.email),
    productTier: row.product_tier as ProductTier,
    amountPaid: Number(row.amount_paid ?? 0),
    currency: String(row.currency ?? 'usd'),
    status: row.status as OrderStatus,
    downloadUrl: (row.download_url as string | null) ?? null,
    storageKey: (row.storage_key as string | null) ?? null,
    blueprint: (row.blueprint as Order['blueprint']) ?? null,
    winningArchetype: (row.winning_archetype as ArchetypeId | null) ?? null,
    quizAttemptId: (row.quiz_attempt_id as string | null) ?? null,
    failureReason: (row.failure_reason as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

/** Maps camelCase Order fields onto their column names for partial updates. */
const ORDER_COLUMNS: Record<string, string> = {
  stripeSessionId: 'stripe_session_id',
  userId: 'user_id',
  email: 'email',
  productTier: 'product_tier',
  amountPaid: 'amount_paid',
  currency: 'currency',
  status: 'status',
  downloadUrl: 'download_url',
  storageKey: 'storage_key',
  blueprint: 'blueprint',
  winningArchetype: 'winning_archetype',
  quizAttemptId: 'quiz_attempt_id',
  failureReason: 'failure_reason',
};

export class PostgresDatabase implements Database {
  private pool: Pool;
  private migrated: Promise<void> | null = null;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      // Supabase / Neon / Render all terminate TLS with their own CA chain.
      ssl: /localhost|127\.0\.0\.1/.test(connectionString)
        ? undefined
        : { rejectUnauthorized: false },
      max: Number(process.env.PGPOOL_MAX ?? 4),
      idleTimeoutMillis: 15_000,
    });
  }

  ready(): Promise<void> {
    if (!this.migrated) {
      this.migrated = this.pool
        .query(readSchema())
        .then(() => log('postgres schema ready'))
        .catch((error) => {
          this.migrated = null;
          throw error;
        });
    }
    return this.migrated;
  }

  private async query<T = Row>(text: string, values: unknown[] = []): Promise<T[]> {
    await this.ready();
    const result = await this.pool.query(text, values);
    return result.rows as T[];
  }

  async upsertUser(email: string, name?: string | null): Promise<User> {
    const rows = await this.query(
      `insert into users (email, name) values (lower($1), $2)
       on conflict (email) do update set name = coalesce(users.name, excluded.name)
       returning *`,
      [email.trim(), name ?? null],
    );
    return toUser(rows[0]);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const rows = await this.query('select * from users where email = lower($1)', [
      email.trim(),
    ]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const rows = await this.query('select * from users where id = $1', [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async incrementPurchases(userId: string): Promise<void> {
    await this.query(
      'update users set total_purchases = total_purchases + 1 where id = $1',
      [userId],
    );
  }

  async saveQuizAttempt(
    attempt: Omit<QuizAttempt, 'id' | 'completedAt'>,
  ): Promise<QuizAttempt> {
    const rows = await this.query(
      `insert into quiz_attempts (user_id, answers, winning_archetype, score_breakdown)
       values ($1, $2::jsonb, $3, $4::jsonb) returning *`,
      [
        attempt.userId,
        JSON.stringify(attempt.answers),
        attempt.winningArchetype,
        JSON.stringify(attempt.scoreBreakdown),
      ],
    );
    return toQuizAttempt(rows[0]);
  }

  async getQuizAttempt(id: string): Promise<QuizAttempt | null> {
    const rows = await this.query('select * from quiz_attempts where id = $1', [id]);
    return rows[0] ? toQuizAttempt(rows[0]) : null;
  }

  async listQuizAttempts(userId: string): Promise<QuizAttempt[]> {
    const rows = await this.query(
      'select * from quiz_attempts where user_id = $1 order by completed_at desc',
      [userId],
    );
    return rows.map(toQuizAttempt);
  }

  async createOrder(
    order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Order> {
    const rows = await this.query(
      `insert into orders (
         stripe_session_id, user_id, email, product_tier, amount_paid, currency,
         status, download_url, storage_key, blueprint, winning_archetype,
         quiz_attempt_id, failure_reason
       ) values (lower($1), $2, lower($3), $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
       on conflict (stripe_session_id) do update set updated_at = now()
       returning *`,
      [
        order.stripeSessionId,
        order.userId,
        order.email,
        order.productTier,
        order.amountPaid,
        order.currency,
        order.status,
        order.downloadUrl,
        order.storageKey,
        order.blueprint ? JSON.stringify(order.blueprint) : null,
        order.winningArchetype,
        order.quizAttemptId,
        order.failureReason,
      ],
    );
    return toOrder(rows[0]);
  }

  async updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
    const entries = Object.entries(patch).filter(
      ([key]) => key in ORDER_COLUMNS,
    ) as Array<[keyof typeof ORDER_COLUMNS, unknown]>;
    if (!entries.length) return this.getOrder(id);

    const sets = entries.map(
      ([key], i) =>
        `${ORDER_COLUMNS[key]} = $${i + 2}${key === 'blueprint' ? '::jsonb' : ''}`,
    );
    const values = entries.map(([key, value]) =>
      key === 'blueprint' && value ? JSON.stringify(value) : value,
    );
    const rows = await this.query(
      `update orders set ${sets.join(', ')}, updated_at = now() where id = $1 returning *`,
      [id, ...values],
    );
    return rows[0] ? toOrder(rows[0]) : null;
  }

  async getOrder(id: string): Promise<Order | null> {
    const rows = await this.query('select * from orders where id = $1', [id]);
    return rows[0] ? toOrder(rows[0]) : null;
  }

  async getOrderByStripeSession(sessionId: string): Promise<Order | null> {
    const rows = await this.query(
      'select * from orders where stripe_session_id = lower($1)',
      [sessionId],
    );
    return rows[0] ? toOrder(rows[0]) : null;
  }

  async listOrdersByEmail(email: string): Promise<Order[]> {
    const rows = await this.query(
      'select * from orders where email = lower($1) order by created_at desc',
      [email.trim()],
    );
    return rows.map(toOrder);
  }

  async addFavorite(userId: string, archetypeId: ArchetypeId): Promise<SavedFavorite> {
    const rows = await this.query(
      `insert into saved_favorites (user_id, archetype_id) values ($1, $2)
       on conflict (user_id, archetype_id) do update set saved_at = saved_favorites.saved_at
       returning *`,
      [userId, archetypeId],
    );
    const row = rows[0];
    return {
      id: String(row.id),
      userId: String(row.user_id),
      archetypeId: row.archetype_id as ArchetypeId,
      savedAt: new Date(row.saved_at as string).toISOString(),
    };
  }

  async removeFavorite(userId: string, archetypeId: ArchetypeId): Promise<void> {
    await this.query(
      'delete from saved_favorites where user_id = $1 and archetype_id = $2',
      [userId, archetypeId],
    );
  }

  async listFavorites(userId: string): Promise<SavedFavorite[]> {
    const rows = await this.query(
      'select * from saved_favorites where user_id = $1 order by saved_at desc',
      [userId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      archetypeId: row.archetype_id as ArchetypeId,
      savedAt: new Date(row.saved_at as string).toISOString(),
    }));
  }
}
