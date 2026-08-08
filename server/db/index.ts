import { capabilities, env, log } from '../env';
import { MemoryDatabase } from './memory';
import type { Database } from './types';

export * from './types';

let instance: Database | null = null;
let activeDriver: 'postgres' | 'memory' = 'memory';

/**
 * Returns the active database. Postgres is used when DATABASE_URL is set; if it
 * fails to connect or migrate we fall back to the in-memory store rather than
 * taking the whole site down over a misconfigured connection string.
 */
export async function getDb(): Promise<Database> {
  if (instance) return instance;

  if (capabilities.postgres) {
    try {
      const { PostgresDatabase } = await import('./postgres');
      const pg = new PostgresDatabase(env.databaseUrl);
      await pg.ready();
      instance = pg;
      activeDriver = 'postgres';
      log('database driver: postgres');
      return instance;
    } catch (error) {
      console.error(
        '[kdrama] postgres unavailable, falling back to in-memory store:',
        (error as Error).message,
      );
    }
  }

  instance = new MemoryDatabase();
  await instance.ready();
  activeDriver = 'memory';
  log('database driver: memory');
  return instance;
}

export function getActiveDriver(): 'postgres' | 'memory' {
  return activeDriver;
}
