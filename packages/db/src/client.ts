import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
/** Driver-agnostic Drizzle handle: same query API for Postgres and embedded PGlite. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export interface DbHandle {
  db: Database;
  /** "postgres" for a real server, "pglite" for the embedded dev database. */
  kind: 'postgres' | 'pglite';
  /** Where the data lives, for logs (password stripped). */
  location: string;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export interface DbOptions {
  /** postgres://… connection string. Defaults to env DATABASE_URL. */
  url?: string;
  /**
   * Embedded PGlite data directory used when no URL is set, or "memory://"
   * for a throwaway database. Defaults to env DATABASE_PATH, then
   * <repo>/.data/pglite.
   */
  path?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = resolve(here, '../drizzle');
export const DEFAULT_PGLITE_DIR = resolve(here, '../../../.data/pglite');

/**
 * Opens the database. With DATABASE_URL set it connects to Postgres;
 * otherwise it runs Postgres embedded in-process (PGlite, WebAssembly), so
 * local development needs no Docker or install.
 */
export function openDb(opts: DbOptions = {}): DbHandle {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    const db = drizzlePg(pool, { schema }) as unknown as Database;
    return {
      db,
      kind: 'postgres',
      location: url.replace(/\/\/([^:@/]+):[^@]*@/, '//$1:***@'),
      migrate: () => migratePg(db as never, { migrationsFolder: MIGRATIONS_DIR }),
      close: () => pool.end(),
    };
  }
  const path = opts.path ?? process.env.DATABASE_PATH ?? DEFAULT_PGLITE_DIR;
  if (!path.startsWith('memory://')) mkdirSync(path, { recursive: true });
  const client = new PGlite(path);
  const db = drizzlePglite(client, { schema }) as unknown as Database;
  return {
    db,
    kind: 'pglite',
    location: path,
    migrate: () => migratePglite(db as never, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => client.close(),
  };
}
