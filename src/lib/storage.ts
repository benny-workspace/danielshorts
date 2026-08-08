import type { ArchetypeId } from '@shared/archetypes';

const FAVORITES_KEY = 'kdd.favorites.v2';
const LEGACY_KEY = 'kdrama_favorite_archetypes';
const SESSION_KEY = 'kdd.session.v1';

export interface Favorite {
  id: ArchetypeId;
  savedAt: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota — favourites are a convenience, not state
    // the app depends on, so failing to persist is not worth surfacing.
  }
}

export function getFavorites(): Favorite[] {
  const current = read<Favorite[]>(FAVORITES_KEY, []);
  if (current.length) return current;

  // One-time migration from the pre-rewrite storage shape.
  const legacy = read<Array<{ id: string; savedAt?: string }>>(LEGACY_KEY, []);
  if (!legacy.length) return [];

  const migrated = legacy.map((item) => ({
    id: item.id as ArchetypeId,
    savedAt: item.savedAt ?? new Date().toISOString(),
  }));
  write(FAVORITES_KEY, migrated);
  return migrated;
}

export function isFavorite(id: ArchetypeId): boolean {
  return getFavorites().some((favorite) => favorite.id === id);
}

export function toggleFavorite(id: ArchetypeId): Favorite[] {
  const favorites = getFavorites();
  const next = favorites.some((favorite) => favorite.id === id)
    ? favorites.filter((favorite) => favorite.id !== id)
    : [...favorites, { id, savedAt: new Date().toISOString() }];
  write(FAVORITES_KEY, next);
  return next;
}

export function removeFavorite(id: ArchetypeId): Favorite[] {
  const next = getFavorites().filter((favorite) => favorite.id !== id);
  write(FAVORITES_KEY, next);
  return next;
}

export interface StoredSession {
  email?: string;
  answers?: ArchetypeId[];
  winner?: ArchetypeId;
  attemptId?: string | null;
}

export const getSession = (): StoredSession => read<StoredSession>(SESSION_KEY, {});

export function saveSession(patch: StoredSession): StoredSession {
  const next = { ...getSession(), ...patch };
  write(SESSION_KEY, next);
  return next;
}
