import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AnalyticsEvent,
  Database,
  Order,
  QuizAttempt,
  SavedFavorite,
  User,
} from './types.js';
import type { ArchetypeId } from '../../shared/archetypes.js';

interface Snapshot {
  users: User[];
  quizAttempts: QuizAttempt[];
  orders: Order[];
  favorites: SavedFavorite[];
  events: AnalyticsEvent[];
}

/**
 * Ceiling on retained events. Unlike every other record here, events arrive
 * unprompted and without bound, so the oldest are dropped rather than allowed
 * to grow a long-running local process without limit.
 */
const MAX_EVENTS = 20_000;

/**
 * Zero-dependency store used until DATABASE_URL is set. It persists to a JSON
 * file when the filesystem is writable (local dev) and stays purely in memory
 * otherwise (serverless), so the app is always functional even with no
 * infrastructure attached.
 */
export class MemoryDatabase implements Database {
  private users = new Map<string, User>();
  private quizAttempts = new Map<string, QuizAttempt>();
  private orders = new Map<string, Order>();
  private favorites = new Map<string, SavedFavorite>();
  /** Append-only and time-ordered, which is how every reader wants it. */
  private events: AnalyticsEvent[] = [];

  private file: string | null;
  private persistable = true;
  private writeQueue: Promise<void> = Promise.resolve();
  private loaded: Promise<void> | null = null;

  constructor(dataDir = '.data') {
    this.file = path.resolve(process.cwd(), dataDir, 'store.json');
  }

  ready(): Promise<void> {
    if (!this.loaded) this.loaded = this.load();
    return this.loaded;
  }

  private async load(): Promise<void> {
    if (!this.file) return;
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const snapshot = JSON.parse(raw) as Partial<Snapshot>;
      for (const user of snapshot.users ?? []) this.users.set(user.id, user);
      for (const a of snapshot.quizAttempts ?? []) this.quizAttempts.set(a.id, a);
      for (const o of snapshot.orders ?? []) this.orders.set(o.id, o);
      for (const f of snapshot.favorites ?? []) this.favorites.set(f.id, f);
      this.events = (snapshot.events ?? []).slice(-MAX_EVENTS);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // A missing file is the normal first-run case; anything else means the
      // filesystem is read-only, so drop to memory-only silently.
      if (code && code !== 'ENOENT') this.persistable = false;
    }
  }

  private persist(): void {
    if (!this.persistable || !this.file) return;
    const file = this.file;
    const snapshot: Snapshot = {
      users: [...this.users.values()],
      quizAttempts: [...this.quizAttempts.values()],
      orders: [...this.orders.values()],
      favorites: [...this.favorites.values()],
      events: this.events,
    };
    this.writeQueue = this.writeQueue
      .then(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(snapshot, null, 2), 'utf8');
      })
      .catch(() => {
        this.persistable = false;
      });
  }

  private static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async upsertUser(email: string, name?: string | null): Promise<User> {
    await this.ready();
    const normalized = MemoryDatabase.normalizeEmail(email);
    const existing = [...this.users.values()].find((u) => u.email === normalized);
    if (existing) {
      if (name && !existing.name) {
        existing.name = name;
        this.persist();
      }
      return existing;
    }
    const user: User = {
      id: randomUUID(),
      email: normalized,
      name: name ?? null,
      createdAt: new Date().toISOString(),
      totalPurchases: 0,
    };
    this.users.set(user.id, user);
    this.persist();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    await this.ready();
    const normalized = MemoryDatabase.normalizeEmail(email);
    return [...this.users.values()].find((u) => u.email === normalized) ?? null;
  }

  async getUserById(id: string): Promise<User | null> {
    await this.ready();
    return this.users.get(id) ?? null;
  }

  async incrementPurchases(userId: string): Promise<void> {
    await this.ready();
    const user = this.users.get(userId);
    if (!user) return;
    user.totalPurchases += 1;
    this.persist();
  }

  async saveQuizAttempt(
    attempt: Omit<QuizAttempt, 'id' | 'completedAt'>,
  ): Promise<QuizAttempt> {
    await this.ready();
    const record: QuizAttempt = {
      ...attempt,
      id: randomUUID(),
      completedAt: new Date().toISOString(),
    };
    this.quizAttempts.set(record.id, record);
    this.persist();
    return record;
  }

  async getQuizAttempt(id: string): Promise<QuizAttempt | null> {
    await this.ready();
    return this.quizAttempts.get(id) ?? null;
  }

  async listQuizAttempts(userId: string): Promise<QuizAttempt[]> {
    await this.ready();
    return [...this.quizAttempts.values()]
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  }

  async createOrder(
    order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Order> {
    await this.ready();
    const now = new Date().toISOString();
    const record: Order = {
      ...order,
      email: MemoryDatabase.normalizeEmail(order.email),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(record.id, record);
    this.persist();
    return record;
  }

  async updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
    await this.ready();
    const existing = this.orders.get(id);
    if (!existing) return null;
    const updated: Order = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(id, updated);
    this.persist();
    return updated;
  }

  async getOrder(id: string): Promise<Order | null> {
    await this.ready();
    return this.orders.get(id) ?? null;
  }

  async getOrderByStripeSession(sessionId: string): Promise<Order | null> {
    await this.ready();
    return (
      [...this.orders.values()].find((o) => o.stripeSessionId === sessionId) ?? null
    );
  }

  async listOrdersByEmail(email: string): Promise<Order[]> {
    await this.ready();
    const normalized = MemoryDatabase.normalizeEmail(email);
    return [...this.orders.values()]
      .filter((o) => o.email === normalized)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listOrdersSince(since: string): Promise<Order[]> {
    await this.ready();
    return [...this.orders.values()]
      .filter((o) => o.createdAt >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addFavorite(userId: string, archetypeId: ArchetypeId): Promise<SavedFavorite> {
    await this.ready();
    const existing = [...this.favorites.values()].find(
      (f) => f.userId === userId && f.archetypeId === archetypeId,
    );
    if (existing) return existing;
    const record: SavedFavorite = {
      id: randomUUID(),
      userId,
      archetypeId,
      savedAt: new Date().toISOString(),
    };
    this.favorites.set(record.id, record);
    this.persist();
    return record;
  }

  async removeFavorite(userId: string, archetypeId: ArchetypeId): Promise<void> {
    await this.ready();
    for (const [id, fav] of this.favorites) {
      if (fav.userId === userId && fav.archetypeId === archetypeId) {
        this.favorites.delete(id);
      }
    }
    this.persist();
  }

  async listFavorites(userId: string): Promise<SavedFavorite[]> {
    await this.ready();
    return [...this.favorites.values()]
      .filter((f) => f.userId === userId)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async recordEvent(event: Omit<AnalyticsEvent, 'id' | 'createdAt'>): Promise<void> {
    await this.recordEvents([event]);
  }

  async recordEvents(
    events: Array<Omit<AnalyticsEvent, 'id' | 'createdAt'>>,
  ): Promise<void> {
    if (!events.length) return;
    await this.ready();

    const now = new Date().toISOString();
    for (const event of events) {
      this.events.push({ ...event, id: randomUUID(), createdAt: now });
    }
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    this.persist();
  }

  async listEvents(since: string, limit: number): Promise<AnalyticsEvent[]> {
    await this.ready();
    const window: AnalyticsEvent[] = [];
    // Walking backwards from the newest lets the scan stop at the first row
    // outside the window, since the array is already in insertion order.
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const event = this.events[i];
      if (event.createdAt < since) break;
      window.push(event);
      if (window.length >= limit) break;
    }
    return window;
  }
}
