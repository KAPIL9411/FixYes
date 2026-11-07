import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const appRole = pgEnum('app_role', ['CUSTOMER', 'PARTNER', 'ADMIN']);
export const partnerStatus = pgEnum('partner_status', [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
]);
export const bookingStatus = pgEnum('booking_status', [
  'REQUESTED',
  'DISPATCHING',
  'PARTNER_ASSIGNED',
  'PARTNER_ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETION_PENDING',
  'COMPLETED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_PARTNER',
  'CANCELLED_BY_ADMIN',
  'NO_PARTNER_AVAILABLE',
  'DISPUTED',
]);
export const offerStatus = pgEnum('offer_status', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);
export const quoteStatus = pgEnum('quote_status', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
]);

export type AppRole = (typeof appRole.enumValues)[number];
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
export type OfferStatus = (typeof offerStatus.enumValues)[number];
export type PartnerStatus = (typeof partnerStatus.enumValues)[number];

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    avatarUrl: text('avatar_url'),
    accountDisabled: boolean('account_disabled').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_verified_email_unique')
      .on(t.email)
      .where(sql`${t.email} IS NOT NULL AND ${t.emailVerified}`),
    check('users_email_normalized', sql`${t.email} IS NULL OR ${t.email} = lower(${t.email})`),
  ],
);

export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('google'),
    providerSubject: text('provider_subject').notNull().unique(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('external_identities_provider_google', sql`${t.provider} = 'google'`),
    index('external_identities_user_idx').on(t.userId),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: appRole('role').notNull(),
    grantedAt: ts('granted_at').notNull().defaultNow(),
    grantedBy: uuid('granted_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastUsedAt: ts('last_used_at').notNull().defaultNow(),
    idleExpiresAt: ts('idle_expires_at').notNull(),
    absoluteExpiresAt: ts('absolute_expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId, t.revokedAt),
    index('sessions_expiry_idx').on(t.idleExpiresAt),
  ],
);

export const authNonces = pgTable(
  'auth_nonces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nonceHash: text('nonce_hash').notNull().unique(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
  },
  (t) => [index('auth_nonces_expiry_idx').on(t.expiresAt)],
);

export const customerProfiles = pgTable('customer_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const serviceCities = pgTable(
  'service_cities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    state: text('state').notNull(),
    countryCode: char('country_code', { length: 2 }).notNull().default('IN'),
    enabled: boolean('enabled').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('service_cities_name_state_unique').on(t.name, t.state),
    check('service_cities_country_in', sql`${t.countryCode} = 'IN'`),
  ],
);

export const serviceZones = pgTable(
  'service_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => serviceCities.id),
    name: text('name').notNull(),
    boundaryGeojson: jsonb('boundary_geojson').$type<Record<string, unknown>>(),
    enabled: boolean('enabled').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('service_zones_city_idx').on(t.cityId)],
);

export const serviceCategories = pgTable('service_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const serviceItems = pgTable(
  'service_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id),
    name: text('name').notNull(),
    description: text('description'),
    basePrice: numeric('base_price', { precision: 12, scale: 2 }),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    enabled: boolean('enabled').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('service_items_category_idx').on(t.categoryId),
    check('service_items_currency_inr', sql`${t.currency} = 'INR'`),
    check('service_items_base_price_non_negative', sql`${t.basePrice} IS NULL OR ${t.basePrice} >= 0`),
  ],
);

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label'),
    addressLine: text('address_line').notNull(),
    locality: text('locality'),
    city: text('city').notNull(),
    state: text('state').notNull(),
    postalCode: text('postal_code'),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('addresses_user_idx').on(t.userId),
    check('addresses_latitude_range', sql`${t.latitude} IS NULL OR (${t.latitude} >= -90 AND ${t.latitude} <= 90)`),
    check(
      'addresses_longitude_range',
      sql`${t.longitude} IS NULL OR (${t.longitude} >= -180 AND ${t.longitude} <= 180)`,
    ),
  ],
);

export const partnerProfiles = pgTable(
  'partner_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: partnerStatus('status').notNull().default('DRAFT'),
    serviceCityId: uuid('service_city_id').references(() => serviceCities.id),
    bio: text('bio'),
    verifiedAt: ts('verified_at'),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('partner_profiles_status_city_idx').on(t.status, t.serviceCityId)],
);

export const partnerSkills = pgTable(
  'partner_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerUserId: uuid('partner_user_id')
      .notNull()
      .references(() => partnerProfiles.userId, { onDelete: 'cascade' }),
    categoryCode: text('category_code')
      .notNull()
      .references(() => serviceCategories.code),
    verified: boolean('verified').notNull().default(false),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: ts('verified_at'),
  },
  (t) => [
    uniqueIndex('partner_skills_partner_category_unique').on(t.partnerUserId, t.categoryCode),
    index('partner_skills_category_verified_idx').on(t.categoryCode, t.verified),
  ],
);

export const partnerZoneMemberships = pgTable(
  'partner_zone_memberships',
  {
    partnerUserId: uuid('partner_user_id')
      .notNull()
      .references(() => partnerProfiles.userId, { onDelete: 'cascade' }),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => serviceZones.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.partnerUserId, t.zoneId] }),
    index('partner_zone_memberships_zone_idx').on(t.zoneId),
  ],
);

export const partnerAvailability = pgTable(
  'partner_availability',
  {
    partnerUserId: uuid('partner_user_id')
      .primaryKey()
      .references(() => partnerProfiles.userId, { onDelete: 'cascade' }),
    isOnline: boolean('is_online').notNull().default(false),
    activeJobCount: integer('active_job_count').notNull().default(0),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    locationUpdatedAt: ts('location_updated_at'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('partner_availability_online_idx')
      .on(t.isOnline)
      .where(sql`${t.isOnline} = true`),
    check('partner_availability_active_jobs_non_negative', sql`${t.activeJobCount} >= 0`),
  ],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    partnerUserId: uuid('partner_user_id').references(() => partnerProfiles.userId),
    serviceItemId: uuid('service_item_id')
      .notNull()
      .references(() => serviceItems.id),
    addressId: uuid('address_id').references(() => addresses.id),
    status: bookingStatus('status').notNull().default('REQUESTED'),
    scheduledAt: ts('scheduled_at'),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    quotedTotal: numeric('quoted_total', { precision: 12, scale: 2 }),
    version: integer('version').notNull().default(1),
    idempotencyKey: text('idempotency_key').notNull(),
    serviceAddressLine: text('service_address_line').notNull(),
    serviceLocality: text('service_locality'),
    serviceCity: text('service_city').notNull(),
    serviceState: text('service_state').notNull(),
    servicePostalCode: text('service_postal_code'),
    serviceLatitude: numeric('service_latitude', { precision: 9, scale: 6 }),
    serviceLongitude: numeric('service_longitude', { precision: 9, scale: 6 }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookings_customer_idempotency_unique').on(t.customerUserId, t.idempotencyKey),
    index('bookings_customer_created_idx').on(t.customerUserId, t.createdAt),
    index('bookings_partner_status_idx').on(t.partnerUserId, t.status),
    index('bookings_status_created_idx').on(t.status, t.createdAt),
    index('bookings_address_idx').on(t.addressId),
    index('bookings_service_item_idx').on(t.serviceItemId),
    check('bookings_currency_inr', sql`${t.currency} = 'INR'`),
    check('bookings_version_positive', sql`${t.version} >= 1`),
    check('bookings_quoted_total_non_negative', sql`${t.quotedTotal} IS NULL OR ${t.quotedTotal} >= 0`),
  ],
);

export const bookingEvents = pgTable(
  'booking_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    sequence: bigint('sequence', { mode: 'number' }).notNull(),
    eventType: text('event_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('booking_events_booking_sequence_unique').on(t.bookingId, t.sequence),
    index('booking_events_booking_created_idx').on(t.bookingId, t.createdAt),
    check('booking_events_sequence_positive', sql`${t.sequence} > 0`),
  ],
);

export const bookingQuotes = pgTable(
  'booking_quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => users.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    reason: text('reason').notNull(),
    status: quoteStatus('status').notNull().default('PENDING'),
    expiresAt: ts('expires_at').notNull(),
    respondedAt: ts('responded_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('booking_quotes_booking_version_unique').on(t.bookingId, t.version),
    index('booking_quotes_booking_status_idx').on(t.bookingId, t.status),
    check('booking_quotes_amount_non_negative', sql`${t.amount} >= 0`),
    check('booking_quotes_version_positive', sql`${t.version} >= 1`),
    check('booking_quotes_currency_inr', sql`${t.currency} = 'INR'`),
  ],
);

export const bookingQuoteItems = pgTable(
  'booking_quote_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => bookingQuotes.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
    unitAmount: numeric('unit_amount', { precision: 12, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('booking_quote_items_quote_idx').on(t.quoteId),
    check('booking_quote_items_quantity_positive', sql`${t.quantity} > 0`),
    check('booking_quote_items_unit_amount_non_negative', sql`${t.unitAmount} >= 0`),
    check('booking_quote_items_total_amount_non_negative', sql`${t.totalAmount} >= 0`),
  ],
);

export const dispatchOffers = pgTable(
  'dispatch_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    partnerUserId: uuid('partner_user_id')
      .notNull()
      .references(() => partnerProfiles.userId),
    status: offerStatus('status').notNull().default('PENDING'),
    score: numeric('score', { precision: 10, scale: 4 }),
    expiresAt: ts('expires_at').notNull(),
    respondedAt: ts('responded_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dispatch_offers_one_pending_per_booking')
      .on(t.bookingId)
      .where(sql`${t.status} = 'PENDING'`),
    index('dispatch_offers_partner_idx').on(t.partnerUserId, t.status, t.expiresAt),
    index('dispatch_offers_booking_created_idx').on(t.bookingId, t.createdAt),
  ],
);

export const dispatchAttempts = pgTable(
  'dispatch_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    candidateCount: integer('candidate_count').notNull().default(0),
    outcome: text('outcome'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dispatch_attempts_booking_number_unique').on(t.bookingId, t.attemptNumber),
    index('dispatch_attempts_booking_idx').on(t.bookingId),
    check('dispatch_attempts_number_positive', sql`${t.attemptNumber} >= 1`),
    check('dispatch_attempts_candidate_count_non_negative', sql`${t.candidateCount} >= 0`),
  ],
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    bookingId: uuid('booking_id').references(() => bookings.id),
    partnerUserId: uuid('partner_user_id').references(() => partnerProfiles.userId),
    cloudinaryPublicId: text('cloudinary_public_id').notNull().unique(),
    resourceType: text('resource_type').notNull(),
    mediaKind: text('media_kind').notNull(),
    format: text('format'),
    bytes: integer('bytes'),
    folder: text('folder'),
    verified: boolean('verified').notNull().default(false),
    verifiedAt: ts('verified_at'),
    verifiedBy: uuid('verified_by').references(() => users.id),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('media_assets_owner_idx').on(t.ownerUserId),
    index('media_assets_booking_idx').on(t.bookingId),
    check('media_assets_bytes_non_negative', sql`${t.bytes} IS NULL OR ${t.bytes} >= 0`),
  ],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expoPushToken: text('expo_push_token').notNull().unique(),
    devicePlatform: text('device_platform'),
    active: boolean('active').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    availableAt: ts('available_at').notNull().defaultNow(),
    processedAt: ts('processed_at'),
    lastError: text('last_error'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('outbox_events_pending_idx')
      .on(t.availableAt)
      .where(sql`${t.processedAt} IS NULL`),
    check('outbox_events_attempts_non_negative', sql`${t.attempts} >= 0`),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pushTokenId: uuid('push_token_id').references(() => pushTokens.id, { onDelete: 'set null' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    outboxEventId: uuid('outbox_event_id').references(() => outboxEvents.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    status: text('status').notNull().default('PENDING'),
    expoTicketId: text('expo_ticket_id'),
    errorCode: text('error_code'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('notification_deliveries_retry_idx').on(t.status, t.nextAttemptAt),
    index('notification_deliveries_user_idx').on(t.userId),
    check(
      'notification_deliveries_status_valid',
      sql`${t.status} IN ('PENDING','SENT','FAILED','RECEIPT_OK','RECEIPT_ERROR')`,
    ),
    check('notification_deliveries_attempts_non_negative', sql`${t.attempts} >= 0`),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull().default(sql`now() + interval '24 hours'`),
  },
  (t) => [
    uniqueIndex('idempotency_keys_actor_key_unique').on(t.actorUserId, t.key),
    index('idempotency_keys_expiry_idx').on(t.expiresAt),
  ],
);

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id'),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('admin_audit_logs_created_idx').on(t.createdAt),
    index('admin_audit_logs_target_idx').on(t.targetType, t.targetId),
  ],
);

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
