import type { ArchetypeId } from '@shared/archetypes';
import type { ProductTier } from '@shared/products';

export interface ApiError extends Error {
  status: number;
  code?: string;
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
    const body = payload as { error?: string; code?: string };
    const error = new Error(body.error ?? `Request failed (${response.status})`) as ApiError;
    error.status = response.status;
    error.code = body.code;
    throw error;
  }

  return payload as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

/* -------------------------------------------------------------- config --- */

export interface PublicProduct {
  tier: ProductTier;
  name: string;
  headline: string;
  kicker: string;
  amount: number;
  currency: string;
  description: string;
  deliverables: string[];
  badge: string | null;
  available: boolean;
}

export interface AppConfig {
  products: PublicProduct[];
  features: {
    checkout: boolean;
    checkoutMode: 'stripe_checkout' | 'payment_link' | 'disabled';
    fulfillmentReady: boolean;
    ai: boolean;
    email: boolean;
    accounts: boolean;
    persistence: boolean;
  };
}

export const getConfig = () => request<AppConfig>('/api/config');

/* ---------------------------------------------------------------- quiz --- */

export interface SaveResultResponse {
  attemptId: string;
  userId: string | null;
  winningArchetype: ArchetypeId;
  scoreBreakdown: Record<string, number>;
  emailed: boolean;
}

export const saveQuizResult = (body: {
  answers: ArchetypeId[];
  winningArchetype: ArchetypeId;
  email?: string;
  name?: string;
  sendEmail?: boolean;
}) => post<SaveResultResponse>('/api/quiz/save-result', body);

/* ------------------------------------------------------------ checkout --- */

export interface CheckoutResponse {
  mode: 'stripe_checkout' | 'payment_link' | 'unconfigured';
  orderId: string;
  url?: string;
  sessionId?: string;
  error?: string;
}

export const createCheckoutSession = (body: {
  tier: ProductTier;
  userEmail: string;
  winningArchetype: ArchetypeId;
  quizAnswers: ArchetypeId[];
  quizAttemptId?: string | null;
  name?: string;
}) => post<CheckoutResponse>('/api/checkout/create-session', body);

export interface OrderStatus {
  id: string;
  status: 'pending' | 'paid' | 'fulfilled' | 'failed' | 'refunded';
  productTier: ProductTier;
  amountPaid: number;
  currency: string;
  downloadUrl: string | null;
  /** Notion planner link, present only on fulfilled orders that include it. */
  templateUrl: string | null;
}

export const getOrder = (id: string, sessionId?: string | null) =>
  request<OrderStatus>(
    `/api/checkout/order/${encodeURIComponent(id)}` +
      (sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''),
  );

/* ------------------------------------------------------------------ ai --- */

export interface BlueprintPreview {
  archetypeTitle: string;
  subtitle: string;
  openingLetter: string;
  coreTruth: string[];
  loveLanguage: { name: string; why: string; examples: string[] };
  redFlags: Array<{ pattern: string; why: string; reframe: string }>;
  communicationTips: Array<{ situation: string; say: string; avoid: string }>;
  affirmations: string[];
  aiGenerated: boolean;
  locked: {
    remainingRedFlags: number;
    remainingTips: number;
    compatibilityRows: number;
    totalPages: number;
  };
}

export const generateBlueprint = (body: {
  answers: ArchetypeId[];
  winningArchetype: ArchetypeId;
  name?: string;
}) =>
  post<{ aiEnabled: boolean; unlocked: boolean; blueprint: BlueprintPreview }>(
    '/api/ai/generate-blueprint',
    body,
  );

/* ---------------------------------------------------------------- auth --- */

export interface Me {
  authenticated: boolean;
  user: { id: string; email: string; name: string | null; totalPurchases: number } | null;
}

export const getMe = () => request<Me>('/api/auth/me');

export const requestMagicLink = (email: string) =>
  post<{ ok: boolean; emailSent: boolean; devLink?: string }>('/api/auth/magic-link', {
    email,
  });

export const signOut = () => post<{ ok: boolean }>('/api/auth/signout', {});

/* ---------------------------------------------------------------- user --- */

export interface PublicOrder {
  id: string;
  productName: string;
  productHeadline: string;
  amountPaid: number;
  currency: string;
  status: string;
  downloadUrl: string | null;
  templateUrl: string | null;
  archetypeTitle: string | null;
  createdAt: string;
}

export const getOrders = () =>
  request<{ orders: PublicOrder[] }>('/api/user/orders');
