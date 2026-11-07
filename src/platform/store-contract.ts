import type {
  AcceptOfferResult,
  Address,
  AdminAssignBookingInput,
  AuditEntry,
  AuditListFilter,
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
  TransitionBookingResult as BookingTransitionResult,
  TransitionBookingInput,
  UpsertPushTokenInput,
  UpdateAddressInput,
  UpsertPartnerInput,
  VerifyMediaInput,
  Zone,
} from './types';

export interface PlatformStore {
  listCities(enabledOnly: boolean): Promise<City[]>;
  getCity(cityId: string): Promise<City | null>;
  setCityEnabled(cityId: string, enabled: boolean, audit: AuditEntry): Promise<City | null>;

  listZones(cityId: string, enabledOnly: boolean): Promise<Zone[]>;
  createZone(input: CreateZoneInput, audit: AuditEntry): Promise<Zone>;

  listCategories(enabledOnly: boolean): Promise<Category[]>;
  getCategoriesByCodes(codes: string[]): Promise<Category[]>;
  createCategory(input: CreateCategoryInput, audit: AuditEntry): Promise<Category>;

  listItems(categoryId: string | undefined, enabledOnly: boolean): Promise<ServiceItem[]>;
  getServiceItem(itemId: string): Promise<ServiceItem | null>;
  createItem(input: CreateItemInput, audit: AuditEntry): Promise<ServiceItem>;

  listAddresses(userId: string): Promise<Address[]>;
  getAddress(addressId: string, userId: string): Promise<Address | null>;
  createAddress(input: CreateAddressInput & { userId: string }): Promise<Address>;
  updateAddress(
    addressId: string,
    userId: string,
    input: UpdateAddressInput,
  ): Promise<Address | null>;
  deleteAddress(addressId: string, userId: string): Promise<boolean>;

  upsertPartner(input: UpsertPartnerInput): Promise<PartnerProfile>;
  getPartner(userId: string): Promise<PartnerProfile | null>;
  listPartners(filter: PartnerListFilter): Promise<Page<PartnerSummary>>;
  getPartnerAvailability(userId: string): Promise<PartnerAvailability | null>;
  setPartnerAvailability(
    userId: string,
    input: SetPartnerAvailabilityInput,
  ): Promise<PartnerAvailability>;
  listPartnerZoneIds(userId: string): Promise<string[]>;
  setPartnerZoneIds(userId: string, zoneIds: string[]): Promise<string[]>;
  approvePartner(
    userId: string,
    adminUserId: string,
    verifiedAt: Date,
    verifySkills: boolean,
    audit: AuditEntry,
  ): Promise<PartnerProfile | null>;
  suspendPartner(
    userId: string,
    adminUserId: string,
    reason: string,
    audit: AuditEntry,
  ): Promise<PartnerProfile | null>;

  listAuditLogs(filter: AuditListFilter): Promise<Page<AuditLog>>;

  createBooking(input: CreateBookingInput, event: BookingEventInput): Promise<CreateBookingResult>;
  getIdempotency(actorUserId: string, key: string): Promise<IdempotencyRecord | null>;
  getBooking(bookingId: string): Promise<Booking | null>;
  listBookingEvents(bookingId: string, afterSequence: number): Promise<BookingEvent[]>;
  transitionBooking(input: TransitionBookingInput): Promise<BookingTransitionResult | null>;

  listDispatchCandidates(query: DispatchCandidateQuery): Promise<DispatchCandidate[]>;
  listDispatchAttempts(bookingId: string): Promise<DispatchAttempt[]>;
  createDispatchAttempt(input: CreateDispatchAttemptInput): Promise<CreateDispatchAttemptResult>;
  getDispatchOffer(offerId: string): Promise<DispatchOffer | null>;
  listDispatchOffersForBooking(bookingId: string): Promise<DispatchOffer[]>;
  listPartnerOffers(partnerUserId: string, now: Date): Promise<PartnerOffer[]>;
  acceptDispatchOffer(
    offerId: string,
    partnerUserId: string,
    now: Date,
    maxActiveJobs: number,
  ): Promise<AcceptOfferResult>;
  rejectDispatchOffer(
    offerId: string,
    partnerUserId: string,
    now: Date,
  ): Promise<RejectOfferResult>;
  expireDueOffers(now: Date, limit: number): Promise<string[]>;
  cancelPendingOffers(bookingId: string): Promise<void>;
  adminAssignBooking(input: AdminAssignBookingInput): Promise<BookingTransitionResult | null>;

  createMediaAsset(input: CreateMediaAssetInput): Promise<MediaAsset>;
  getMediaAsset(publicId: string, ownerUserId: string): Promise<MediaAsset | null>;
  markMediaVerified(
    publicId: string,
    ownerUserId: string,
    input: VerifyMediaInput,
  ): Promise<MediaAsset | null>;

  claimOutboxEvents(now: Date, limit: number, bookingId?: string): Promise<OutboxEvent[]>;
  getOutboxEvent(outboxId: string): Promise<OutboxEvent | null>;
  markOutboxProcessed(ids: string[], now: Date): Promise<void>;
  markOutboxRetry(ids: string[], now: Date, availableAt: Date, error: string): Promise<void>;

  upsertPushToken(input: UpsertPushTokenInput): Promise<PushToken>;
  getPushToken(pushTokenId: string): Promise<PushToken | null>;
  listPushTokens(userId: string): Promise<PushToken[]>;
  deactivatePushToken(pushTokenId: string, userId: string): Promise<boolean>;
  deactivatePushTokenByValue(expoPushToken: string, now: Date): Promise<void>;
  activePushTokensForUsers(userIds: string[]): Promise<PushToken[]>;

  createNotificationDeliveries(inputs: CreateDeliveryInput[]): Promise<NotificationDelivery[]>;
  updateNotificationDelivery(id: string, patch: DeliveryPatch, now: Date): Promise<void>;
  listDeliveriesByOutboxEvent(outboxEventId: string): Promise<NotificationDelivery[]>;
  listDueDeliveries(now: Date, limit: number): Promise<NotificationDelivery[]>;
  listDeliveriesForReceipts(now: Date, olderThanMs: number, limit: number): Promise<NotificationDelivery[]>;
}
