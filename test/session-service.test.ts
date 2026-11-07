import { beforeEach, describe, expect, it } from 'vitest';
import type { GoogleIdentity } from '../src/auth/google-token';
import { createAuthService, type AuthService } from '../src/auth/service';
import { sha256Hex } from '../src/lib/crypto';
import { InMemoryAuthRepository } from './helpers/in-memory-auth-repository';
import { TestClock } from './helpers/test-clock';

const DAY = 24 * 60 * 60 * 1000;
const AUDIENCE = 'web-client.apps.googleusercontent.com';

let repository: InMemoryAuthRepository;
let clock: TestClock;
let service: AuthService;
let currentNonce: string;
let identity: GoogleIdentity;

beforeEach(() => {
  repository = new InMemoryAuthRepository();
  clock = new TestClock();
  currentNonce = '';

  identity = {
    subject: 'google-subject-1',
    email: 'customer@example.com',
    emailVerified: true,
    name: 'Test Customer',
  };

  service = createAuthService({
    repository,
    audiences: [AUDIENCE],
    clock,
    verifyGoogleToken: async () => ({ ...identity, nonce: currentNonce }),
  });
});

async function login(): Promise<{ token: string; userId: string }> {
  const { nonce } = await service.issueNonce();
  currentNonce = nonce;
  const result = await service.loginWithGoogle({ idToken: 'test-id-token', nonce });
  return { token: result.token, userId: result.user.id };
}

describe('session authentication', () => {
  it('stores only a hash of the token and authenticates the bearer', async () => {
    const { token } = await login();
    const stored = repository.sessions.get(await sha256Hex(token));

    expect(token).not.toHaveLength(0);
    expect(stored).toBeDefined();
    expect([...repository.sessions.keys()]).toContain(await sha256Hex(token));
    expect([...repository.sessions.keys()]).not.toContain(token);

    const auth = await service.authenticate(token);
    expect(auth?.user.email).toBe('customer@example.com');
    expect(auth?.user.roles).toEqual(['CUSTOMER']);
  });

  it('rejects unknown and empty tokens', async () => {
    expect(await service.authenticate('')).toBeNull();
    expect(await service.authenticate('not-a-real-token')).toBeNull();
  });

  it('expires a session after the idle window', async () => {
    const { token } = await login();
    clock.advance(7 * DAY + 1);
    expect(await service.authenticate(token)).toBeNull();
  });

  it('keeps a used session alive but enforces the absolute limit', async () => {
    const { token } = await login();

    for (let day = 0; day < 4; day += 1) {
      clock.advance(6 * DAY);
      expect(await service.authenticate(token)).not.toBeNull();
    }

    clock.advance(6 * DAY);
    expect(await service.authenticate(token)).toBeNull();
  });

  it('revokes a session on logout', async () => {
    const { token } = await login();
    await service.logout(token);
    expect(await service.authenticate(token)).toBeNull();
  });

  it('rotates the session and invalidates the old token', async () => {
    const { token } = await login();
    const rotated = await service.rotate(token);

    expect(rotated.token).not.toBe(token);
    expect(await service.authenticate(token)).toBeNull();
    expect(await service.authenticate(rotated.token)).not.toBeNull();
  });

  it('rejects a reused nonce', async () => {
    const { nonce } = await service.issueNonce();
    currentNonce = nonce;

    await service.loginWithGoogle({ idToken: 'test-id-token', nonce });
    await expect(service.loginWithGoogle({ idToken: 'test-id-token', nonce })).rejects.toMatchObject({
      code: 'INVALID_NONCE',
    });
  });

  it('rejects a nonce that does not match the verified token', async () => {
    const { nonce } = await service.issueNonce();
    currentNonce = `${nonce}-different`;

    await expect(service.loginWithGoogle({ idToken: 'test-id-token', nonce })).rejects.toMatchObject({
      code: 'INVALID_NONCE',
    });
  });

  it('rejects login for a disabled account', async () => {
    const { userId } = await login();
    repository.disableUser(userId);

    const { nonce } = await service.issueNonce();
    currentNonce = nonce;
    await expect(service.loginWithGoogle({ idToken: 'test-id-token', nonce })).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('fails closed when no Google audience is configured', async () => {
    const unconfigured = createAuthService({
      repository,
      audiences: [],
      clock,
      verifyGoogleToken: async () => ({ ...identity, nonce: currentNonce }),
    });

    const { nonce } = await unconfigured.issueNonce();
    currentNonce = nonce;
    await expect(
      unconfigured.loginWithGoogle({ idToken: 'test-id-token', nonce }),
    ).rejects.toMatchObject({ code: 'AUTH_NOT_CONFIGURED' });
  });
});
