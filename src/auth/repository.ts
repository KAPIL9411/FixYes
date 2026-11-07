import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHttpDb, createWebSocketDb } from '../db/client';
import {
  authNonces,
  externalIdentities,
  sessions,
  userRoles,
  users,
  type AppRole,
} from '../db/schema';
import type {
  AuthRepository,
  NewSession,
  SessionRecord,
  StoredUser,
  StoredUserWithRoles,
} from './repository-contract';
import type { GoogleIdentity } from './google-token';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

function displayNameFor(identity: GoogleIdentity): string {
  const name = identity.name?.trim();
  if (name) return name.slice(0, 120);
  const emailPrefix = identity.email?.split('@')[0]?.trim();
  if (emailPrefix) return emailPrefix.slice(0, 120);
  return 'Fixyes user';
}

function normalizedEmail(identity: GoogleIdentity): string | null {
  const email = identity.email?.trim().toLowerCase();
  return email ? email : null;
}

function toStoredUser(row: typeof users.$inferSelect, roles: AppRole[]): StoredUserWithRoles {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    emailVerified: row.emailVerified,
    accountDisabled: row.accountDisabled,
    roles,
  };
}

function toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    lastUsedAt: row.lastUsedAt,
    idleExpiresAt: row.idleExpiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
  };
}

export function createAuthRepository(databaseUrl: string): AuthRepository {
  const db = createHttpDb(databaseUrl);

  async function getUserWithRoles(userId: string): Promise<StoredUserWithRoles | null> {
    const rows = await db
      .select({ user: users, role: userRoles.role })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(eq(users.id, userId));

    const first = rows[0];
    if (!first) return null;
    const roles = rows
      .map((row) => row.role)
      .filter((role): role is AppRole => role !== null);
    return toStoredUser(first.user, roles);
  }

  async function findByIdentity(subject: string): Promise<StoredUserWithRoles | null> {
    const rows = await db
      .select({ user: users })
      .from(externalIdentities)
      .innerJoin(users, eq(users.id, externalIdentities.userId))
      .where(
        and(
          eq(externalIdentities.provider, 'google'),
          eq(externalIdentities.providerSubject, subject),
        ),
      )
      .limit(1);

    const first = rows[0];
    if (!first) return null;
    return getUserWithRoles(first.user.id);
  }

  return {
    async insertNonce(nonceHash, expiresAt, createdAt) {
      await db.insert(authNonces).values({ nonceHash, expiresAt, createdAt });
    },

    async consumeNonce(nonceHash, now) {
      const rows = await db
        .update(authNonces)
        .set({ consumedAt: now })
        .where(
          and(
            eq(authNonces.nonceHash, nonceHash),
            isNull(authNonces.consumedAt),
            gt(authNonces.expiresAt, now),
          ),
        )
        .returning({ id: authNonces.id });
      return rows.length > 0;
    },

    async findOrCreateUser(identity) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx) => {
          const existing = await tx
            .select({ user: users })
            .from(externalIdentities)
            .innerJoin(users, eq(users.id, externalIdentities.userId))
            .where(
              and(
                eq(externalIdentities.provider, 'google'),
                eq(externalIdentities.providerSubject, identity.subject),
              ),
            )
            .limit(1);

          const existingUser = existing[0]?.user;
          if (existingUser) {
            const roles = await tx
              .select({ role: userRoles.role })
              .from(userRoles)
              .where(eq(userRoles.userId, existingUser.id));
            return toStoredUser(
              existingUser,
              roles.map((row) => row.role),
            );
          }

          const [created] = await tx
            .insert(users)
            .values({
              displayName: displayNameFor(identity),
              email: normalizedEmail(identity),
              emailVerified: identity.emailVerified,
              avatarUrl: identity.picture ?? null,
            })
            .returning();

          if (!created) throw new Error('USER_INSERT_FAILED');

          await tx.insert(externalIdentities).values({
            userId: created.id,
            provider: 'google',
            providerSubject: identity.subject,
          });
          await tx.insert(userRoles).values({ userId: created.id, role: 'CUSTOMER' });

          return toStoredUser(created, ['CUSTOMER']);
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const raced = await findByIdentity(identity.subject);
          if (raced) return raced;
        }
        throw error;
      } finally {
        await close();
      }
    },

    getUserWithRoles,

    async insertSession(session) {
      await db.insert(sessions).values({
        id: session.id,
        userId: session.userId,
        tokenHash: session.tokenHash,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        idleExpiresAt: session.idleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        userAgent: session.userAgent ?? null,
        ipHash: session.ipHash ?? null,
      });
    },

    async findSessionByTokenHash(tokenHash) {
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      const row = rows[0];
      return row ? toSessionRecord(row) : null;
    },

    async touchSession(sessionId, lastUsedAt, idleExpiresAt) {
      await db
        .update(sessions)
        .set({ lastUsedAt, idleExpiresAt })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    },

    async revokeSession(sessionId, revokedAt) {
      await db
        .update(sessions)
        .set({ revokedAt })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    },

    async rotateSession(oldSessionId, revokedAt, next) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        await wsDb.transaction(async (tx) => {
          await tx
            .update(sessions)
            .set({ revokedAt })
            .where(and(eq(sessions.id, oldSessionId), isNull(sessions.revokedAt)));
          await tx.insert(sessions).values({
            id: next.id,
            userId: next.userId,
            tokenHash: next.tokenHash,
            createdAt: next.createdAt,
            lastUsedAt: next.lastUsedAt,
            idleExpiresAt: next.idleExpiresAt,
            absoluteExpiresAt: next.absoluteExpiresAt,
            userAgent: next.userAgent ?? null,
            ipHash: next.ipHash ?? null,
          });
        });
      } finally {
        await close();
      }
    },
  };
}

export type { NewSession, SessionRecord, StoredUser, StoredUserWithRoles };
