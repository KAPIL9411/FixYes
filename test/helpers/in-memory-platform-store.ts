import type { BookingStatus, PartnerStatus } from '../../src/db/schema';
import { toRealtimeEnvelope } from '../../src/domain/realtime';
import { decodeCursor } from '../../src/lib/cursor';
import { AppError } from '../../src/lib/errors';
import type { PlatformStore } from '../../src/platform/store-contract';
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
  CreateDeliveryInput,
  DeliveryPatch,
  DispatchAttempt,
  DispatchCandidate,
  DispatchCandidateQuery,
  DispatchOffer,
  IdempotencyRecord,
  MediaAsset,
  NotificationDelivery,
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
  SetPartnerAvailabilityInput,
  TransitionBookingInput,
  TransitionBookingResult,
  UpdateAddressInput,
  UpsertPartnerInput,
  UpsertPushTokenInput,
  VerifyMediaInput,
  Zone,
} from '../../src/platform/types';

const BASE_TIME = Date.UTC(2026, 0, 1);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTBOX_CLAIM_LEASE_MS = 5 * 60 * 1000;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryPlatformStore implements PlatformStore {
  cities: City[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ahmedabad',
      state: 'Gujarat',
      countryCode: 'IN',
      enabled: true,
    },
    {
      id: '11111111-1111-4111-8111-222222222222',
      name: 'Surat',
      state: 'Gujarat',
      countryCode: 'IN',
      enabled: false,
    },
  ];

  zones: Zone[] = [
    {
      id: '11111111-1111-4111-8111-333333333333',
      cityId: '11111111-1111-4111-8111-111111111111',
      name: 'West Ahmedabad',
      boundaryGeojson: null,
      enabled: true,
    },
  ];

  categories: Category[] = [
    {
      id: '22222222-2222-4222-8222-111111111111',
      code: 'plumbing',
      name: 'Plumbing',
      enabled: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      code: 'electrical',
      name: 'Electrical',
      enabled: true,
    },
    {
      id: '22222222-2222-4222-8222-333333333333',
      code: 'retired',
      name: 'Retired service',
      enabled: false,
    },
  ];

  items: ServiceItem[] = [
    {
      id: '44444444-4444-4444-8444-111111111111',
      categoryId: '22222222-2222-4222-8222-111111111111',
      name: 'Tap repair',
      description: null,
      basePrice: '299.00',
      currency: 'INR',
      enabled: true,
    },
  ];

  partners = new Map<string, PartnerProfile>();
  addresses: Address[] = [];
  bookings = new Map<string, Booking>();
  bookingEvents = new Map<string, BookingEvent[]>();
  idempotency = new Map<string, { requestHash: string; bookingId: string; expiresAt: Date }>();
  auditLogs: AuditLog[] = [];
  media = new Map<string, MediaAsset>();
  availability = new Map<string, PartnerAvailability>();
  partnerZones = new Map<string, string[]>();
  dispatchOffers = new Map<string, DispatchOffer>();
  dispatchAttempts: DispatchAttempt[] = [];
  outbox: OutboxEvent[] = [];
  pushTokens: PushToken[] = [];
  deliveries: NotificationDelivery[] = [];
  private auditSequence = 0;
  private eventSequence = 0;
  private attemptSequence = 0;
  private outboxSequence = 0;
  private deliverySequence = 0;

  private record(audit: AuditEntry): void {
    const sequence = ++this.auditSequence;
    this.auditLogs.push({
      id: String(sequence).padStart(8, '0'),
      adminUserId: audit.adminUserId,
      action: audit.action,
      targetType: audit.targetType,
      targetId: audit.targetId,
      reason: audit.reason,
      metadata: clone(audit.metadata),
      requestId: audit.requestId,
      createdAt: new Date(BASE_TIME + sequence * 1000).toISOString(),
    });
  }

  async listCities(enabledOnly: boolean): Promise<City[]> {
    return clone(this.cities.filter((city) => !enabledOnly || city.enabled));
  }

  async getCity(cityId: string): Promise<City | null> {
    return clone(this.cities.find((city) => city.id === cityId) ?? null);
  }

  async setCityEnabled(cityId: string, enabled: boolean, audit: AuditEntry): Promise<City | null> {
    const city = this.cities.find((entry) => entry.id === cityId);
    if (!city) return null;
    city.enabled = enabled;
    this.record(audit);
    return clone(city);
  }

  async listZones(cityId: string, enabledOnly: boolean): Promise<Zone[]> {
    return clone(
      this.zones.filter((zone) => zone.cityId === cityId && (!enabledOnly || zone.enabled)),
    );
  }

  async createZone(input: CreateZoneInput, audit: AuditEntry): Promise<Zone> {
    const zone: Zone = {
      id: crypto.randomUUID(),
      cityId: input.cityId,
      name: input.name,
      boundaryGeojson: clone(input.boundaryGeojson),
      enabled: input.enabled,
    };
    this.zones.push(zone);
    this.record(audit);
    return clone(zone);
  }

  async listCategories(enabledOnly: boolean): Promise<Category[]> {
    return clone(this.categories.filter((category) => !enabledOnly || category.enabled));
  }

  async getCategoriesByCodes(codes: string[]): Promise<Category[]> {
    return clone(this.categories.filter((category) => codes.includes(category.code)));
  }

  async createCategory(input: CreateCategoryInput, audit: AuditEntry): Promise<Category> {
    if (this.categories.some((category) => category.code === input.code)) {
      throw Object.assign(new Error('duplicate category'), { code: '23505' });
    }
    const category: Category = { id: crypto.randomUUID(), ...input };
    this.categories.push(category);
    this.record(audit);
    return clone(category);
  }

  async listItems(categoryId: string | undefined, enabledOnly: boolean): Promise<ServiceItem[]> {
    return clone(
      this.items.filter(
        (item) =>
          (!categoryId || item.categoryId === categoryId) && (!enabledOnly || item.enabled),
      ),
    );
  }

  async getServiceItem(itemId: string): Promise<ServiceItem | null> {
    return clone(this.items.find((item) => item.id === itemId) ?? null);
  }

  async createItem(input: CreateItemInput, audit: AuditEntry): Promise<ServiceItem> {
    const item: ServiceItem = {
      id: crypto.randomUUID(),
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      basePrice: input.basePrice,
      currency: 'INR',
      enabled: input.enabled,
    };
    this.items.push(item);
    this.record(audit);
    return clone(item);
  }

  async listAddresses(userId: string): Promise<Address[]> {
    return clone(
      this.addresses
        .filter((address) => address.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async getAddress(addressId: string, userId: string): Promise<Address | null> {
    return clone(
      this.addresses.find((address) => address.id === addressId && address.userId === userId) ??
        null,
    );
  }

  async createAddress(input: CreateAddressInput & { userId: string }): Promise<Address> {
    const address: Address = {
      id: crypto.randomUUID(),
      userId: input.userId,
      label: input.label,
      addressLine: input.addressLine,
      locality: input.locality,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      latitude: input.latitude === null ? null : input.latitude.toFixed(6),
      longitude: input.longitude === null ? null : input.longitude.toFixed(6),
      createdAt: new Date().toISOString(),
    };
    this.addresses.push(address);
    return clone(address);
  }

  async updateAddress(
    addressId: string,
    userId: string,
    input: UpdateAddressInput,
  ): Promise<Address | null> {
    const address = this.addresses.find(
      (entry) => entry.id === addressId && entry.userId === userId,
    );
    if (!address) return null;
    if (input.label !== undefined) address.label = input.label;
    if (input.addressLine !== undefined) address.addressLine = input.addressLine;
    if (input.locality !== undefined) address.locality = input.locality;
    if (input.city !== undefined) address.city = input.city;
    if (input.state !== undefined) address.state = input.state;
    if (input.postalCode !== undefined) address.postalCode = input.postalCode;
    if (input.latitude !== undefined) {
      address.latitude = input.latitude === null ? null : input.latitude.toFixed(6);
    }
    if (input.longitude !== undefined) {
      address.longitude = input.longitude === null ? null : input.longitude.toFixed(6);
    }
    return clone(address);
  }

  async deleteAddress(addressId: string, userId: string): Promise<boolean> {
    const index = this.addresses.findIndex(
      (entry) => entry.id === addressId && entry.userId === userId,
    );
    if (index === -1) return false;
    if ([...this.bookings.values()].some((booking) => booking.addressId === addressId)) {
      throw Object.assign(new Error('address is referenced'), { code: '23503' });
    }
    this.addresses.splice(index, 1);
    return true;
  }

  async upsertPartner(input: UpsertPartnerInput): Promise<PartnerProfile> {
    const existing = this.partners.get(input.userId);
    const city = this.cities.find((entry) => entry.id === input.serviceCityId) ?? null;
    const profile: PartnerProfile = {
      userId: input.userId,
      displayName: existing?.displayName ?? `Partner ${input.userId.slice(0, 8)}`,
      email: existing?.email ?? null,
      status: input.status,
      serviceCityId: input.serviceCityId,
      cityName: city?.name ?? null,
      bio: input.bio,
      verifiedAt: existing?.verifiedAt ?? null,
      skills: input.skills.map((categoryCode) => ({
        categoryCode,
        verified: false,
      })),
      createdAt: existing?.createdAt ?? new Date(BASE_TIME).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.partners.set(input.userId, profile);
    if (!this.availability.has(input.userId)) {
      const now = new Date().toISOString();
      this.availability.set(input.userId, {
        partnerUserId: input.userId,
        isOnline: false,
        activeJobCount: 0,
        latitude: null,
        longitude: null,
        locationUpdatedAt: null,
        updatedAt: now,
      });
    }
    return clone(profile);
  }

  async getPartner(userId: string): Promise<PartnerProfile | null> {
    return clone(this.partners.get(userId) ?? null);
  }

  async getPartnerAvailability(userId: string): Promise<PartnerAvailability | null> {
    return clone(this.availability.get(userId) ?? null);
  }

  async setPartnerAvailability(
    userId: string,
    input: SetPartnerAvailabilityInput,
  ): Promise<PartnerAvailability> {
    const existing = this.availability.get(userId);
    const now = new Date().toISOString();
    const availability: PartnerAvailability = {
      partnerUserId: userId,
      isOnline: input.isOnline,
      activeJobCount: existing?.activeJobCount ?? 0,
      latitude: input.latitude === null ? null : input.latitude.toFixed(6),
      longitude: input.longitude === null ? null : input.longitude.toFixed(6),
      locationUpdatedAt: now,
      updatedAt: now,
    };
    this.availability.set(userId, availability);
    return clone(availability);
  }

  async listPartnerZoneIds(userId: string): Promise<string[]> {
    return clone(this.partnerZones.get(userId) ?? []);
  }

  async setPartnerZoneIds(userId: string, zoneIds: string[]): Promise<string[]> {
    this.partnerZones.set(userId, [...new Set(zoneIds)]);
    return clone([...new Set(zoneIds)]);
  }

  async listDispatchCandidates(query: DispatchCandidateQuery): Promise<DispatchCandidate[]> {
    const city = this.cities.find(
      (entry) =>
        entry.name.toLowerCase() === query.city.toLowerCase() &&
        entry.state.toLowerCase() === query.state.toLowerCase() &&
        entry.enabled,
    );
    if (!city) return [];

    return clone(
      [...this.partners.values()]
        .filter((partner) => {
          if (partner.status !== 'APPROVED') return false;
          if (partner.serviceCityId !== city.id) return false;
          if (!partner.skills.some((skill) => skill.categoryCode === query.categoryCode && skill.verified)) {
            return false;
          }
          if (query.partnerId && partner.userId !== query.partnerId) return false;
          const availability = this.availability.get(partner.userId);
          if (!availability) return false;
          if (query.onlineOnly && !availability.isOnline) return false;
          if (availability.activeJobCount >= query.maxActiveJobs) return false;
          const zoneIds = this.partnerZones.get(partner.userId) ?? [];
          return zoneIds.some((zoneId) => {
            const zone = this.zones.find((entry) => entry.id === zoneId);
            return Boolean(zone && zone.enabled && zone.cityId === city.id);
          });
        })
        .slice(0, query.limit)
        .map((partner) => {
          const availability = this.availability.get(partner.userId);
          return {
            userId: partner.userId,
            displayName: partner.displayName,
            activeJobCount: availability?.activeJobCount ?? 0,
            latitude: availability?.latitude ?? null,
            longitude: availability?.longitude ?? null,
          };
        }),
    );
  }

  async listDispatchAttempts(bookingId: string): Promise<DispatchAttempt[]> {
    return clone(
      this.dispatchAttempts
        .filter((attempt) => attempt.bookingId === bookingId)
        .sort((a, b) => a.attemptNumber - b.attemptNumber),
    );
  }

  async createDispatchAttempt(
    input: CreateDispatchAttemptInput,
  ): Promise<CreateDispatchAttemptResult> {
    const attemptNumber =
      Math.max(0, ...this.dispatchAttempts.filter((a) => a.bookingId === input.bookingId).map((a) => a.attemptNumber)) + 1;
    const attempt: DispatchAttempt = {
      id: `attempt-${++this.attemptSequence}`,
      bookingId: input.bookingId,
      attemptNumber,
      candidateCount: input.candidateCount,
      outcome: input.outcome,
      createdAt: new Date().toISOString(),
    };
    this.dispatchAttempts.push(attempt);

    let offer: DispatchOffer | null = null;
    if (input.partnerUserId && input.expiresAt) {
      if (
        [...this.dispatchOffers.values()].some(
          (entry) => entry.bookingId === input.bookingId && entry.status === 'PENDING',
        )
      ) {
        throw Object.assign(new Error('duplicate pending offer'), { code: '23505' });
      }
      offer = {
        id: crypto.randomUUID(),
        bookingId: input.bookingId,
        partnerUserId: input.partnerUserId,
        status: 'PENDING',
        score: input.score ?? null,
        expiresAt: input.expiresAt.toISOString(),
        respondedAt: null,
        createdAt: new Date().toISOString(),
      };
      this.dispatchOffers.set(offer.id, offer);
      this.outbox.push({
        id: `outbox-${++this.outboxSequence}`,
        eventType: 'DISPATCH_OFFER_CREATED',
        aggregateId: input.bookingId,
        payload: {
          type: 'OFFER_CREATED',
          bookingId: input.bookingId,
          offerId: offer.id,
          partnerUserId: offer.partnerUserId,
          expiresAt: offer.expiresAt,
        },
        attempts: 0,
        availableAt: new Date().toISOString(),
        processedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
      });
    }
    return { attempt: clone(attempt), offer: clone(offer) };
  }

  async getDispatchOffer(offerId: string): Promise<DispatchOffer | null> {
    return clone(this.dispatchOffers.get(offerId) ?? null);
  }

  async listDispatchOffersForBooking(bookingId: string): Promise<DispatchOffer[]> {
    return clone(
      [...this.dispatchOffers.values()]
        .filter((offer) => offer.bookingId === bookingId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  async listPartnerOffers(partnerUserId: string, now: Date): Promise<PartnerOffer[]> {
    return clone(
      [...this.dispatchOffers.values()]
        .filter(
          (offer) =>
            offer.partnerUserId === partnerUserId &&
            offer.status === 'PENDING' &&
            new Date(offer.expiresAt).getTime() > now.getTime(),
        )
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
        .flatMap((offer) => {
          const booking = this.bookings.get(offer.bookingId);
          if (!booking) return [];
          const item = this.items.find((entry) => entry.id === booking.serviceItemId);
          return [
            {
              ...offer,
              bookingStatus: booking.status,
              serviceCity: booking.serviceCity,
              serviceItemName: item?.name ?? 'Service',
              quotedTotal: booking.quotedTotal,
              scheduledAt: booking.scheduledAt,
            },
          ];
        }),
    );
  }

  async acceptDispatchOffer(
    offerId: string,
    partnerUserId: string,
    now: Date,
    maxActiveJobs: number,
  ): Promise<AcceptOfferResult> {
    const offer = this.dispatchOffers.get(offerId);
    if (!offer) return { outcome: 'NOT_FOUND' };
    if (offer.partnerUserId !== partnerUserId) return { outcome: 'FORBIDDEN' };
    const booking = this.bookings.get(offer.bookingId);

    if (offer.status === 'ACCEPTED') {
      if (booking?.partnerUserId === partnerUserId) {
        return { outcome: 'ALREADY_ACCEPTED', booking: clone(booking), offer: clone(offer) };
      }
      return { outcome: 'NOT_PENDING' };
    }
    if (offer.status !== 'PENDING') return { outcome: 'NOT_PENDING' };
    if (new Date(offer.expiresAt).getTime() <= now.getTime()) {
      offer.status = 'EXPIRED';
      offer.respondedAt = now.toISOString();
      return { outcome: 'EXPIRED' };
    }
    if (!booking || booking.status !== 'DISPATCHING' || booking.partnerUserId !== null) {
      return { outcome: 'BOOKING_CONFLICT' };
    }

    const availability = this.availability.get(partnerUserId);
    if (!availability || availability.activeJobCount >= maxActiveJobs) {
      offer.status = 'CANCELLED';
      offer.respondedAt = now.toISOString();
      return { outcome: 'WORKLOAD_FULL' };
    }

    availability.activeJobCount += 1;
    availability.updatedAt = now.toISOString();
    offer.status = 'ACCEPTED';
    offer.respondedAt = now.toISOString();
    booking.partnerUserId = partnerUserId;
    booking.status = 'PARTNER_ASSIGNED';
    booking.version += 1;
    booking.updatedAt = now.toISOString();
    const event = this.appendEvent(booking.id, booking.version, {
      eventType: 'PARTNER_ASSIGNED',
      actorUserId: partnerUserId,
      payload: {
        fromStatus: 'DISPATCHING',
        toStatus: 'PARTNER_ASSIGNED',
        partnerUserId,
        offerId: offer.id,
      },
    });
    return {
      outcome: 'ACCEPTED',
      booking: clone(booking),
      event: clone(event),
      offer: clone(offer),
    };
  }

  async rejectDispatchOffer(
    offerId: string,
    partnerUserId: string,
    now: Date,
  ): Promise<RejectOfferResult> {
    const offer = this.dispatchOffers.get(offerId);
    if (!offer) return { outcome: 'NOT_FOUND' };
    if (offer.partnerUserId !== partnerUserId) return { outcome: 'FORBIDDEN' };
    if (offer.status === 'REJECTED') {
      return { outcome: 'ALREADY_REJECTED', bookingId: offer.bookingId, offer: clone(offer) };
    }
    if (offer.status !== 'PENDING') return { outcome: 'NOT_PENDING' };
    if (new Date(offer.expiresAt).getTime() <= now.getTime()) {
      offer.status = 'EXPIRED';
      offer.respondedAt = now.toISOString();
      return { outcome: 'EXPIRED' };
    }
    offer.status = 'REJECTED';
    offer.respondedAt = now.toISOString();
    return { outcome: 'REJECTED', bookingId: offer.bookingId, offer: clone(offer) };
  }

  async expireDueOffers(now: Date, limit: number): Promise<string[]> {
    const bookingIds: string[] = [];
    for (const offer of this.dispatchOffers.values()) {
      if (bookingIds.length >= limit) break;
      if (offer.status === 'PENDING' && new Date(offer.expiresAt).getTime() <= now.getTime()) {
        offer.status = 'EXPIRED';
        offer.respondedAt = now.toISOString();
        bookingIds.push(offer.bookingId);
      }
    }
    return bookingIds;
  }

  async cancelPendingOffers(bookingId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const offer of this.dispatchOffers.values()) {
      if (offer.bookingId === bookingId && offer.status === 'PENDING') {
        offer.status = 'CANCELLED';
        offer.respondedAt = now;
      }
    }
  }

  async adminAssignBooking(input: AdminAssignBookingInput) {
    const booking = this.bookings.get(input.bookingId);
    if (
      !booking ||
      booking.status !== input.fromStatus ||
      booking.version !== input.expectedVersion
    ) {
      return null;
    }

    const previousPartnerUserId = booking.partnerUserId;
    if (previousPartnerUserId !== input.partnerUserId) {
      const nextAvailability = this.availability.get(input.partnerUserId);
      if (!nextAvailability || nextAvailability.activeJobCount >= input.maxActiveJobs) return null;
      nextAvailability.activeJobCount += 1;
      nextAvailability.updatedAt = new Date().toISOString();
      if (previousPartnerUserId) {
        const previous = this.availability.get(previousPartnerUserId);
        if (previous) previous.activeJobCount = Math.max(0, previous.activeJobCount - 1);
      }
    }

    await this.cancelPendingOffers(booking.id);
    booking.partnerUserId = input.partnerUserId;
    booking.status = 'PARTNER_ASSIGNED';
    booking.version += 1;
    booking.updatedAt = new Date().toISOString();
    const event = this.appendEvent(booking.id, booking.version, {
      eventType: input.eventType,
      actorUserId: input.adminUserId,
      payload: {
        fromStatus: input.fromStatus,
        toStatus: 'PARTNER_ASSIGNED',
        partnerUserId: input.partnerUserId,
        previousPartnerUserId,
        reason: input.reason,
        adminOverride: true,
      },
    });
    this.record(input.audit);
    return { booking: clone(booking), event: clone(event) };
  }

  async listPartners(filter: PartnerListFilter): Promise<Page<PartnerSummary>> {
    if (filter.cursor) {
      const cursor = decodeCursor(filter.cursor);
      if (!cursor || !UUID_PATTERN.test(cursor.id)) {
        throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor');
      }
    }
    const items = [...this.partners.values()]
      .filter((partner) => !filter.status || partner.status === filter.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((partner) => ({
        userId: partner.userId,
        displayName: partner.displayName,
        email: partner.email,
        status: partner.status,
        cityName: partner.cityName,
        skillCount: partner.skills.length,
        verifiedSkillCount: partner.skills.filter((skill) => skill.verified).length,
        createdAt: partner.createdAt,
      }));
    return { items: clone(items.slice(0, filter.limit)), nextCursor: null };
  }

  async approvePartner(
    userId: string,
    adminUserId: string,
    verifiedAt: Date,
    verifySkills: boolean,
    audit: AuditEntry,
  ): Promise<PartnerProfile | null> {
    const profile = this.partners.get(userId);
    if (!profile || profile.status !== 'PENDING_REVIEW') return null;
    profile.status = 'APPROVED';
    profile.verifiedAt = verifiedAt.toISOString();
    if (verifySkills) {
      profile.skills = profile.skills.map((skill) => ({ ...skill, verified: true }));
    }
    this.record({ ...audit, adminUserId });
    return clone(profile);
  }

  async suspendPartner(
    userId: string,
    adminUserId: string,
    reason: string,
    audit: AuditEntry,
  ): Promise<PartnerProfile | null> {
    const profile = this.partners.get(userId);
    if (!profile) return null;
    profile.status = 'SUSPENDED';
    const availability = this.availability.get(userId);
    if (availability) availability.isOnline = false;
    this.record({ ...audit, adminUserId, reason });
    return clone(profile);
  }

  async listAuditLogs(filter: { limit: number; cursor?: string }): Promise<Page<AuditLog>> {
    const items = [...this.auditLogs].reverse().slice(0, filter.limit);
    return { items: clone(items), nextCursor: null };
  }

  async createBooking(input: CreateBookingInput, event: BookingEventInput): Promise<CreateBookingResult> {
    const key = `${input.customerUserId}:${input.idempotencyKey}`;
    const existing = this.idempotency.get(key);
    const now = new Date();
    if (existing && existing.expiresAt.getTime() > now.getTime()) {
      return {
        replayed: true,
        bookingId: existing.bookingId,
        requestHash: existing.requestHash,
      };
    }
    if (existing) this.idempotency.delete(key);

    const booking: Booking = {
      id: crypto.randomUUID(),
      customerUserId: input.customerUserId,
      partnerUserId: null,
      serviceItemId: input.serviceItemId,
      addressId: input.addressId,
      status: 'REQUESTED',
      scheduledAt: input.scheduledAt?.toISOString() ?? null,
      currency: 'INR',
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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.bookings.set(booking.id, booking);
    this.appendEvent(booking.id, 1, event);
    this.idempotency.set(key, {
      requestHash: input.requestHash,
      bookingId: booking.id,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    return { replayed: false, booking: clone(booking) };
  }

  async getIdempotency(actorUserId: string, key: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotency.get(`${actorUserId}:${key}`);
    if (!record) return null;
    return {
      bookingId: record.bookingId,
      requestHash: record.requestHash,
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    return clone(this.bookings.get(bookingId) ?? null);
  }

  async listBookingEvents(bookingId: string, afterSequence: number): Promise<BookingEvent[]> {
    return clone(
      (this.bookingEvents.get(bookingId) ?? [])
        .filter((event) => event.sequence > afterSequence)
        .sort((a, b) => a.sequence - b.sequence),
    );
  }

  async transitionBooking(input: TransitionBookingInput): Promise<TransitionBookingResult | null> {
    const booking = this.bookings.get(input.bookingId);
    if (
      !booking ||
      booking.status !== input.fromStatus ||
      booking.version !== input.expectedVersion
    ) {
      return null;
    }
    booking.status = input.toStatus;
    booking.version += 1;
    booking.updatedAt = new Date().toISOString();
    const event = this.appendEvent(booking.id, booking.version, {
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    if (
      booking.partnerUserId &&
      ['COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_PARTNER', 'CANCELLED_BY_ADMIN'].includes(
        booking.status,
      )
    ) {
      const availability = this.availability.get(booking.partnerUserId);
      if (availability) availability.activeJobCount = Math.max(0, availability.activeJobCount - 1);
    }
    if (
      ['COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_PARTNER', 'CANCELLED_BY_ADMIN', 'NO_PARTNER_AVAILABLE'].includes(
        booking.status,
      )
    ) {
      await this.cancelPendingOffers(booking.id);
    }
    return { booking: clone(booking), event: clone(event) };
  }

  seedBooking(input: {
    customerUserId: string;
    partnerUserId?: string | null;
    status: BookingStatus;
    addressId?: string | null;
    serviceItemId?: string;
  }): Booking {
    const now = new Date().toISOString();
    const booking: Booking = {
      id: crypto.randomUUID(),
      customerUserId: input.customerUserId,
      partnerUserId: input.partnerUserId ?? null,
      serviceItemId: input.serviceItemId ?? this.items[0]?.id ?? crypto.randomUUID(),
      addressId: input.addressId ?? null,
      status: input.status,
      scheduledAt: null,
      currency: 'INR',
      quotedTotal: '299.00',
      version: 1,
      idempotencyKey: `seed-${crypto.randomUUID()}`,
      serviceAddressLine: '12 Test Street',
      serviceLocality: 'Test Locality',
      serviceCity: 'Ahmedabad',
      serviceState: 'Gujarat',
      servicePostalCode: '380001',
      serviceLatitude: null,
      serviceLongitude: null,
      createdAt: now,
      updatedAt: now,
    };
    this.bookings.set(booking.id, booking);
    this.appendEvent(booking.id, 1, {
      eventType: 'BOOKING_CREATED',
      actorUserId: input.customerUserId,
      payload: { status: input.status },
    });
    return clone(booking);
  }

  private appendEvent(bookingId: string, sequence: number, input: BookingEventInput): BookingEvent {
    const event: BookingEvent = {
      id: `event-${++this.eventSequence}`,
      bookingId,
      sequence,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      payload: clone(input.payload),
      createdAt: new Date().toISOString(),
    };
    const events = this.bookingEvents.get(bookingId) ?? [];
    events.push(event);
    this.bookingEvents.set(bookingId, events);
    this.outbox.push({
      id: `outbox-${++this.outboxSequence}`,
      eventType: 'BOOKING_EVENT',
      aggregateId: bookingId,
      payload: clone({
        envelope: toRealtimeEnvelope(event),
        actorUserId: input.actorUserId,
      }) as Record<string, unknown>,
      attempts: 0,
      availableAt: new Date().toISOString(),
      processedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
    return event;
  }

  async createMediaAsset(input: CreateMediaAssetInput): Promise<MediaAsset> {
    const asset: MediaAsset = {
      id: crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      cloudinaryPublicId: input.cloudinaryPublicId,
      resourceType: input.resourceType,
      mediaKind: input.mediaKind,
      format: null,
      bytes: null,
      folder: input.folder,
      verified: false,
    };
    this.media.set(asset.cloudinaryPublicId, asset);
    return clone(asset);
  }

  async getMediaAsset(publicId: string, ownerUserId: string): Promise<MediaAsset | null> {
    const asset = this.media.get(publicId);
    return asset && asset.ownerUserId === ownerUserId ? clone(asset) : null;
  }

  async markMediaVerified(
    publicId: string,
    ownerUserId: string,
    input: VerifyMediaInput,
  ): Promise<MediaAsset | null> {
    const asset = this.media.get(publicId);
    if (!asset || asset.ownerUserId !== ownerUserId) return null;
    asset.verified = true;
    asset.format = input.format;
    asset.bytes = input.bytes;
    return clone(asset);
  }

  async claimOutboxEvents(now: Date, limit: number, bookingId?: string): Promise<OutboxEvent[]> {
    const due = this.outbox.filter(
      (event) =>
        !event.processedAt &&
        new Date(event.availableAt).getTime() <= now.getTime() &&
        (!bookingId || event.aggregateId === bookingId),
    );
    const claimed = due.slice(0, limit);
    for (const event of claimed) {
      event.attempts += 1;
      event.availableAt = new Date(now.getTime() + OUTBOX_CLAIM_LEASE_MS).toISOString();
    }
    return clone(claimed);
  }

  async getOutboxEvent(outboxId: string): Promise<OutboxEvent | null> {
    const event = this.outbox.find((entry) => entry.id === outboxId);
    return event ? clone(event) : null;
  }

  async markOutboxProcessed(ids: string[], now: Date): Promise<void> {
    for (const event of this.outbox.filter((entry) => ids.includes(entry.id))) {
      event.processedAt = now.toISOString();
    }
  }

  async markOutboxRetry(
    ids: string[],
    _now: Date,
    availableAt: Date,
    error: string,
  ): Promise<void> {
    for (const event of this.outbox.filter((entry) => ids.includes(entry.id))) {
      event.availableAt = availableAt.toISOString();
      event.lastError = error.slice(0, 500);
    }
  }

  async upsertPushToken(input: UpsertPushTokenInput): Promise<PushToken> {
    const existing = this.pushTokens.find((token) => token.expoPushToken === input.expoPushToken);
    if (existing) {
      existing.userId = input.userId;
      existing.devicePlatform = input.devicePlatform;
      existing.active = true;
      return clone(existing);
    }
    const token: PushToken = {
      id: crypto.randomUUID(),
      userId: input.userId,
      expoPushToken: input.expoPushToken,
      devicePlatform: input.devicePlatform,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.pushTokens.push(token);
    return clone(token);
  }

  async getPushToken(pushTokenId: string): Promise<PushToken | null> {
    const token = this.pushTokens.find((entry) => entry.id === pushTokenId);
    return token ? clone(token) : null;
  }

  async listPushTokens(userId: string): Promise<PushToken[]> {
    return clone(this.pushTokens.filter((token) => token.userId === userId));
  }

  async deactivatePushToken(pushTokenId: string, userId: string): Promise<boolean> {
    const token = this.pushTokens.find(
      (entry) => entry.id === pushTokenId && entry.userId === userId,
    );
    if (!token) return false;
    token.active = false;
    return true;
  }

  async deactivatePushTokenByValue(expoPushToken: string): Promise<void> {
    for (const token of this.pushTokens.filter((entry) => entry.expoPushToken === expoPushToken)) {
      token.active = false;
    }
  }

  async activePushTokensForUsers(userIds: string[]): Promise<PushToken[]> {
    return clone(
      this.pushTokens.filter((token) => token.active && userIds.includes(token.userId)),
    );
  }

  async createNotificationDeliveries(
    inputs: CreateDeliveryInput[],
  ): Promise<NotificationDelivery[]> {
    const created = inputs.map((input) => {
      const now = new Date().toISOString();
      const delivery: NotificationDelivery = {
        id: `delivery-${++this.deliverySequence}`,
        userId: input.userId,
        pushTokenId: input.pushTokenId,
        bookingId: input.bookingId,
        outboxEventId: input.outboxEventId,
        eventType: input.eventType,
        status: 'PENDING',
        expoTicketId: null,
        errorCode: null,
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      };
      this.deliveries.push(delivery);
      return delivery;
    });
    return clone(created);
  }

  async updateNotificationDelivery(
    id: string,
    patch: DeliveryPatch,
    now: Date,
  ): Promise<void> {
    const delivery = this.deliveries.find((entry) => entry.id === id);
    if (!delivery) return;
    if (patch.status !== undefined) delivery.status = patch.status;
    if (patch.expoTicketId !== undefined) delivery.expoTicketId = patch.expoTicketId;
    if (patch.errorCode !== undefined) delivery.errorCode = patch.errorCode;
    if (patch.attempts !== undefined) delivery.attempts = patch.attempts;
    if (patch.nextAttemptAt !== undefined) {
      delivery.nextAttemptAt = patch.nextAttemptAt?.toISOString() ?? null;
    }
    delivery.updatedAt = now.toISOString();
  }

  async listDeliveriesByOutboxEvent(outboxEventId: string): Promise<NotificationDelivery[]> {
    return clone(
      this.deliveries.filter((delivery) => delivery.outboxEventId === outboxEventId),
    );
  }

  async listDueDeliveries(now: Date, limit: number): Promise<NotificationDelivery[]> {
    return clone(
      this.deliveries
        .filter(
          (delivery) =>
            (delivery.status === 'PENDING' || delivery.status === 'FAILED') &&
            delivery.nextAttemptAt !== null &&
            new Date(delivery.nextAttemptAt).getTime() <= now.getTime(),
        )
        .slice(0, limit),
    );
  }

  async listDeliveriesForReceipts(
    now: Date,
    olderThanMs: number,
    limit: number,
  ): Promise<NotificationDelivery[]> {
    return clone(
      this.deliveries
        .filter(
          (delivery) =>
            delivery.status === 'SENT' &&
            delivery.expoTicketId !== null &&
            now.getTime() - new Date(delivery.updatedAt).getTime() >= olderThanMs,
        )
        .slice(0, limit),
    );
  }

  setPartnerStatus(userId: string, status: PartnerStatus): void {
    const profile = this.partners.get(userId);
    if (!profile) throw new Error('MEMORY_PARTNER_MISSING');
    profile.status = status;
  }
}
