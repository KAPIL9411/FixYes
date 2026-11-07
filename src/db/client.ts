import { neon, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWebSocket } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export function createHttpDb(databaseUrl: string) {
  return drizzleHttp(neon(databaseUrl), { schema });
}

export function createWebSocketDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    db: drizzleWebSocket(pool, { schema }),
    close: () => pool.end(),
  };
}
