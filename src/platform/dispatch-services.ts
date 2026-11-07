import type { AuthUser } from '../auth/service';
import { DEFAULT_DISPATCH_CONFIG, rankCandidates, type DispatchConfig } from '../domain/dispatch';
import { AppError, forbidden } from '../lib/errors';
import { systemClock, type Clock } from '../lib/clock';
import type { PlatformStore } from './store-contract';
import type {
  AuditEntry,
  AuditMeta,
  Booking,
  PartnerAvailability,
  PartnerOffer,
  SetPartnerAvailabilityInput,
  Zone,
} from './types';

const NO_PARTNER_STATUS = 'NO_PARTNER_AVAILABLE' as const;

function requirePartner(actor: AuthUser): void {
  if (!actor.roles.includes('PARTNER')) throw forbidden('Partner role required');
}

function requireAdmin(actor: AuthUser): void {
  if (!actor.roles.includes('ADMIN')) throw forbidden('Admin role required');
}

function assignmentAudit(
  meta: AuditMeta,
  action: string,
  bookingId: string,
  partnerUserId: string,
  previousPartnerUserId: string | null,
): AuditEntry {
  return {
    ...meta,
    action,
    targetType: 'booking',
    targetId: bookingId,
    metadata: { partnerUserId, previousPartnerUserId },
  };
}

export interface DispatchService {
  start(bookingId: string): Promise<Booking>;
  listOffers(actor: AuthUser): Promise<PartnerOffer[]>;
  acceptOffer(actor: AuthUser, offerId: string): Promise<Booking>;
  rejectOffer(actor: AuthUser, offerId: string): Promise<Booking>;
  expireOffers(now?: Date): Promise<{ expired: number; advanced: number }>;
  assign(
    actor: AuthUser,
    bookingId: string,
    partnerUserId: string,
    reason: string,
    meta: AuditMeta,
    expectedVersion?: number,
  ): Promise<Booking>;
  reassign(
    actor: AuthUser,
    bookingId: string,
    partnerUserId: string,
    reason: string,
    meta: AuditMeta,
    expectedVersion?: number,
  ): Promise<Booking>;
  getAvailability(actor: AuthUser): Promise<PartnerAvailability | null>;
  setAvailability(actor: AuthUser, input: SetPartnerAvailabilityInput): Promise<PartnerAvailability>;
  getZoneIds(actor: AuthUser): Promise<string[]>;
  setZoneIds(actor: AuthUser, zoneIds: string[]): Promise<string[]>;
}

export interface DispatchServiceOptions {
  store: PlatformStore;
  clock?: Clock;
  config?: Partial<DispatchConfig>;
}

export function createDispatchService(options: DispatchServiceOptions): DispatchService {
  const store = options.store;
  const clock = options.clock ?? systemClock;
  const config: DispatchConfig = { ...DEFAULT_DISPATCH_CONFIG, ...options.config };

  async function loadBooking(bookingId: string): Promise<Booking> {
    const booking = await store.getBooking(bookingId);
    if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    return booking;
  }

  async function bookingCategoryCode(booking: Booking): Promise<string> {
    const item = await store.getServiceItem(booking.serviceItemId);
    if (!item) throw new AppError(409, 'SERVICE_ITEM_NOT_AVAILABLE', 'Service item is not available');
    const categories = await store.listCategories(false);
    const category = categories.find((entry) => entry.id === item.categoryId);
    if (!category) throw new AppError(409, 'CATEGORY_NOT_AVAILABLE', 'Service category is not available');
    return category.code;
  }

  async function toNoPartner(booking: Booking): Promise<Booking> {
    if (booking.status === NO_PARTNER_STATUS) return booking;
    if (booking.status !== 'DISPATCHING') {
      throw new AppError(409, 'BOOKING_CONFLICT', 'Booking is no longer dispatching');
    }
    const result = await store.transitionBooking({
      bookingId: booking.id,
      actorUserId: null,
      fromStatus: 'DISPATCHING',
      toStatus: NO_PARTNER_STATUS,
      expectedVersion: booking.version,
      eventType: 'NO_PARTNER_AVAILABLE',
      payload: { fromStatus: 'DISPATCHING', toStatus: NO_PARTNER_STATUS },
    });
    if (!result) throw new AppError(409, 'BOOKING_CONFLICT', 'Booking changed during dispatch');
    return result.booking;
  }

  async function dispatchNext(booking: Booking): Promise<Booking> {
    if (booking.status !== 'DISPATCHING') return booking;

    const now = clock.now();
    const offers = await store.listDispatchOffersForBooking(booking.id);
    const active = offers.find(
      (offer) => offer.status === 'PENDING' && new Date(offer.expiresAt).getTime() > now.getTime(),
    );
    if (active) return booking;

    const attempts = await store.listDispatchAttempts(booking.id);
    if (attempts.length >= config.maxAttempts) {
      return toNoPartner(booking);
    }

    const categoryCode = await bookingCategoryCode(booking);
    const candidates = await store.listDispatchCandidates({
      categoryCode,
      city: booking.serviceCity,
      state: booking.serviceState,
      maxActiveJobs: config.maxActiveJobs,
      onlineOnly: true,
      limit: config.candidateLimit,
    });

    const alreadyOffered = new Set(offers.map((offer) => offer.partnerUserId));
    const fresh = candidates.filter((candidate) => !alreadyOffered.has(candidate.userId));
    const ranked = rankCandidates(fresh, {
      latitude: booking.serviceLatitude,
      longitude: booking.serviceLongitude,
    });

    if (ranked.length === 0) {
      await store.createDispatchAttempt({
        bookingId: booking.id,
        candidateCount: 0,
        outcome: 'NO_CANDIDATES',
      });
      return toNoPartner(booking);
    }

    const selected = ranked[0];
    if (!selected) throw new Error('DISPATCH_SELECTION_MISSING');

    await store.createDispatchAttempt({
      bookingId: booking.id,
      candidateCount: ranked.length,
      outcome: 'OFFER_CREATED',
      partnerUserId: selected.candidate.userId,
      score: selected.score.toFixed(4),
      expiresAt: new Date(now.getTime() + config.offerTtlMs),
    });

    return booking;
  }

  async function advanceAfterOffer(bookingId: string): Promise<Booking> {
    const booking = await loadBooking(bookingId);
    return dispatchNext(booking);
  }

  function offerError(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }

  return {
    async start(bookingId) {
      let booking = await loadBooking(bookingId);
      if (booking.status === 'REQUESTED') {
        const result = await store.transitionBooking({
          bookingId,
          actorUserId: null,
          fromStatus: 'REQUESTED',
          toStatus: 'DISPATCHING',
          expectedVersion: booking.version,
          eventType: 'DISPATCH_STARTED',
          payload: { fromStatus: 'REQUESTED', toStatus: 'DISPATCHING' },
        });
        if (!result) throw new AppError(409, 'BOOKING_CONFLICT', 'Booking changed before dispatch');
        booking = result.booking;
      }
      return dispatchNext(booking);
    },

    async listOffers(actor) {
      requirePartner(actor);
      return store.listPartnerOffers(actor.id, clock.now());
    },

    async acceptOffer(actor, offerId) {
      requirePartner(actor);
      const result = await store.acceptDispatchOffer(
        offerId,
        actor.id,
        clock.now(),
        config.maxActiveJobs,
      );

      if (result.outcome === 'ACCEPTED') return result.booking;
      if (result.outcome === 'ALREADY_ACCEPTED') return result.booking;
      if (result.outcome === 'NOT_FOUND') {
        throw new AppError(404, 'OFFER_NOT_FOUND', 'Offer not found');
      }
      if (result.outcome === 'FORBIDDEN') {
        throw forbidden('This offer does not belong to you');
      }
      if (result.outcome === 'EXPIRED') {
        const offer = await store.getDispatchOffer(offerId);
        if (offer) await advanceAfterOffer(offer.bookingId);
        throw offerError('OFFER_EXPIRED', 'Offer has expired');
      }
      if (result.outcome === 'WORKLOAD_FULL') {
        const offer = await store.getDispatchOffer(offerId);
        if (offer) await advanceAfterOffer(offer.bookingId);
        throw offerError('PARTNER_WORKLOAD_FULL', 'Partner workload limit has been reached');
      }
      if (result.outcome === 'BOOKING_CONFLICT') {
        throw offerError('BOOKING_CONFLICT', 'Booking is no longer available for assignment');
      }
      throw offerError('OFFER_NOT_PENDING', 'Offer is no longer pending');
    },

    async rejectOffer(actor, offerId) {
      requirePartner(actor);
      const result = await store.rejectDispatchOffer(offerId, actor.id, clock.now());
      if (result.outcome === 'NOT_FOUND') {
        throw new AppError(404, 'OFFER_NOT_FOUND', 'Offer not found');
      }
      if (result.outcome === 'FORBIDDEN') {
        throw forbidden('This offer does not belong to you');
      }
      if (result.outcome === 'EXPIRED') {
        const offer = await store.getDispatchOffer(offerId);
        if (offer) await advanceAfterOffer(offer.bookingId);
        throw offerError('OFFER_EXPIRED', 'Offer has expired');
      }
      if (result.outcome === 'NOT_PENDING') {
        throw offerError('OFFER_NOT_PENDING', 'Offer is no longer pending');
      }
      if (result.outcome === 'REJECTED' || result.outcome === 'ALREADY_REJECTED') {
        return advanceAfterOffer(result.bookingId);
      }
      throw offerError('OFFER_NOT_PENDING', 'Offer is no longer pending');
    },

    async expireOffers(now = clock.now()) {
      const bookingIds = await store.expireDueOffers(now, 50);
      let advanced = 0;
      for (const bookingId of bookingIds) {
        const booking = await store.getBooking(bookingId);
        if (!booking || booking.status !== 'DISPATCHING') continue;
        await dispatchNext(booking);
        advanced += 1;
      }
      return { expired: bookingIds.length, advanced };
    },

    async assign(actor, bookingId, partnerUserId, reason, meta, expectedVersion) {
      requireAdmin(actor);
      let booking = await loadBooking(bookingId);
      if (expectedVersion !== undefined && expectedVersion !== booking.version) {
        throw new AppError(409, 'BOOKING_VERSION_CONFLICT', 'Booking has changed; retry');
      }
      if (!['REQUESTED', 'DISPATCHING', NO_PARTNER_STATUS].includes(booking.status)) {
        throw new AppError(409, 'INVALID_ASSIGNMENT_STATE', 'Booking cannot be assigned in its current state');
      }
      if (booking.partnerUserId) {
        throw new AppError(409, 'BOOKING_ALREADY_ASSIGNED', 'Use reassignment for an assigned booking');
      }

      const categoryCode = await bookingCategoryCode(booking);
      const eligible = await store.listDispatchCandidates({
        categoryCode,
        city: booking.serviceCity,
        state: booking.serviceState,
        maxActiveJobs: config.maxActiveJobs,
        onlineOnly: false,
        partnerId: partnerUserId,
        limit: 1,
      });
      if (eligible.length === 0) {
        throw new AppError(
          400,
          'PARTNER_NOT_ELIGIBLE',
          'Partner is not approved, verified for this skill, in the service city/zone, or has capacity',
        );
      }

      if (booking.status === 'REQUESTED') {
        const started = await store.transitionBooking({
          bookingId,
          actorUserId: actor.id,
          fromStatus: 'REQUESTED',
          toStatus: 'DISPATCHING',
          expectedVersion: booking.version,
          eventType: 'DISPATCH_STARTED',
          payload: { fromStatus: 'REQUESTED', toStatus: 'DISPATCHING' },
        });
        if (!started) throw new AppError(409, 'BOOKING_CONFLICT', 'Booking changed before assignment');
        booking = started.booking;
      }

      const result = await store.adminAssignBooking({
        bookingId,
        partnerUserId,
        adminUserId: actor.id,
        fromStatus: booking.status,
        expectedVersion: booking.version,
        reason,
        eventType: booking.partnerUserId ? 'BOOKING_REASSIGNED' : 'BOOKING_ASSIGNED',
        audit: assignmentAudit(meta, 'BOOKING_ASSIGNED', bookingId, partnerUserId, booking.partnerUserId),
        maxActiveJobs: config.maxActiveJobs,
      });
      if (!result) throw new AppError(409, 'BOOKING_CONFLICT', 'Booking changed during assignment');
      return result.booking;
    },

    async reassign(actor, bookingId, partnerUserId, reason, meta, expectedVersion) {
      requireAdmin(actor);
      const booking = await loadBooking(bookingId);
      if (expectedVersion !== undefined && expectedVersion !== booking.version) {
        throw new AppError(409, 'BOOKING_VERSION_CONFLICT', 'Booking has changed; retry');
      }
      if (!['PARTNER_ASSIGNED', 'PARTNER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED'].includes(booking.status)) {
        throw new AppError(409, 'INVALID_ASSIGNMENT_STATE', 'Booking cannot be reassigned in its current state');
      }
      if (!booking.partnerUserId) {
        throw new AppError(409, 'BOOKING_NOT_ASSIGNED', 'Booking has no assigned partner');
      }
      if (booking.partnerUserId === partnerUserId) {
        throw new AppError(409, 'BOOKING_ALREADY_ASSIGNED', 'Partner is already assigned to this booking');
      }

      const categoryCode = await bookingCategoryCode(booking);
      const eligible = await store.listDispatchCandidates({
        categoryCode,
        city: booking.serviceCity,
        state: booking.serviceState,
        maxActiveJobs: config.maxActiveJobs,
        onlineOnly: false,
        partnerId: partnerUserId,
        limit: 1,
      });
      if (eligible.length === 0) {
        throw new AppError(
          400,
          'PARTNER_NOT_ELIGIBLE',
          'Partner is not approved, verified for this skill, in the service city/zone, or has capacity',
        );
      }

      const result = await store.adminAssignBooking({
        bookingId,
        partnerUserId,
        adminUserId: actor.id,
        fromStatus: booking.status,
        expectedVersion: booking.version,
        reason,
        eventType: 'BOOKING_REASSIGNED',
        audit: assignmentAudit(
          meta,
          'BOOKING_REASSIGNED',
          bookingId,
          partnerUserId,
          booking.partnerUserId,
        ),
        maxActiveJobs: config.maxActiveJobs,
      });
      if (!result) throw new AppError(409, 'BOOKING_CONFLICT', 'Booking changed during reassignment');
      return result.booking;
    },

    async getAvailability(actor) {
      requirePartner(actor);
      return store.getPartnerAvailability(actor.id);
    },

    async setAvailability(actor, input) {
      requirePartner(actor);
      const profile = await store.getPartner(actor.id);
      if (!profile) throw new AppError(404, 'PARTNER_NOT_FOUND', 'Partner profile not found');
      if (profile.status === 'SUSPENDED') {
        throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This partner account is suspended');
      }
      return store.setPartnerAvailability(actor.id, input);
    },

    async getZoneIds(actor) {
      requirePartner(actor);
      return store.listPartnerZoneIds(actor.id);
    },

    async setZoneIds(actor, zoneIds) {
      requirePartner(actor);
      const profile = await store.getPartner(actor.id);
      if (!profile) throw new AppError(404, 'PARTNER_NOT_FOUND', 'Partner profile not found');
      if (!profile.serviceCityId) {
        throw new AppError(400, 'SERVICE_CITY_REQUIRED', 'Partner has no service city');
      }

      const zones = await store.listZones(profile.serviceCityId, true);
      const available = new Map(zones.map((zone: Zone) => [zone.id, zone]));
      if (zoneIds.some((zoneId) => !available.has(zoneId))) {
        throw new AppError(
          400,
          'INVALID_SERVICE_ZONE',
          'One or more zones are not enabled zones in the partner’s service city',
        );
      }
      return store.setPartnerZoneIds(actor.id, [...new Set(zoneIds)]);
    },
  };
}
