import { and, asc, desc, eq, gt, inArray, isNull, isNotNull, lt, lte, max, or, sql } from 'drizzle-orm';
import { createHttpDb, createWebSocketDb } from '../db/client';
import { toRealtimeEnvelope } from '../domain/realtime';
import {
  addresses,
  adminAuditLogs,
  bookingEvents,
  bookings,
  dispatchAttempts,
  dispatchOffers,
  idempotencyKeys,
  mediaAssets,
  notificationDeliveries,
  outboxEvents,
  partnerAvailability,
  partnerProfiles,
  partnerSkills,
  partnerZoneMemberships,
  pushTokens,
  serviceCategories,
  serviceCities,
  serviceItems,
  serviceZones,
  userRoles,
  users,
} from '../db/schema';
import { AppError } from '../lib/errors';
import { isUniqueViolation } from '../lib/db-errors';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import type { PlatformStore } from './store-contract';
import type {
  AcceptOfferResult,
  Address,
  AdminAssignBookingInput,
  AuditEntry,
  AuditLog,
  Booking,
  BookingEvent,
  BookingEventInput,
  Category,
  City,
  CreateAddressInput,
  CreateBookingInput,
  CreateBookingResult,
  CreateCategoryInput,
  CreateDispatchAttemptInput,
  CreateDispatchAttemptResult,
  CreateItemInput,
  CreateMediaAssetInput,
  CreateZoneInput,
  DispatchAttempt,
  DispatchCandidate,
  DispatchOffer,
  IdempotencyRecord,
  MediaAsset,
  NotificationDelivery,
  NotificationStatus,
  OutboxEvent,
  Page,
  PartnerAvailability,
  PartnerListFilter,
  PartnerOffer,
  PartnerProfile,
  PartnerSummary,
  PushToken,
  RejectOfferResult,
  ServiceItem,
  TransitionBookingInput,
  TransitionBookingResult,
  UpdateAddressInput,
  UpsertPartnerInput,
  VerifyMediaInput,
  Zone,
} from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A claimed outbox row is leased so an overlapping cron cannot reprocess it. */
const OUTBOX_CLAIM_LEASE_MS = 5 * 60 * 1000;

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toCity(row: typeof serviceCities.$inferSelect): City {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    countryCode: row.countryCode,
    enabled: row.enabled,
  };
}

function toZone(row: typeof serviceZones.$inferSelect): Zone {
  return {
    id: row.id,
    cityId: row.cityId,
    name: row.name,
    boundaryGeojson: row.boundaryGeojson ?? null,
    enabled: row.enabled,
  };
}

function toCategory(row: typeof serviceCategories.$inferSelect): Category {
  return { id: row.id, code: row.code, name: row.name, enabled: row.enabled };
}

function toItem(row: typeof serviceItems.$inferSelect): ServiceItem {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    basePrice: row.basePrice,
    currency: row.currency,
    enabled: row.enabled,
  };
}

function toAddress(row: typeof addresses.$inferSelect): Address {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    addressLine: row.addressLine,
    locality: row.locality,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.createdAt.toISOString(),
  };
}

function toBooking(row: typeof bookings.$inferSelect): Booking {
  return {
    id: row.id,
    customerUserId: row.customerUserId,
    partnerUserId: row.partnerUserId,
    serviceItemId: row.serviceItemId,
    addressId: row.addressId,
    status: row.status,
    scheduledAt: toIso(row.scheduledAt),
    currency: row.currency,
    quotedTotal: row.quotedTotal,
    version: row.version,
    idempotencyKey: row.idempotencyKey,
    serviceAddressLine: row.serviceAddressLine,
    serviceLocality: row.serviceLocality,
    serviceCity: row.serviceCity,
    serviceState: row.serviceState,
    servicePostalCode: row.servicePostalCode,
    serviceLatitude: row.serviceLatitude,
    serviceLongitude: row.serviceLongitude,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toBookingEvent(row: typeof bookingEvents.$inferSelect): BookingEvent {
  return {
    id: row.id,
    bookingId: row.bookingId,
    sequence: row.sequence,
    eventType: row.eventType,
    actorUserId: row.actorUserId,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAvailability(row: typeof partnerAvailability.$inferSelect): PartnerAvailability {
  return {
    partnerUserId: row.partnerUserId,
    isOnline: row.isOnline,
    activeJobCount: row.activeJobCount,
    latitude: row.latitude,
    longitude: row.longitude,
    locationUpdatedAt: toIso(row.locationUpdatedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDispatchOffer(row: typeof dispatchOffers.$inferSelect): DispatchOffer {
  return {
    id: row.id,
    bookingId: row.bookingId,
    partnerUserId: row.partnerUserId,
    status: row.status,
    score: row.score,
    expiresAt: row.expiresAt.toISOString(),
    respondedAt: toIso(row.respondedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function toDispatchAttempt(row: typeof dispatchAttempts.$inferSelect): DispatchAttempt {
  return {
    id: row.id,
    bookingId: row.bookingId,
    attemptNumber: row.attemptNumber,
    candidateCount: row.candidateCount,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

function bookingIdFromResponse(body: Record<string, unknown> | null): string | null {
  return body && typeof body.bookingId === 'string' ? body.bookingId : null;
}

function toMediaAsset(row: typeof mediaAssets.$inferSelect): MediaAsset {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    cloudinaryPublicId: row.cloudinaryPublicId,
    resourceType: row.resourceType,
    mediaKind: row.mediaKind,
    format: row.format,
    bytes: row.bytes,
    folder: row.folder,
    verified: row.verified,
  };
}

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof createWebSocketDb>['db']['transaction']>[0]
>[0];

/**
 * The outbox row is written in the same transaction as the booking event, so a
 * committed change can never be invisible to realtime fan-out or push.
 */
async function appendBookingOutbox(
  tx: DatabaseTransaction,
  event: typeof bookingEvents.$inferSelect,
): Promise<void> {
  await tx.insert(outboxEvents).values({
    eventType: 'BOOKING_EVENT',
    aggregateId: event.bookingId,
    payload: {
      envelope: toRealtimeEnvelope(toBookingEvent(event)),
      actorUserId: event.actorUserId,
    },
  });
}

async function appendOfferOutbox(
  tx: DatabaseTransaction,
  input: { bookingId: string; offerId: string; partnerUserId: string; expiresAt: string },
): Promise<void> {
  await tx.insert(outboxEvents).values({
    eventType: 'DISPATCH_OFFER_CREATED',
    aggregateId: input.bookingId,
    payload: { type: 'OFFER_CREATED', ...input },
  });
}

function toOutboxEvent(row: typeof outboxEvents.$inferSelect): OutboxEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    aggregateId: row.aggregateId,
    payload: row.payload,
    attempts: row.attempts,
    availableAt: row.availableAt.toISOString(),
    processedAt: toIso(row.processedAt),
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPushToken(row: typeof pushTokens.$inferSelect): PushToken {
  return {
    id: row.id,
    userId: row.userId,
    expoPushToken: row.expoPushToken,
    devicePlatform: row.devicePlatform,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDelivery(row: typeof notificationDeliveries.$inferSelect): NotificationDelivery {
  return {
    id: row.id,
    userId: row.userId,
    pushTokenId: row.pushTokenId,
    bookingId: row.bookingId,
    outboxEventId: row.outboxEventId,
    eventType: row.eventType,
    status: row.status as NotificationStatus,
    expoTicketId: row.expoTicketId,
    errorCode: row.errorCode,
    attempts: row.attempts,
    nextAttemptAt: toIso(row.nextAttemptAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function auditValues(audit: AuditEntry) {
  return {
    adminUserId: audit.adminUserId,
    action: audit.action,
    targetType: audit.targetType,
    targetId: audit.targetId,
    reason: audit.reason,
    metadata: audit.metadata,
    requestId: audit.requestId,
    ipHash: audit.ipHash,
    userAgent: audit.userAgent,
  };
}

function readPartnerCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const decoded = decodeCursor(cursor);
  if (
    !decoded ||
    typeof decoded.createdAt !== 'string' ||
    typeof decoded.id !== 'string' ||
    !UUID_PATTERN.test(decoded.id)
  ) {
    throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor');
  }
  const createdAt = new Date(decoded.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor');
  }
  return { createdAt, id: decoded.id };
}

function readAuditCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const decoded = decodeCursor(cursor);
  if (
    !decoded ||
    typeof decoded.createdAt !== 'string' ||
    typeof decoded.id !== 'string' ||
    !UUID_PATTERN.test(decoded.id)
  ) {
    throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor');
  }
  const createdAt = new Date(decoded.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor');
  }
  return { createdAt, id: decoded.id };
}

export function createPlatformStore(databaseUrl: string): PlatformStore {
  const db = createHttpDb(databaseUrl);

  async function getPartner(userId: string): Promise<PartnerProfile | null> {
    const rows = await db
      .select({
        profile: partnerProfiles,
        displayName: users.displayName,
        email: users.email,
        cityName: serviceCities.name,
      })
      .from(partnerProfiles)
      .innerJoin(users, eq(users.id, partnerProfiles.userId))
      .leftJoin(serviceCities, eq(serviceCities.id, partnerProfiles.serviceCityId))
      .where(eq(partnerProfiles.userId, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const skills = await db
      .select({
        categoryCode: partnerSkills.categoryCode,
        verified: partnerSkills.verified,
      })
      .from(partnerSkills)
      .where(eq(partnerSkills.partnerUserId, userId));

    return {
      userId: row.profile.userId,
      displayName: row.displayName,
      email: row.email,
      status: row.profile.status,
      serviceCityId: row.profile.serviceCityId,
      cityName: row.cityName ?? null,
      bio: row.profile.bio,
      verifiedAt: toIso(row.profile.verifiedAt),
      skills,
      createdAt: row.profile.createdAt.toISOString(),
      updatedAt: row.profile.updatedAt.toISOString(),
    };
  }

  return {
    async listCities(enabledOnly) {
      const rows = await db
        .select()
        .from(serviceCities)
        .where(enabledOnly ? eq(serviceCities.enabled, true) : undefined)
        .orderBy(serviceCities.name);
      return rows.map(toCity);
    },

    async getCity(cityId) {
      const rows = await db.select().from(serviceCities).where(eq(serviceCities.id, cityId)).limit(1);
      const row = rows[0];
      return row ? toCity(row) : null;
    },

    async setCityEnabled(cityId, enabled, audit) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx) => {
          const [updated] = await tx
            .update(serviceCities)
            .set({ enabled })
            .where(eq(serviceCities.id, cityId))
            .returning();
          if (!updated) return null;
          await tx.insert(adminAuditLogs).values(auditValues(audit));
          return toCity(updated);
        });
      } finally {
        await close();
      }
    },

    async listZones(cityId, enabledOnly) {
      const conditions = [eq(serviceZones.cityId, cityId)];
      if (enabledOnly) conditions.push(eq(serviceZones.enabled, true));
      const rows = await db
        .select()
        .from(serviceZones)
        .where(and(...conditions))
        .orderBy(serviceZones.name);
      return rows.map(toZone);
    },

    async createZone(input: CreateZoneInput, audit) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx) => {
          const [created] = await tx
            .insert(serviceZones)
            .values({
              cityId: input.cityId,
              name: input.name,
              boundaryGeojson: input.boundaryGeojson,
              enabled: input.enabled,
            })
            .returning();
          if (!created) throw new Error('ZONE_INSERT_FAILED');
          await tx.insert(adminAuditLogs).values({ ...auditValues(audit), targetId: created.id });
          return toZone(created);
        });
      } finally {
        await close();
      }
    },

    async listCategories(enabledOnly) {
      const rows = await db
        .select()
        .from(serviceCategories)
        .where(enabledOnly ? eq(serviceCategories.enabled, true) : undefined)
        .orderBy(serviceCategories.name);
      return rows.map(toCategory);
    },

    async getCategoriesByCodes(codes) {
      if (codes.length === 0) return [];
      const rows = await db
        .select()
        .from(serviceCategories)
        .where(inArray(serviceCategories.code, codes));
      return rows.map(toCategory);
    },

    async createCategory(input: CreateCategoryInput, audit) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx) => {
          const [created] = await tx
            .insert(serviceCategories)
            .values({ code: input.code, name: input.name, enabled: input.enabled })
            .returning();
          if (!created) throw new Error('CATEGORY_INSERT_FAILED');
          await tx.insert(adminAuditLogs).values({ ...auditValues(audit), targetId: created.id });
          return toCategory(created);
        });
      } finally {
        await close();
      }
    },

    async listItems(categoryId, enabledOnly) {
      const conditions = [];
      if (categoryId) conditions.push(eq(serviceItems.categoryId, categoryId));
      if (enabledOnly) conditions.push(eq(serviceItems.enabled, true));
      const rows = await db
        .select()
        .from(serviceItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(serviceItems.name);
      return rows.map(toItem);
    },

    async getServiceItem(itemId) {
      const rows = await db.select().from(serviceItems).where(eq(serviceItems.id, itemId)).limit(1);
      const row = rows[0];
      return row ? toItem(row) : null;
    },

    async createItem(input: CreateItemInput, audit) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx) => {
          const [created] = await tx
            .insert(serviceItems)
            .values({
              categoryId: input.categoryId,
              name: input.name,
              description: input.description,
              basePrice: input.basePrice,
              enabled: input.enabled,
            })
            .returning();
          if (!created) throw new Error('ITEM_INSERT_FAILED');
          await tx.insert(adminAuditLogs).values({ ...auditValues(audit), targetId: created.id });
          return toItem(created);
        });
      } finally {
        await close();
      }
    },

    async listAddresses(userId) {
      const rows = await db
        .select()
        .from(addresses)
        .where(eq(addresses.userId, userId))
        .orderBy(desc(addresses.createdAt));
      return rows.map(toAddress);
    },

    async getAddress(addressId, userId) {
      const rows = await db
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
        .limit(1);
      const row = rows[0];
      return row ? toAddress(row) : null;
    },

    async createAddress(input: CreateAddressInput & { userId: string }) {
      const [created] = await db
        .insert(addresses)
        .values({
          userId: input.userId,
          label: input.label,
          addressLine: input.addressLine,
          locality: input.locality,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          latitude: input.latitude === null ? null : input.latitude.toFixed(6),
          longitude: input.longitude === null ? null : input.longitude.toFixed(6),
        })
        .returning();
      if (!created) throw new Error('ADDRESS_INSERT_FAILED');
      return toAddress(created);
    },

    async updateAddress(addressId, userId, input: UpdateAddressInput) {
      const updates: Partial<typeof addresses.$inferInsert> = {};
      if (input.label !== undefined) updates.label = input.label;
      if (input.addressLine !== undefined) updates.addressLine = input.addressLine;
      if (input.locality !== undefined) updates.locality = input.locality;
      if (input.city !== undefined) updates.city = input.city;
      if (input.state !== undefined) updates.state = input.state;
      if (input.postalCode !== undefined) updates.postalCode = input.postalCode;
      if (input.latitude !== undefined) {
        updates.latitude = input.latitude === null ? null : input.latitude.toFixed(6);
      }
      if (input.longitude !== undefined) {
        updates.longitude = input.longitude === null ? null : input.longitude.toFixed(6);
      }

      if (Object.keys(updates).length === 0) {
        const rows = await db
          .select()
          .from(addresses)
          .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
          .limit(1);
        const existingRow = rows[0];
        return existingRow ? toAddress(existingRow) : null;
      }

      const [updated] = await db
        .update(addresses)
        .set(updates)
        .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
        .returning();
      return updated ? toAddress(updated) : null;
    },

    async deleteAddress(addressId, userId) {
      const rows = await db
        .delete(addresses)
        .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
        .returning({ id: addresses.id });
      return rows.length > 0;
    },

    async upsertPartner(input: UpsertPartnerInput) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      const now = new Date();
      try {
        await wsDb.transaction(async (tx) => {
          await tx
            .insert(partnerProfiles)
            .values({
              userId: input.userId,
              status: input.status,
              serviceCityId: input.serviceCityId,
              bio: input.bio,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: partnerProfiles.userId,
              set: {
                status: input.status,
                serviceCityId: input.serviceCityId,
                bio: input.bio,
                updatedAt: now,
              },
            });

          await tx
            .insert(userRoles)
            .values({ userId: input.userId, role: 'PARTNER' })
            .onConflictDoNothing();

          await tx.delete(partnerSkills).where(eq(partnerSkills.partnerUserId, input.userId));
          if (input.skills.length > 0) {
            await tx.insert(partnerSkills).values(
              input.skills.map((categoryCode) => ({
                partnerUserId: input.userId,
                categoryCode,
              })),
            );
          }

          await tx
            .insert(partnerAvailability)
            .values({ partnerUserId: input.userId })
            .onConflictDoNothing();
        });
      } finally {
        await close();
      }

      const profile = await getPartner(input.userId);
      if (!profile) throw new Error('PARTNER_PROFILE_MISSING');
      return profile;
    },

    getPartner,

    async getPartnerAvailability(userId) {
      const rows = await db
        .select()
        .from(partnerAvailability)
        .where(eq(partnerAvailability.partnerUserId, userId))
        .limit(1);
      const row = rows[0];
      return row ? toAvailability(row) : null;
    },

    async setPartnerAvailability(userId, input) {
      const now = new Date();
      const [row] = await db
        .insert(partnerAvailability)
        .values({
          partnerUserId: userId,
          isOnline: input.isOnline,
          latitude: input.latitude === null ? null : input.latitude.toFixed(6),
          longitude: input.longitude === null ? null : input.longitude.toFixed(6),
          locationUpdatedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: partnerAvailability.partnerUserId,
          set: {
            isOnline: input.isOnline,
            latitude: input.latitude === null ? null : input.latitude.toFixed(6),
            longitude: input.longitude === null ? null : input.longitude.toFixed(6),
            locationUpdatedAt: now,
            updatedAt: now,
          },
        })
        .returning();
      if (!row) throw new Error('AVAILABILITY_UPSERT_FAILED');
      return toAvailability(row);
    },

    async listPartnerZoneIds(userId) {
      const rows = await db
        .select({ zoneId: partnerZoneMemberships.zoneId })
        .from(partnerZoneMemberships)
        .where(eq(partnerZoneMemberships.partnerUserId, userId));
      return rows.map((row) => row.zoneId);
    },

    async setPartnerZoneIds(userId, zoneIds) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        await wsDb.transaction(async (tx) => {
          await tx
            .delete(partnerZoneMemberships)
            .where(eq(partnerZoneMemberships.partnerUserId, userId));
          if (zoneIds.length > 0) {
            await tx.insert(partnerZoneMemberships).values(
              zoneIds.map((zoneId) => ({ partnerUserId: userId, zoneId })),
            );
          }
        });
      } finally {
        await close();
      }
      return zoneIds;
    },

    async listPartners(filter: PartnerListFilter) {
      const conditions = [];
      if (filter.status) conditions.push(eq(partnerProfiles.status, filter.status));

      const cursor = readPartnerCursor(filter.cursor);
      if (cursor) {
        conditions.push(
          or(
            lt(partnerProfiles.createdAt, cursor.createdAt),
            and(
              eq(partnerProfiles.createdAt, cursor.createdAt),
              lt(partnerProfiles.userId, cursor.id),
            ),
          ),
        );
      }

      const rows = await db
        .select({
          userId: partnerProfiles.userId,
          displayName: users.displayName,
          email: users.email,
          status: partnerProfiles.status,
          cityName: serviceCities.name,
          createdAt: partnerProfiles.createdAt,
        })
        .from(partnerProfiles)
        .innerJoin(users, eq(users.id, partnerProfiles.userId))
        .leftJoin(serviceCities, eq(serviceCities.id, partnerProfiles.serviceCityId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(partnerProfiles.createdAt), desc(partnerProfiles.userId))
        .limit(filter.limit + 1);

      const page = rows.slice(0, filter.limit);
      const ids = page.map((row) => row.userId);
      const skillRows =
        ids.length > 0
          ? await db
              .select({
                partnerUserId: partnerSkills.partnerUserId,
                verified: partnerSkills.verified,
              })
              .from(partnerSkills)
              .where(inArray(partnerSkills.partnerUserId, ids))
          : [];

      const counts = new Map<string, { total: number; verified: number }>();
      for (const skill of skillRows) {
        const current = counts.get(skill.partnerUserId) ?? { total: 0, verified: 0 };
        current.total += 1;
        if (skill.verified) current.verified += 1;
        counts.set(skill.partnerUserId, current);
      }

      const items: PartnerSummary[] = page.map((row) => {
        const count = counts.get(row.userId) ?? { total: 0, verified: 0 };
        return {
          userId: row.userId,
          displayName: row.displayName,
          email: row.email,
          status: row.status,
          cityName: row.cityName ?? null,
          skillCount: count.total,
          verifiedSkillCount: count.verified,
          createdAt: row.createdAt.toISOString(),
        };
      });

      const last = page[page.length - 1];
      return {
        items,
        nextCursor:
          rows.length > filter.limit && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.userId })
            : null,
      };
    },

    async approvePartner(userId, adminUserId, verifiedAt, verifySkills, audit) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      let changed = false;
      try {
        changed = await wsDb.transaction(async (tx) => {
          const [updated] = await tx
            .update(partnerProfiles)
            .set({
              status: 'APPROVED',
              verifiedAt,
              approvedBy: adminUserId,
              updatedAt: verifiedAt,
            })
            .where(
              and(
                eq(partnerProfiles.userId, userId),
                eq(partnerProfiles.status, 'PENDING_REVIEW'),
              ),
            )
            .returning({ userId: partnerProfiles.userId });

          if (!updated) return false;

          if (verifySkills) {
            await tx
              .update(partnerSkills)
              .set({ verified: true, verifiedBy: adminUserId, verifiedAt })
              .where(eq(partnerSkills.partnerUserId, userId));
          }

          await tx.insert(adminAuditLogs).values(auditValues(audit));
          return true;
        });
      } finally {
        await close();
      }

      if (!changed) return null;
      return getPartner(userId);
    },

    async suspendPartner(userId, adminUserId, reason, audit) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      const now = new Date();
      let changed = false;
      try {
        changed = await wsDb.transaction(async (tx) => {
          const [updated] = await tx
            .update(partnerProfiles)
            .set({ status: 'SUSPENDED', updatedAt: now })
            .where(eq(partnerProfiles.userId, userId))
            .returning({ userId: partnerProfiles.userId });

          if (!updated) return false;

          await tx
            .update(partnerAvailability)
            .set({ isOnline: false, updatedAt: now })
            .where(eq(partnerAvailability.partnerUserId, userId));

          await tx.insert(adminAuditLogs).values(
            auditValues({
              ...audit,
              adminUserId,
              reason,
              targetType: 'partner',
              targetId: userId,
            }),
          );
          return true;
        });
      } finally {
        await close();
      }

      if (!changed) return null;
      return getPartner(userId);
    },

    async listAuditLogs(filter) {
      const cursor = readAuditCursor(filter.cursor);
      const condition = cursor
        ? or(
            lt(adminAuditLogs.createdAt, cursor.createdAt),
            and(eq(adminAuditLogs.createdAt, cursor.createdAt), lt(adminAuditLogs.id, cursor.id)),
          )
        : undefined;

      const rows = await db
        .select()
        .from(adminAuditLogs)
        .where(condition)
        .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
        .limit(filter.limit + 1);

      const page = rows.slice(0, filter.limit);
      const items: AuditLog[] = page.map((row) => ({
        id: row.id,
        adminUserId: row.adminUserId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        metadata: row.metadata,
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      }));

      const last = page[page.length - 1];
      return {
        items,
        nextCursor:
          rows.length > filter.limit && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
      };
    },

    async createBooking(input: CreateBookingInput, event: BookingEventInput) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const idempotencyCondition = and(
        eq(idempotencyKeys.actorUserId, input.customerUserId),
        eq(idempotencyKeys.key, input.idempotencyKey),
      );
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      let result: CreateBookingResult;

      try {
        result = await wsDb.transaction(async (tx) => {
          const existing = await tx
            .select()
            .from(idempotencyKeys)
            .where(idempotencyCondition)
            .for('update')
            .limit(1);

          const record = existing[0];
          if (record) {
            if (record.expiresAt.getTime() > now.getTime()) {
              const bookingId = bookingIdFromResponse(record.responseBody);
              if (!bookingId) throw new Error('IDEMPOTENCY_RESPONSE_MISSING');
              return {
                replayed: true as const,
                bookingId,
                requestHash: record.requestHash,
              };
            }
            await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.id, record.id));
          }

          const [created] = await tx
            .insert(bookings)
            .values({
              customerUserId: input.customerUserId,
              serviceItemId: input.serviceItemId,
              addressId: input.addressId,
              status: 'REQUESTED',
              scheduledAt: input.scheduledAt,
              quotedTotal: input.quotedTotal,
              version: 1,
              idempotencyKey: input.idempotencyKey,
              serviceAddressLine: input.snapshot.addressLine,
              serviceLocality: input.snapshot.locality,
              serviceCity: input.snapshot.city,
              serviceState: input.snapshot.state,
              servicePostalCode: input.snapshot.postalCode,
              serviceLatitude: input.snapshot.latitude,
              serviceLongitude: input.snapshot.longitude,
              createdAt: now,
              updatedAt: now,
            })
            .returning();

          if (!created) throw new Error('BOOKING_INSERT_FAILED');

          const [eventRow] = await tx
            .insert(bookingEvents)
            .values({
              bookingId: created.id,
              sequence: 1,
              eventType: event.eventType,
              actorUserId: event.actorUserId,
              payload: event.payload,
              createdAt: now,
            })
            .returning();
          if (!eventRow) throw new Error('BOOKING_EVENT_INSERT_FAILED');
          await appendBookingOutbox(tx, eventRow);

          await tx.insert(idempotencyKeys).values({
            actorUserId: input.customerUserId,
            key: input.idempotencyKey,
            requestHash: input.requestHash,
            responseStatus: 201,
            responseBody: { bookingId: created.id },
            createdAt: now,
            expiresAt,
          });

          return { replayed: false as const, booking: toBooking(created) };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const rows = await db
            .select()
            .from(idempotencyKeys)
            .where(idempotencyCondition)
            .limit(1);
          const record = rows[0];
          const bookingId = record ? bookingIdFromResponse(record.responseBody) : null;
          if (record && bookingId) {
            return {
              replayed: true,
              bookingId,
              requestHash: record.requestHash,
            };
          }
        }
        throw error;
      } finally {
        await close();
      }

      return result;
    },

    async getIdempotency(actorUserId, key) {
      const rows = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.actorUserId, actorUserId), eq(idempotencyKeys.key, key)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const bookingId = bookingIdFromResponse(row.responseBody);
      if (!bookingId) return null;
      return {
        bookingId,
        requestHash: row.requestHash,
        expiresAt: row.expiresAt.toISOString(),
      } satisfies IdempotencyRecord;
    },

    async getBooking(bookingId) {
      const rows = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
      const row = rows[0];
      return row ? toBooking(row) : null;
    },

    async listBookingEvents(bookingId, afterSequence) {
      const rows = await db
        .select()
        .from(bookingEvents)
        .where(and(eq(bookingEvents.bookingId, bookingId), gt(bookingEvents.sequence, afterSequence)))
        .orderBy(asc(bookingEvents.sequence))
        .limit(200);
      return rows.map(toBookingEvent);
    },

    async transitionBooking(input: TransitionBookingInput) {
      const now = new Date();
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        const result = await wsDb.transaction(async (tx) => {
          const [updated] = await tx
            .update(bookings)
            .set({ status: input.toStatus, version: input.expectedVersion + 1, updatedAt: now })
            .where(
              and(
                eq(bookings.id, input.bookingId),
                eq(bookings.status, input.fromStatus),
                eq(bookings.version, input.expectedVersion),
              ),
            )
            .returning();

          if (!updated) return null;

          const [event] = await tx
            .insert(bookingEvents)
            .values({
              bookingId: updated.id,
              sequence: updated.version,
              eventType: input.eventType,
              actorUserId: input.actorUserId,
              payload: input.payload,
              createdAt: now,
            })
            .returning();

          if (!event) throw new Error('BOOKING_EVENT_INSERT_FAILED');

          await appendBookingOutbox(tx, event);

          if (
            updated.partnerUserId &&
            ['COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_PARTNER', 'CANCELLED_BY_ADMIN'].includes(
              updated.status,
            )
          ) {
            await tx
              .update(partnerAvailability)
              .set({
                activeJobCount: sql`greatest(${partnerAvailability.activeJobCount} - 1, 0)`,
                updatedAt: now,
              })
              .where(eq(partnerAvailability.partnerUserId, updated.partnerUserId));
          }

          if (
            ['COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_PARTNER', 'CANCELLED_BY_ADMIN', 'NO_PARTNER_AVAILABLE'].includes(
              updated.status,
            )
          ) {
            await tx
              .update(dispatchOffers)
              .set({ status: 'CANCELLED', respondedAt: now })
              .where(
                and(
                  eq(dispatchOffers.bookingId, updated.id),
                  eq(dispatchOffers.status, 'PENDING'),
                ),
              );
          }

          return { booking: toBooking(updated), event: toBookingEvent(event) } satisfies TransitionBookingResult;
        });
        return result;
      } finally {
        await close();
      }
    },

    async listDispatchCandidates(query) {
      const conditions = [
        eq(partnerProfiles.status, 'APPROVED'),
        eq(users.accountDisabled, false),
        eq(partnerSkills.categoryCode, query.categoryCode),
        eq(partnerSkills.verified, true),
        eq(serviceCities.enabled, true),
        eq(serviceZones.enabled, true),
        eq(serviceZones.cityId, serviceCities.id),
        lt(partnerAvailability.activeJobCount, query.maxActiveJobs),
        sql`lower(${serviceCities.name}) = lower(${query.city})`,
        sql`lower(${serviceCities.state}) = lower(${query.state})`,
      ];
      if (query.onlineOnly) conditions.push(eq(partnerAvailability.isOnline, true));
      if (query.partnerId) conditions.push(eq(partnerProfiles.userId, query.partnerId));

      const rows = await db
        .selectDistinct({
          userId: partnerProfiles.userId,
          displayName: users.displayName,
          activeJobCount: partnerAvailability.activeJobCount,
          latitude: partnerAvailability.latitude,
          longitude: partnerAvailability.longitude,
        })
        .from(partnerProfiles)
        .innerJoin(users, eq(users.id, partnerProfiles.userId))
        .innerJoin(
          serviceCities,
          and(
            eq(serviceCities.id, partnerProfiles.serviceCityId),
            eq(serviceCities.enabled, true),
          ),
        )
        .innerJoin(
          partnerSkills,
          and(
            eq(partnerSkills.partnerUserId, partnerProfiles.userId),
            eq(partnerSkills.verified, true),
          ),
        )
        .innerJoin(
          partnerAvailability,
          eq(partnerAvailability.partnerUserId, partnerProfiles.userId),
        )
        .innerJoin(
          partnerZoneMemberships,
          eq(partnerZoneMemberships.partnerUserId, partnerProfiles.userId),
        )
        .innerJoin(serviceZones, eq(serviceZones.id, partnerZoneMemberships.zoneId))
        .where(and(...conditions))
        .limit(query.limit);

      return rows satisfies DispatchCandidate[];
    },

    async listDispatchAttempts(bookingId) {
      const rows = await db
        .select()
        .from(dispatchAttempts)
        .where(eq(dispatchAttempts.bookingId, bookingId))
        .orderBy(asc(dispatchAttempts.attemptNumber));
      return rows.map(toDispatchAttempt);
    },

    async createDispatchAttempt(input: CreateDispatchAttemptInput) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx) => {
          const locked = await tx
            .select({ id: bookings.id })
            .from(bookings)
            .where(eq(bookings.id, input.bookingId))
            .for('update')
            .limit(1);
          if (!locked[0]) throw new Error('BOOKING_NOT_FOUND');

          const attempts = await tx
            .select({ value: max(dispatchAttempts.attemptNumber) })
            .from(dispatchAttempts)
            .where(eq(dispatchAttempts.bookingId, input.bookingId));
          const attemptNumber = (attempts[0]?.value ?? 0) + 1;

          const [attempt] = await tx
            .insert(dispatchAttempts)
            .values({
              bookingId: input.bookingId,
              attemptNumber,
              candidateCount: input.candidateCount,
              outcome: input.outcome,
            })
            .returning();
          if (!attempt) throw new Error('DISPATCH_ATTEMPT_INSERT_FAILED');

          let offer: DispatchOffer | null = null;
          if (input.partnerUserId && input.expiresAt) {
            const [created] = await tx
              .insert(dispatchOffers)
              .values({
                bookingId: input.bookingId,
                partnerUserId: input.partnerUserId,
                score: input.score ?? null,
                expiresAt: input.expiresAt,
              })
              .returning();
            if (!created) throw new Error('DISPATCH_OFFER_INSERT_FAILED');
            offer = toDispatchOffer(created);
            await appendOfferOutbox(tx, {
              bookingId: input.bookingId,
              offerId: offer.id,
              partnerUserId: offer.partnerUserId,
              expiresAt: offer.expiresAt,
            });
          }

          return { attempt: toDispatchAttempt(attempt), offer } satisfies CreateDispatchAttemptResult;
        });
      } finally {
        await close();
      }
    },

    async getDispatchOffer(offerId) {
      const rows = await db
        .select()
        .from(dispatchOffers)
        .where(eq(dispatchOffers.id, offerId))
        .limit(1);
      const row = rows[0];
      return row ? toDispatchOffer(row) : null;
    },

    async listDispatchOffersForBooking(bookingId) {
      const rows = await db
        .select()
        .from(dispatchOffers)
        .where(eq(dispatchOffers.bookingId, bookingId))
        .orderBy(asc(dispatchOffers.createdAt));
      return rows.map(toDispatchOffer);
    },

    async listPartnerOffers(partnerUserId, now) {
      const rows = await db
        .select({
          offer: dispatchOffers,
          bookingStatus: bookings.status,
          serviceCity: bookings.serviceCity,
          serviceItemName: serviceItems.name,
          quotedTotal: bookings.quotedTotal,
          scheduledAt: bookings.scheduledAt,
        })
        .from(dispatchOffers)
        .innerJoin(bookings, eq(bookings.id, dispatchOffers.bookingId))
        .innerJoin(serviceItems, eq(serviceItems.id, bookings.serviceItemId))
        .where(
          and(
            eq(dispatchOffers.partnerUserId, partnerUserId),
            eq(dispatchOffers.status, 'PENDING'),
            gt(dispatchOffers.expiresAt, now),
          ),
        )
        .orderBy(asc(dispatchOffers.expiresAt));

      return rows.map(
        (row) =>
          ({
            ...toDispatchOffer(row.offer),
            bookingStatus: row.bookingStatus,
            serviceCity: row.serviceCity,
            serviceItemName: row.serviceItemName,
            quotedTotal: row.quotedTotal,
            scheduledAt: toIso(row.scheduledAt),
          }) satisfies PartnerOffer,
      );
    },

    async acceptDispatchOffer(offerId, partnerUserId, now, maxActiveJobs) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx): Promise<AcceptOfferResult> => {
          const offerRows = await tx
            .select()
            .from(dispatchOffers)
            .where(eq(dispatchOffers.id, offerId))
            .for('update')
            .limit(1);
          const offer = offerRows[0];
          if (!offer) return { outcome: 'NOT_FOUND' };
          if (offer.partnerUserId !== partnerUserId) return { outcome: 'FORBIDDEN' };

          if (offer.status === 'ACCEPTED') {
            const bookingRows = await tx
              .select()
              .from(bookings)
              .where(eq(bookings.id, offer.bookingId))
              .limit(1);
            const booking = bookingRows[0];
            if (booking && booking.partnerUserId === partnerUserId) {
              return {
                outcome: 'ALREADY_ACCEPTED',
                booking: toBooking(booking),
                offer: toDispatchOffer(offer),
              };
            }
            return { outcome: 'NOT_PENDING' };
          }
          if (offer.status !== 'PENDING') return { outcome: 'NOT_PENDING' };
          if (offer.expiresAt.getTime() <= now.getTime()) {
            await tx
              .update(dispatchOffers)
              .set({ status: 'EXPIRED', respondedAt: now })
              .where(and(eq(dispatchOffers.id, offer.id), eq(dispatchOffers.status, 'PENDING')));
            return { outcome: 'EXPIRED' };
          }

          const bookingRows = await tx
            .select()
            .from(bookings)
            .where(eq(bookings.id, offer.bookingId))
            .for('update')
            .limit(1);
          const booking = bookingRows[0];
          if (!booking || booking.status !== 'DISPATCHING' || booking.partnerUserId !== null) {
            return { outcome: 'BOOKING_CONFLICT' };
          }

          const availabilityRows = await tx
            .update(partnerAvailability)
            .set({
              activeJobCount: sql`${partnerAvailability.activeJobCount} + 1`,
              updatedAt: now,
            })
            .where(
              and(
                eq(partnerAvailability.partnerUserId, partnerUserId),
                lt(partnerAvailability.activeJobCount, maxActiveJobs),
              ),
            )
            .returning({ userId: partnerAvailability.partnerUserId });
          if (!availabilityRows[0]) {
            await tx
              .update(dispatchOffers)
              .set({ status: 'CANCELLED', respondedAt: now })
              .where(eq(dispatchOffers.id, offer.id));
            return { outcome: 'WORKLOAD_FULL' };
          }

          const [accepted] = await tx
            .update(dispatchOffers)
            .set({ status: 'ACCEPTED', respondedAt: now })
            .where(and(eq(dispatchOffers.id, offer.id), eq(dispatchOffers.status, 'PENDING')))
            .returning();
          if (!accepted) throw new Error('DISPATCH_OFFER_ACCEPT_FAILED');

          const nextVersion = booking.version + 1;
          const [updated] = await tx
            .update(bookings)
            .set({
              partnerUserId,
              status: 'PARTNER_ASSIGNED',
              version: nextVersion,
              updatedAt: now,
            })
            .where(
              and(
                eq(bookings.id, booking.id),
                eq(bookings.status, 'DISPATCHING'),
                eq(bookings.version, booking.version),
                sql`${bookings.partnerUserId} IS NULL`,
              ),
            )
            .returning();
          if (!updated) throw new Error('BOOKING_ASSIGN_FAILED');

          const [event] = await tx
            .insert(bookingEvents)
            .values({
              bookingId: booking.id,
              sequence: nextVersion,
              eventType: 'PARTNER_ASSIGNED',
              actorUserId: partnerUserId,
              payload: {
                fromStatus: 'DISPATCHING',
                toStatus: 'PARTNER_ASSIGNED',
                partnerUserId,
                offerId: offer.id,
              },
              createdAt: now,
            })
            .returning();
          if (!event) throw new Error('BOOKING_EVENT_INSERT_FAILED');

          await appendBookingOutbox(tx, event);

          return {
            outcome: 'ACCEPTED',
            booking: toBooking(updated),
            event: toBookingEvent(event),
            offer: toDispatchOffer(accepted),
          };
        });
      } finally {
        await close();
      }
    },

    async rejectDispatchOffer(offerId, partnerUserId, now) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx): Promise<RejectOfferResult> => {
          const rows = await tx
            .select()
            .from(dispatchOffers)
            .where(eq(dispatchOffers.id, offerId))
            .for('update')
            .limit(1);
          const offer = rows[0];
          if (!offer) return { outcome: 'NOT_FOUND' };
          if (offer.partnerUserId !== partnerUserId) return { outcome: 'FORBIDDEN' };
          if (offer.status === 'REJECTED') {
            return { outcome: 'ALREADY_REJECTED', bookingId: offer.bookingId, offer: toDispatchOffer(offer) };
          }
          if (offer.status !== 'PENDING') return { outcome: 'NOT_PENDING' };
          if (offer.expiresAt.getTime() <= now.getTime()) {
            await tx
              .update(dispatchOffers)
              .set({ status: 'EXPIRED', respondedAt: now })
              .where(and(eq(dispatchOffers.id, offer.id), eq(dispatchOffers.status, 'PENDING')));
            return { outcome: 'EXPIRED' };
          }

          const [rejected] = await tx
            .update(dispatchOffers)
            .set({ status: 'REJECTED', respondedAt: now })
            .where(and(eq(dispatchOffers.id, offer.id), eq(dispatchOffers.status, 'PENDING')))
            .returning();
          if (!rejected) return { outcome: 'NOT_PENDING' };
          return {
            outcome: 'REJECTED',
            bookingId: rejected.bookingId,
            offer: toDispatchOffer(rejected),
          };
        });
      } finally {
        await close();
      }
    },

    async expireDueOffers(now, limit) {
      const due = await db
        .select({ id: dispatchOffers.id })
        .from(dispatchOffers)
        .where(and(eq(dispatchOffers.status, 'PENDING'), lte(dispatchOffers.expiresAt, now)))
        .limit(limit);

      const bookingIds: string[] = [];
      for (const entry of due) {
        const rows = await db
          .update(dispatchOffers)
          .set({ status: 'EXPIRED', respondedAt: now })
          .where(
            and(
              eq(dispatchOffers.id, entry.id),
              eq(dispatchOffers.status, 'PENDING'),
              lte(dispatchOffers.expiresAt, now),
            ),
          )
          .returning({ bookingId: dispatchOffers.bookingId });
        if (rows[0]) bookingIds.push(rows[0].bookingId);
      }
      return bookingIds;
    },

    async cancelPendingOffers(bookingId) {
      await db
        .update(dispatchOffers)
        .set({ status: 'CANCELLED', respondedAt: new Date() })
        .where(and(eq(dispatchOffers.bookingId, bookingId), eq(dispatchOffers.status, 'PENDING')));
    },

    async adminAssignBooking(input: AdminAssignBookingInput) {
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      const now = new Date();
      try {
        return await wsDb.transaction(async (tx) => {
          const bookingRows = await tx
            .select()
            .from(bookings)
            .where(eq(bookings.id, input.bookingId))
            .for('update')
            .limit(1);
          const booking = bookingRows[0];
          if (
            !booking ||
            booking.status !== input.fromStatus ||
            booking.version !== input.expectedVersion
          ) {
            return null;
          }

          const previousPartnerUserId = booking.partnerUserId;
          if (previousPartnerUserId !== input.partnerUserId) {
            const availabilityRows = await tx
              .update(partnerAvailability)
              .set({
                activeJobCount: sql`${partnerAvailability.activeJobCount} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(partnerAvailability.partnerUserId, input.partnerUserId),
                  lt(partnerAvailability.activeJobCount, input.maxActiveJobs),
                ),
              )
              .returning({ userId: partnerAvailability.partnerUserId });
            if (!availabilityRows[0]) return null;

            if (previousPartnerUserId) {
              await tx
                .update(partnerAvailability)
                .set({
                  activeJobCount: sql`greatest(${partnerAvailability.activeJobCount} - 1, 0)`,
                  updatedAt: now,
                })
                .where(eq(partnerAvailability.partnerUserId, previousPartnerUserId));
            }
          }

          await tx
            .update(dispatchOffers)
            .set({ status: 'CANCELLED', respondedAt: now })
            .where(
              and(eq(dispatchOffers.bookingId, booking.id), eq(dispatchOffers.status, 'PENDING')),
            );

          const nextVersion = booking.version + 1;
          const [updated] = await tx
            .update(bookings)
            .set({
              partnerUserId: input.partnerUserId,
              status: 'PARTNER_ASSIGNED',
              version: nextVersion,
              updatedAt: now,
            })
            .where(
              and(
                eq(bookings.id, booking.id),
                eq(bookings.status, input.fromStatus),
                eq(bookings.version, input.expectedVersion),
              ),
            )
            .returning();
          if (!updated) return null;

          const [event] = await tx
            .insert(bookingEvents)
            .values({
              bookingId: booking.id,
              sequence: nextVersion,
              eventType: input.eventType,
              actorUserId: input.adminUserId,
              payload: {
                fromStatus: booking.status,
                toStatus: 'PARTNER_ASSIGNED',
                partnerUserId: input.partnerUserId,
                previousPartnerUserId,
                reason: input.reason,
                adminOverride: true,
              },
              createdAt: now,
            })
            .returning();
          if (!event) throw new Error('BOOKING_EVENT_INSERT_FAILED');

          await appendBookingOutbox(tx, event);

          await tx.insert(adminAuditLogs).values(auditValues(input.audit));

          return { booking: toBooking(updated), event: toBookingEvent(event) } satisfies TransitionBookingResult;
        });
      } finally {
        await close();
      }
    },

    async createMediaAsset(input: CreateMediaAssetInput) {
      const [created] = await db.insert(mediaAssets).values(input).returning();
      if (!created) throw new Error('MEDIA_ASSET_INSERT_FAILED');
      return toMediaAsset(created);
    },

    async getMediaAsset(publicId, ownerUserId) {
      const rows = await db
        .select()
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.cloudinaryPublicId, publicId),
            eq(mediaAssets.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? toMediaAsset(row) : null;
    },

    async markMediaVerified(publicId, ownerUserId, input: VerifyMediaInput) {
      const [updated] = await db
        .update(mediaAssets)
        .set({
          verified: true,
          format: input.format,
          bytes: input.bytes,
          verifiedAt: new Date(),
        })
        .where(
          and(
            eq(mediaAssets.cloudinaryPublicId, publicId),
            eq(mediaAssets.ownerUserId, ownerUserId),
          ),
        )
        .returning();
      return updated ? toMediaAsset(updated) : null;
    },

    async claimOutboxEvents(now, limit, bookingId) {
      const conditions = [isNull(outboxEvents.processedAt), lte(outboxEvents.availableAt, now)];
      if (bookingId) conditions.push(eq(outboxEvents.aggregateId, bookingId));
      const { db: wsDb, close } = createWebSocketDb(databaseUrl);
      try {
        return await wsDb.transaction(async (tx) => {
          const rows = await tx
            .select()
            .from(outboxEvents)
            .where(and(...conditions))
            .orderBy(asc(outboxEvents.availableAt))
            .limit(limit)
            .for('update', { skipLocked: true });
          if (rows.length === 0) return [];
          await tx
            .update(outboxEvents)
            .set({
              attempts: sql`${outboxEvents.attempts} + 1`,
              availableAt: new Date(now.getTime() + OUTBOX_CLAIM_LEASE_MS),
            })
            .where(inArray(outboxEvents.id, rows.map((row) => row.id)));
          return rows.map((row) => ({ ...toOutboxEvent(row), attempts: row.attempts + 1 }));
        });
      } finally {
        await close();
      }
    },

    async getOutboxEvent(outboxId) {
      const rows = await db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.id, outboxId))
        .limit(1);
      const row = rows[0];
      return row ? toOutboxEvent(row) : null;
    },

    async markOutboxProcessed(ids, now) {
      if (ids.length === 0) return;
      await db
        .update(outboxEvents)
        .set({ processedAt: now })
        .where(inArray(outboxEvents.id, ids));
    },

    async markOutboxRetry(ids, now, availableAt, error) {
      if (ids.length === 0) return;
      await db
        .update(outboxEvents)
        .set({ availableAt, lastError: error.slice(0, 500) })
        .where(inArray(outboxEvents.id, ids));
    },

    async upsertPushToken(input) {
      const [created] = await db
        .insert(pushTokens)
        .values({
          userId: input.userId,
          expoPushToken: input.expoPushToken,
          devicePlatform: input.devicePlatform,
          active: true,
        })
        .onConflictDoUpdate({
          target: pushTokens.expoPushToken,
          set: {
            userId: input.userId,
            devicePlatform: input.devicePlatform,
            active: true,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!created) throw new Error('PUSH_TOKEN_INSERT_FAILED');
      return toPushToken(created);
    },

    async getPushToken(pushTokenId) {
      const rows = await db
        .select()
        .from(pushTokens)
        .where(eq(pushTokens.id, pushTokenId))
        .limit(1);
      const row = rows[0];
      return row ? toPushToken(row) : null;
    },

    async listPushTokens(userId) {
      const rows = await db
        .select()
        .from(pushTokens)
        .where(eq(pushTokens.userId, userId))
        .orderBy(desc(pushTokens.createdAt));
      return rows.map(toPushToken);
    },

    async deactivatePushToken(pushTokenId, userId) {
      const rows = await db
        .update(pushTokens)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(pushTokens.id, pushTokenId), eq(pushTokens.userId, userId)))
        .returning({ id: pushTokens.id });
      return rows.length > 0;
    },

    async deactivatePushTokenByValue(expoPushToken, now) {
      await db
        .update(pushTokens)
        .set({ active: false, updatedAt: now })
        .where(eq(pushTokens.expoPushToken, expoPushToken));
    },

    async activePushTokensForUsers(userIds) {
      if (userIds.length === 0) return [];
      const rows = await db
        .select({
          id: pushTokens.id,
          userId: pushTokens.userId,
          expoPushToken: pushTokens.expoPushToken,
          devicePlatform: pushTokens.devicePlatform,
          active: pushTokens.active,
          createdAt: pushTokens.createdAt,
          updatedAt: pushTokens.updatedAt,
        })
        .from(pushTokens)
        .where(and(inArray(pushTokens.userId, userIds), eq(pushTokens.active, true)));
      return rows.map(toPushToken);
    },

    async createNotificationDeliveries(inputs) {
      if (inputs.length === 0) return [];
      const rows = await db
        .insert(notificationDeliveries)
        .values(
          inputs.map((input) => ({
            userId: input.userId,
            pushTokenId: input.pushTokenId,
            bookingId: input.bookingId,
            outboxEventId: input.outboxEventId,
            eventType: input.eventType,
            nextAttemptAt: new Date(),
          })),
        )
        .returning();
      return rows.map(toDelivery);
    },

    async updateNotificationDelivery(id, patch, now) {
      await db
        .update(notificationDeliveries)
        .set({
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.expoTicketId === undefined ? {} : { expoTicketId: patch.expoTicketId }),
          ...(patch.errorCode === undefined ? {} : { errorCode: patch.errorCode }),
          ...(patch.attempts === undefined ? {} : { attempts: patch.attempts }),
          ...(patch.nextAttemptAt === undefined ? {} : { nextAttemptAt: patch.nextAttemptAt }),
          updatedAt: now,
        })
        .where(eq(notificationDeliveries.id, id));
    },

    async listDeliveriesByOutboxEvent(outboxEventId) {
      const rows = await db
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.outboxEventId, outboxEventId));
      return rows.map(toDelivery);
    },

    async listDueDeliveries(now, limit) {
      const rows = await db
        .select()
        .from(notificationDeliveries)
        .where(
          and(
            inArray(notificationDeliveries.status, ['PENDING', 'FAILED']),
            isNotNull(notificationDeliveries.nextAttemptAt),
            lte(notificationDeliveries.nextAttemptAt, now),
          ),
        )
        .orderBy(asc(notificationDeliveries.createdAt))
        .limit(limit);
      return rows.map(toDelivery);
    },

    async listDeliveriesForReceipts(now, olderThanMs, limit) {
      const rows = await db
        .select()
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.status, 'SENT'),
            isNotNull(notificationDeliveries.expoTicketId),
            lte(notificationDeliveries.updatedAt, new Date(now.getTime() - olderThanMs)),
          ),
        )
        .orderBy(asc(notificationDeliveries.updatedAt))
        .limit(limit);
      return rows.map(toDelivery);
    },
  };
}

export type { Page };
