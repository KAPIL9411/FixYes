import { beforeEach, describe, expect, it } from 'vitest';
import type { GoogleIdentity } from '../src/auth/google-token';
import { createAuthService, type AuthService } from '../src/auth/service';
import { createApp } from '../src/app';
import { InMemoryAuthRepository } from './helpers/in-memory-auth-repository';
import { testEnv } from './helpers/test-env';

const AUDIENCE = 'web-client.apps.googleusercontent.com';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let repository: InMemoryAuthRepository;
let service: AuthService;
let app: ReturnType<typeof createApp>;
let currentNonce: string;
let verifierFails: boolean;

beforeEach(() => {
  repository = new InMemoryAuthRepository();
  currentNonce = '';
  verifierFails = false;

  const identity: GoogleIdentity = {
    subject: 'google-subject-1',
    email: 'customer@example.com',
    emailVerified: true,
    name: 'Test Customer',
  };

  service = createAuthService({
    repository,
    audiences: [AUDIENCE],
    verifyGoogleToken: async () => {
      if (verifierFails) throw new Error('bad token');
      return { ...identity, nonce: currentNonce };
    },
  });

  app = createApp({
    authService: service,
    checkDatabase: async () => true,
  });
});

async function issueNonce(): Promise<string> {
  const response = await app.request('/v1/auth/nonce', { method: 'POST' }, testEnv());
  expect(response.status).toBe(200);
  const body = (await response.json()) as { nonce: string };
  currentNonce = body.nonce;
  return body.nonce;
}

async function login(): Promise<{ token: string }> {
  const nonce = await issueNonce();
  const response = await app.request(
    '/v1/auth/google',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'test-id-token', nonce }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { token: string };
}

describe('HTTP auth boundary', () => {
  it('completes nonce -> login -> authenticated profile', async () => {
    const { token } = await login();

    const me = await app.request(
      '/v1/me',
      { headers: { authorization: `Bearer ${token}` } },
      testEnv(),
    );

    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      user: {
        id: expect.any(String),
        displayName: 'Test Customer',
        email: 'customer@example.com',
        emailVerified: true,
        roles: ['CUSTOMER'],
      },
    });
  });

  it('rejects a protected route without a bearer token', async () => {
    const response = await app.request('/v1/me', {}, testEnv());
    const body = (await response.json()) as {
      error: { code: string; requestId: string };
    };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  });

  it('rejects an invalid bearer token', async () => {
    const response = await app.request(
      '/v1/me',
      { headers: { authorization: 'Bearer not-a-session' } },
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it('rejects an invalid Google token', async () => {
    verifierFails = true;
    const nonce = await issueNonce();
    const response = await app.request(
      '/v1/auth/google',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'test-id-token', nonce }),
      },
      testEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_GOOGLE_TOKEN' } });
  });

  it('rejects a malformed JSON body with a stable code', async () => {
    const response = await app.request(
      '/v1/auth/google',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
  });

  it('sets a server-generated request ID on every response', async () => {
    const response = await app.request('/v1/health', {}, testEnv());
    expect(response.headers.get('x-request-id')).toMatch(UUID_PATTERN);
  });

  it('echoes an allowed CORS origin and omits a disallowed one', async () => {
    const allowed = await app.request(
      '/v1/health',
      { headers: { origin: 'http://localhost:8081' } },
      testEnv(),
    );
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');

    const denied = await app.request(
      '/v1/health',
      { headers: { origin: 'https://evil.example' } },
      testEnv(),
    );
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects an oversized JSON body', async () => {
    const response = await app.request(
      '/v1/auth/google',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'a'.repeat(70_000), nonce: 'b'.repeat(20) }),
      },
      testEnv(),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('returns 429 when the rate limiter rejects the request', async () => {
    const limitedApp = createApp({
      authService: service,
      checkDatabase: async () => true,
      rateLimiter: { limit: async () => ({ success: false }) },
    });

    const response = await limitedApp.request('/v1/auth/nonce', { method: 'POST' }, testEnv());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('reports readiness from the database probe', async () => {
    const ready = await app.request('/v1/ready', {}, testEnv());
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ ok: true, checks: { database: true } });

    const notReadyApp = createApp({
      authService: service,
      checkDatabase: async () => false,
    });
    const notReady = await notReadyApp.request('/v1/ready', {}, testEnv());
    expect(notReady.status).toBe(503);
  });

  it('returns a JSON 404 envelope for unknown routes', async () => {
    const response = await app.request('/v1/unknown', {}, testEnv());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
