import { Hono } from 'hono';
import type { AppEnv } from '../types';

export function createMeRoutes() {
  return new Hono<AppEnv>().get('/me', (c) => c.json({ user: c.get('auth').user }));
}
