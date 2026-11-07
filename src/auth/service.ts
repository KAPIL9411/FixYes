import type { AppRole } from '../db/schema';
import { addMilliseconds, systemClock, type Clock } from '../lib/clock';
import { constantTimeEqual, randomToken, sha256Hex } from '../lib/crypto';
import { AppError } from '../lib/errors';
import type { GoogleIdentity } from './google-token';
import type {
  AuthRepository,
  NewSession,
  StoredUserWithRoles,
} from './repository-contract';

export type GoogleVerifier = (idToken: string, audiences: string[]) => Promise<GoogleIdentity>;

export interface AuthUser {
  id: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  roles: AppRole[];
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
}

export interface SessionPolicy {
  idleMs: number;
  absoluteMs: number;
  touchIntervalMs: number;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleMs: 7 * 24 * 60 * 60 * 1000,
  absoluteMs: 30 * 24 * 60 * 60 * 1000,
  touchIntervalMs: 5 * 60 * 1000,
};

export const DEFAULT_NONCE_TTL_MS = 10 * 60 * 1000;

export interface AuthService {
  issueNonce(): Promise<{ nonce: string; expiresAt: Date }>;
  loginWithGoogle(input: {
    idToken: string;
    nonce: string;
  }): Promise<{ token: string; expiresAt: Date; user: AuthUser }>;
  authenticate(token: string): Promise<AuthContext | null>;
  rotate(token: string): Promise<{ token: string; expiresAt: Date; user: AuthUser }>;
  logout(token: string): Promise<void>;
}

export interface CreateAuthServiceOptions {
  repository: AuthRepository;
  verifyGoogleToken: GoogleVerifier;
  audiences: string[];
  clock?: Clock;
  sessionPolicy?: SessionPolicy;
  nonceTtlMs?: number;
}

function toAuthUser(user: StoredUserWithRoles): AuthUser {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    roles: user.roles,
  };
}

export function createAuthService(options: CreateAuthServiceOptions): AuthService {
  const repository = options.repository;
  const clock = options.clock ?? systemClock;
  const policy = options.sessionPolicy ?? DEFAULT_SESSION_POLICY;
  const nonceTtlMs = options.nonceTtlMs ?? DEFAULT_NONCE_TTL_MS;

  async function buildSession(userId: string, now: Date): Promise<{ token: string; session: NewSession }> {
    const token = randomToken(32);
    const idleExpiresAt = addMilliseconds(now, policy.idleMs);
    return {
      token,
      session: {
        id: crypto.randomUUID(),
        userId,
        tokenHash: await sha256Hex(token),
        createdAt: now,
        lastUsedAt: now,
        idleExpiresAt,
        absoluteExpiresAt: addMilliseconds(now, policy.absoluteMs),
      },
    };
  }

  async function authenticate(token: string): Promise<AuthContext | null> {
    if (!token) return null;
    const session = await repository.findSessionByTokenHash(await sha256Hex(token));
    const now = clock.now();

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.absoluteExpiresAt.getTime() <= now.getTime()) return null;
    if (session.idleExpiresAt.getTime() <= now.getTime()) return null;

    const user = await repository.getUserWithRoles(session.userId);
    if (!user || user.accountDisabled) return null;

    const nextIdleExpiry = new Date(
      Math.min(addMilliseconds(now, policy.idleMs).getTime(), session.absoluteExpiresAt.getTime()),
    );
    if (now.getTime() - session.lastUsedAt.getTime() > policy.touchIntervalMs) {
      await repository.touchSession(session.id, now, nextIdleExpiry);
    }

    return { user: toAuthUser(user), sessionId: session.id };
  }

  return {
    async issueNonce() {
      const now = clock.now();
      const expiresAt = addMilliseconds(now, nonceTtlMs);
      const nonce = randomToken(24);
      await repository.insertNonce(await sha256Hex(nonce), expiresAt, now);
      return { nonce, expiresAt };
    },

    async loginWithGoogle({ idToken, nonce }) {
      if (options.audiences.length === 0) {
        throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured');
      }

      let identity: GoogleIdentity;
      try {
        identity = await options.verifyGoogleToken(idToken, options.audiences);
      } catch {
        throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in could not be verified');
      }

      if (!identity.nonce || !constantTimeEqual(identity.nonce, nonce)) {
        throw new AppError(401, 'INVALID_NONCE', 'Sign-in challenge is invalid or expired');
      }

      const now = clock.now();
      const consumed = await repository.consumeNonce(await sha256Hex(nonce), now);
      if (!consumed) {
        throw new AppError(401, 'INVALID_NONCE', 'Sign-in challenge is invalid or expired');
      }

      const user = await repository.findOrCreateUser(identity, now);
      if (user.accountDisabled) {
        throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled');
      }

      const { token, session } = await buildSession(user.id, now);
      await repository.insertSession(session);
      return { token, expiresAt: session.idleExpiresAt, user: toAuthUser(user) };
    },

    authenticate,

    async rotate(token) {
      const context = await authenticate(token);
      if (!context) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired session');
      }

      const now = clock.now();
      const { token: nextToken, session } = await buildSession(context.user.id, now);
      await repository.rotateSession(context.sessionId, now, session);
      return { token: nextToken, expiresAt: session.idleExpiresAt, user: context.user };
    },

    async logout(token) {
      if (!token) return;
      const session = await repository.findSessionByTokenHash(await sha256Hex(token));
      if (session) await repository.revokeSession(session.id, clock.now());
    },
  };
}
