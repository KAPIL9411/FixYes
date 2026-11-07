import type { AppRole } from '../db/schema';
import type { GoogleIdentity } from './google-token';

export interface StoredUser {
  id: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  accountDisabled: boolean;
}

export interface StoredUserWithRoles extends StoredUser {
  roles: AppRole[];
}

export interface NewSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastUsedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  userAgent?: string | null;
  ipHash?: string | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  lastUsedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export interface AuthRepository {
  insertNonce(nonceHash: string, expiresAt: Date, createdAt: Date): Promise<void>;
  consumeNonce(nonceHash: string, now: Date): Promise<boolean>;
  findOrCreateUser(identity: GoogleIdentity, now: Date): Promise<StoredUserWithRoles>;
  getUserWithRoles(userId: string): Promise<StoredUserWithRoles | null>;
  insertSession(session: NewSession): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(sessionId: string, lastUsedAt: Date, idleExpiresAt: Date): Promise<void>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<void>;
  rotateSession(oldSessionId: string, revokedAt: Date, next: NewSession): Promise<void>;
}
