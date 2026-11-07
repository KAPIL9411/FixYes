import type { GoogleIdentity } from '../../src/auth/google-token';
import type {
  AuthRepository,
  NewSession,
  SessionRecord,
  StoredUserWithRoles,
} from '../../src/auth/repository-contract';
import type { AppRole } from '../../src/db/schema';

interface MemoryNonce {
  expiresAt: Date;
  consumedAt: Date | null;
}

export class InMemoryAuthRepository implements AuthRepository {
  readonly users = new Map<string, StoredUserWithRoles>();
  readonly identities = new Map<string, string>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly nonces = new Map<string, MemoryNonce>();

  async insertNonce(nonceHash: string, expiresAt: Date): Promise<void> {
    this.nonces.set(nonceHash, { expiresAt, consumedAt: null });
  }

  async consumeNonce(nonceHash: string, now: Date): Promise<boolean> {
    const nonce = this.nonces.get(nonceHash);
    if (!nonce || nonce.consumedAt || nonce.expiresAt.getTime() <= now.getTime()) return false;
    nonce.consumedAt = now;
    return true;
  }

  async findOrCreateUser(identity: GoogleIdentity): Promise<StoredUserWithRoles> {
    const existingId = this.identities.get(identity.subject);
    if (existingId) {
      const existing = this.users.get(existingId);
      if (!existing) throw new Error('MEMORY_USER_MISSING');
      return { ...existing, roles: [...existing.roles] };
    }

    const id = crypto.randomUUID();
    const created: StoredUserWithRoles = {
      id,
      displayName: identity.name ?? identity.email ?? 'Fixyes user',
      email: identity.email?.toLowerCase() ?? null,
      emailVerified: identity.emailVerified,
      accountDisabled: false,
      roles: ['CUSTOMER'],
    };
    this.users.set(id, created);
    this.identities.set(identity.subject, id);
    return { ...created, roles: [...created.roles] };
  }

  async getUserWithRoles(userId: string): Promise<StoredUserWithRoles | null> {
    const user = this.users.get(userId);
    return user ? { ...user, roles: [...user.roles] } : null;
  }

  async insertSession(session: NewSession): Promise<void> {
    this.sessions.set(session.tokenHash, {
      id: session.id,
      userId: session.userId,
      lastUsedAt: session.lastUsedAt,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      revokedAt: null,
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async touchSession(sessionId: string, lastUsedAt: Date, idleExpiresAt: Date): Promise<void> {
    const session = [...this.sessions.values()].find((entry) => entry.id === sessionId);
    if (session && !session.revokedAt) {
      session.lastUsedAt = lastUsedAt;
      session.idleExpiresAt = idleExpiresAt;
    }
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    const session = [...this.sessions.values()].find((entry) => entry.id === sessionId);
    if (session && !session.revokedAt) session.revokedAt = revokedAt;
  }

  async rotateSession(oldSessionId: string, revokedAt: Date, next: NewSession): Promise<void> {
    await this.revokeSession(oldSessionId, revokedAt);
    await this.insertSession(next);
  }

  setRoles(userId: string, roles: AppRole[]): void {
    const user = this.users.get(userId);
    if (!user) throw new Error('MEMORY_USER_MISSING');
    user.roles = roles;
  }

  disableUser(userId: string): void {
    const user = this.users.get(userId);
    if (!user) throw new Error('MEMORY_USER_MISSING');
    user.accountDisabled = true;
  }
}
