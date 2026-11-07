import type { BookingStatus, OfferStatus, PartnerStatus } from '../db/schema';

export interface City {
  id: string;
  name: string;
  state: string;
  countryCode: string;
  enabled: boolean;
}

export interface Zone {
  id: string;
  cityId: string;
  name: string;
  boundaryGeojson: Record<string, unknown> | null;
  enabled: boolean;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
}

export interface ServiceItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePrice: string | null;
  currency: string;
  enabled: boolean;
}

export interface PartnerSkill {
  categoryCode: string;
  verified: boolean;
}

export interface PartnerProfile {
  userId: string;
  displayName: string;
  email: string | null;
  status: PartnerStatus;
  serviceCityId: string | null;
  cityName: string | null;
  bio: string | null;
  verifiedAt: string | null;
  skills: PartnerSkill[];
  createdAt: string;
  updatedAt: string;
}

export interface PartnerSummary {
  userId: string;
  displayName: string;
  email: string | null;
  status: PartnerStatus;
  cityName: string | null;
  skillCount: number;
  verifiedSkillCount: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  requestId: string | null;
  createdAt: string;
}

export interface AuditMeta {
  adminUserId: string;
  reason: string | null;
  requestId: string | null;
  ipHash: string | null;
  userAgent: string | null;
}

export interface AuditEntry extends AuditMeta {
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
}

export interface MediaAsset {
  id: string;
  ownerUserId: string;
  cloudinaryPublicId: string;
  resourceType: string;
  mediaKind: string;
  format: string | null;
  bytes: number | null;
  folder: string | null;
  verified: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CreateZoneInput {
  cityId: string;
  name: string;
  boundaryGeojson: Record<string, unknown> | null;
  enabled: boolean;
}

export interface CreateCategoryInput {
  code: string;
  name: string;
  enabled: boolean;
}

export interface CreateItemInput {
  categoryId: string;
  name: string;
  description: string | null;
  basePrice: string | null;
  enabled: boolean;
}

export interface UpsertPartnerInput {
  userId: string;
  status: PartnerStatus;
  serviceCityId: string;
  bio: string | null;
  skills: string[];
}

export interface PartnerListFilter {
  status?: PartnerStatus;
  limit: number;
  cursor?: string;
}

export interface AuditListFilter {
  limit: number;
  cursor?: string;
}

export interface CreateMediaAssetInput {
  ownerUserId: string;
  cloudinaryPublicId: string;
  resourceType: string;
  mediaKind: string;
  folder: string;
}

export interface VerifyMediaInput {
  format: string;
  bytes: number;
}

export interface Address {
  id: string;
  userId: string;
  label: string | null;
  addressLine: string;
  locality: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: string | null;
  longitude: string | null;
  createdAt: string;
}

export interface CreateAddressInput {
  label: string | null;
  addressLine: string;
  locality: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface UpdateAddressInput {
  label?: string | null;
  addressLine?: string;
  locality?: string | null;
  city?: string;
  state?: string;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Booking {
  id: string;
  customerUserId: string;
  partnerUserId: string | null;
  serviceItemId: string;
  addressId: string | null;
  status: BookingStatus;
  scheduledAt: string | null;
  currency: string;
  quotedTotal: string | null;
  version: number;
  idempotencyKey: string;
  serviceAddressLine: string;
  serviceLocality: string | null;
  serviceCity: string;
  serviceState: string;
  servicePostalCode: string | null;
  serviceLatitude: string | null;
  serviceLongitude: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingEvent {
  id: string;
  bookingId: string;
  sequence: number;
  eventType: string;
  actorUserId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CreateBookingInput {
  customerUserId: string;
  serviceItemId: string;
  addressId: string;
  scheduledAt: Date | null;
  quotedTotal: string;
  idempotencyKey: string;
  requestHash: string;
  snapshot: {
    addressLine: string;
    locality: string | null;
    city: string;
    state: string;
    postalCode: string | null;
    latitude: string | null;
    longitude: string | null;
  };
}

export type CreateBookingResult =
  | { replayed: false; booking: Booking }
  | { replayed: true; bookingId: string; requestHash: string };

export interface IdempotencyRecord {
  bookingId: string;
  requestHash: string;
  expiresAt: string;
}

export interface BookingEventInput {
  eventType: string;
  actorUserId: string | null;
  payload: Record<string, unknown>;
}

export interface TransitionBookingInput {
  bookingId: string;
  actorUserId: string | null;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  expectedVersion: number;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface TransitionBookingResult {
  booking: Booking;
  event: BookingEvent;
}

export interface PartnerAvailability {
  partnerUserId: string;
  isOnline: boolean;
  activeJobCount: number;
  latitude: string | null;
  longitude: string | null;
  locationUpdatedAt: string | null;
  updatedAt: string;
}

export interface SetPartnerAvailabilityInput {
  isOnline: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface DispatchCandidate {
  userId: string;
  displayName: string;
  activeJobCount: number;
  latitude: string | null;
  longitude: string | null;
}

export interface DispatchCandidateQuery {
  categoryCode: string;
  city: string;
  state: string;
  maxActiveJobs: number;
  onlineOnly: boolean;
  partnerId?: string;
  limit: number;
}

export interface DispatchOffer {
  id: string;
  bookingId: string;
  partnerUserId: string;
  status: OfferStatus;
  score: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface PartnerOffer extends DispatchOffer {
  bookingStatus: BookingStatus;
  serviceCity: string;
  serviceItemName: string;
  quotedTotal: string | null;
  scheduledAt: string | null;
}

export interface DispatchAttempt {
  id: string;
  bookingId: string;
  attemptNumber: number;
  candidateCount: number;
  outcome: string | null;
  createdAt: string;
}

export interface CreateDispatchAttemptInput {
  bookingId: string;
  candidateCount: number;
  outcome: string;
  partnerUserId?: string;
  score?: string;
  expiresAt?: Date;
}

export interface CreateDispatchAttemptResult {
  attempt: DispatchAttempt;
  offer: DispatchOffer | null;
}

export type AcceptOfferResult =
  | { outcome: 'ACCEPTED'; booking: Booking; event: BookingEvent; offer: DispatchOffer }
  | { outcome: 'ALREADY_ACCEPTED'; booking: Booking; offer: DispatchOffer }
  | {
      outcome:
        | 'NOT_FOUND'
        | 'FORBIDDEN'
        | 'EXPIRED'
        | 'NOT_PENDING'
        | 'BOOKING_CONFLICT'
        | 'WORKLOAD_FULL';
    };

export type RejectOfferResult =
  | { outcome: 'REJECTED'; bookingId: string; offer: DispatchOffer }
  | { outcome: 'ALREADY_REJECTED'; bookingId: string; offer: DispatchOffer }
  | { outcome: 'NOT_FOUND' | 'FORBIDDEN' | 'EXPIRED' | 'NOT_PENDING' };

export interface AdminAssignBookingInput {
  bookingId: string;
  partnerUserId: string;
  adminUserId: string;
  fromStatus: BookingStatus;
  expectedVersion: number;
  reason: string;
  eventType: string;
  audit: AuditEntry;
  maxActiveJobs: number;
}

export interface OutboxEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  attempts: number;
  availableAt: string;
  processedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface PushToken {
  id: string;
  userId: string;
  expoPushToken: string;
  devicePlatform: string | null;
  active: boolean;
  createdAt: string;
}

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'RECEIPT_OK' | 'RECEIPT_ERROR';

export interface NotificationDelivery {
  id: string;
  userId: string;
  pushTokenId: string | null;
  bookingId: string | null;
  outboxEventId: string | null;
  eventType: string;
  status: NotificationStatus;
  expoTicketId: string | null;
  errorCode: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPushTokenInput {
  userId: string;
  expoPushToken: string;
  devicePlatform: string | null;
}

export interface CreateDeliveryInput {
  userId: string;
  pushTokenId: string;
  bookingId: string;
  outboxEventId: string;
  eventType: string;
}

export interface DeliveryPatch {
  status?: NotificationStatus;
  expoTicketId?: string | null;
  errorCode?: string | null;
  attempts?: number;
  nextAttemptAt?: Date | null;
}


