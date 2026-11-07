import { Hono } from 'hono';
import type { AppEnv } from '../types';

export interface HealthDependencies {
  checkDatabase: () => Promise<boolean>;
}

export function createHealthRoutes(deps: HealthDependencies) {
  return new Hono<AppEnv>()
    .get('/health', (c) => c.json({ ok: true, service: 'fixyes-api' }))
    .get('/ready', async (c) => {
      const database = await deps.checkDatabase();
      if (!database) {
        return c.json({ ok: false, checks: { database } }, 503);
      }
      return c.json({ ok: true, checks: { database } });
    });
}
