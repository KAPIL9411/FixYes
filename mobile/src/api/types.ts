export type AppRole = 'CUSTOMER' | 'PARTNER' | 'ADMIN';

export type PartnerStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type BookingStatus =
  | 'REQUESTED'
  | 'DISPATCHING'
  | 'PARTNER_ASSIGNED'
  | 'PARTNER_ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETION_PENDING'
  | 'COMPLETED'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_PARTNER'
  | 'CANCELLED_BY_ADMIN'
  | 'NO_PARTNER_AVAILABLE'
  | 'DISPUTED';

export interface AuthUser {
  id: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  roles: AppRole[];
}

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

export interface AddressInput {
  label?: string | null;
  addressLine: string;
  locality?: string | null;
  city: string;
  state: string;
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

export interface BookingSummary extends Booking {
  serviceItemName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  partnerDisplayName: string | null;
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

export interface PartnerProfile {
  userId: string;
  displayName: string;
  email: string | null;
  status: PartnerStatus;
  serviceCityId: string | null;
  cityName: string | null;
  bio: string | null;
  verifiedAt: string | null;
  skills: { categoryCode: string; verified: boolean }[];
  createdAt: string;
  updatedAt: string;
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

export interface PartnerOffer {
  id: string;
  bookingId: string;
  partnerUserId: string;
  status: string;
  score: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  bookingStatus: BookingStatus;
  serviceCity: string;
  serviceItemName: string;
  quotedTotal: string | null;
  scheduledAt: string | null;
}

export interface RealtimeTicket {
  ticket: string;
  expiresAt: string;
  websocketUrl: string;
  protocol: string;
  schemaVersion: number;
}

export interface FixyesApi {
  getSessionUser(): Promise<AuthUser | null>;
  beginGoogleSignIn(): Promise<string>;
  signInWithGoogle(credential: string, nonce: string): Promise<AuthUser>;
  signOut(): Promise<void>;

  getCities(): Promise<City[]>;
  getCategories(): Promise<Category[]>;
  getItems(categoryId?: string): Promise<ServiceItem[]>;
  getZones(cityId: string): Promise<Zone[]>;

  listAddresses(): Promise<Address[]>;
  createAddress(input: AddressInput): Promise<Address>;
  updateAddress(id: string, input: Partial<AddressInput>): Promise<Address>;
  deleteAddress(id: string): Promise<void>;

  listBookings(): Promise<BookingSummary[]>;
  getBooking(id: string): Promise<BookingSummary>;
  getBookingEvents(id: string, afterSequence?: number): Promise<BookingEvent[]>;
  createBooking(
    input: { serviceItemId: string; addressId: string; scheduledAt?: string },
    idempotencyKey: string,
  ): Promise<BookingSummary>;
  cancelBooking(id: string, reason?: string, expectedVersion?: number): Promise<BookingSummary>;
  completeBooking(id: string, expectedVersion?: number): Promise<BookingSummary>;

  getPartnerProfile(): Promise<PartnerProfile | null>;
  onboardPartner(input: {
    serviceCityId: string;
    bio?: string;
    skills: string[];
  }): Promise<PartnerProfile>;
  getAvailability(): Promise<PartnerAvailability>;
  setAvailability(input: { isOnline: boolean }): Promise<PartnerAvailability>;
  getPartnerZones(): Promise<string[]>;
  setPartnerZones(ids: string[]): Promise<string[]>;
  listOffers(): Promise<PartnerOffer[]>;
  acceptOffer(id: string): Promise<BookingSummary>;
  rejectOffer(id: string): Promise<void>;
  listPartnerJobs(): Promise<BookingSummary[]>;
  setPartnerJobStatus(id: string, status: BookingStatus, reason?: string): Promise<BookingSummary>;

  getRealtimeTicket?(id: string): Promise<RealtimeTicket | null>;
}
