import type { EventName } from '@shared/analytics';
import type { ProductTier } from '@shared/products';

/**
 * The dashboard's view of the API. Mirrors DashboardData on the server; kept
 * here rather than imported from `server/` so the browser bundle never pulls
 * in a module that reaches for `pg` or `stripe`.
 */
export interface DashboardData {
  generatedAt: string;
  range: { since: string; days: number };
  storage: { driver: string; durable: boolean; eventsStored: number; truncated: boolean };
  totals: {
    visitors: number;
    sessions: number;
    pageViews: number;
    quizCompletions: number;
    purchases: number;
    revenueCents: number;
    conversionRate: number;
  };
  funnel: Array<{
    name: EventName;
    label: string;
    hint: string;
    visitors: number;
    events: number;
    rateFromTop: number;
    rateFromPrev: number;
    lost: number;
  }>;
  questions: Array<{
    step: number;
    chapter: string;
    question: string;
    visitors: number;
    rateFromStart: number;
    lost: number;
  }>;
  tiers: Array<{
    tier: ProductTier;
    name: string;
    amount: number;
    clicks: number;
    reachedStripe: number;
    purchases: number;
    revenueCents: number;
    clickToPaid: number;
  }>;
  daily: Array<{
    day: string;
    visitors: number;
    pageViews: number;
    quizCompletions: number;
    purchases: number;
    revenueCents: number;
  }>;
  sources: Array<{ source: string; visitors: number; checkouts: number }>;
  devices: Array<{ device: string; visitors: number }>;
  countries: Array<{ country: string; visitors: number; checkouts: number }>;
  regions: Array<{ country: string; region: string; visitors: number; checkouts: number }>;
  archetypes: Array<{ archetype: string; visitors: number }>;
  delivery: {
    purchases: number;
    downloadClicks: number;
    downloadsServed: number;
    templateClicks: number;
  };
  orders: {
    total: number;
    pending: number;
    paid: number;
    fulfilled: number;
    failed: number;
    revenueCents: number;
    recent: Array<{ id: string; tier: ProductTier; status: string; amount: number; createdAt: string }>;
  };
  kanban: Array<{
    id: string;
    title: string;
    visitors: number;
    cards: Array<{ label: string; value: string; detail: string; tone: 'good' | 'warn' | 'bad' | 'plain' }>;
  }>;
}

export interface AdminSession {
  authenticated: boolean;
  configured: boolean;
  reason: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const body = payload as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export const getAdminSession = () => request<AdminSession>('/api/admin/session');

export const adminLogin = (password: string) =>
  request<{ ok: boolean }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

export const adminLogout = () => request<{ ok: boolean }>('/api/admin/logout', { method: 'POST' });

export const getStats = (days: number) =>
  request<DashboardData>(`/api/admin/stats?days=${encodeURIComponent(days)}`);
