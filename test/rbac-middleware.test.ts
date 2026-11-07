import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppRole } from '../src/db/schema';
import { createRequireAuth, requireRole } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error-handler';
import type { AppEnv } from '../src/types';
import { testEnv } from './helpers/test-env';

function roleApp(roles: AppRole[]) {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use(
    '/admin',
    createRequireAuth(async () => ({
      user: {
        id: 'user-1',
        displayName: 'Test User',
        email: 'user@example.com',
        emailVerified: true,
        roles,
      },
      sessionId: 'session-1',
    })),
  );
  app.use('/admin', requireRole('ADMIN'));
  app.get('/admin', (c) => c.json({ ok: true, userId: c.get('auth').user.id }));
  return app;
}

describe('RBAC middleware', () => {
  it('denies a customer even when the client sends an admin header', async () => {
    const response = await roleApp(['CUSTOMER']).request(
      '/admin',
      { headers: { authorization: 'Bearer session', 'x-role': 'ADMIN' } },
      testEnv(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('allows an authenticated admin', async () => {
    const response = await roleApp(['CUSTOMER', 'ADMIN']).request(
      '/admin',
      { headers: { authorization: 'Bearer session' } },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, userId: 'user-1' });
  });

  it('rejects a missing bearer token before role evaluation', async () => {
    const response = await roleApp(['ADMIN']).request('/admin', {}, testEnv());
    expect(response.status).toBe(401);
  });
});
