import fs from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export function hasReachablePostgresConfig(): boolean {
  const host = process.env.SQL_HOST?.trim();
  const user = process.env.SQL_USER?.trim();
  const database = process.env.SQL_DB_NAME?.trim();
  if (!host || !user || !database) {
    return false;
  }
  if (host.startsWith('/')) {
    // Cloud SQL Auth Proxy Unix socket path: ensure socket file actually exists on disk
    const socketPath = path.join(host, '.s.PGSQL.5432');
    return fs.existsSync(socketPath);
  }
  return true;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });
export type Database = typeof db;
