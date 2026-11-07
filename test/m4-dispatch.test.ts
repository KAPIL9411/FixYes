import { beforeEach, describe, expect, it } from 'vitest';
import type { GoogleIdentity } from '../src/auth/google-token';
import { createAuthService, type AuthService } from '../src/auth/service';
import { createApp } from '../src/app';
import { haversineKm, rankCandidates } from '../src/domain/dispatch';
import { createAddressService, createBookingService } from '../src/platform/booking-services';
import { createDispatchService, type DispatchService } from '../src/platform/dispatch-services';
import {
  createAuditService,
  createCatalogueService,
  createMediaService,
  createPartnerService,
} from '../src/platform/services';
import type { Address, Booking } from '../src/platform/types';
import { InMemoryAuthRepository } from './helpers/in-memory-auth-repository';
import { InMemoryPlatformStore } from './helpers/in-memory-platform-store';
import { TestClock } from './helpers/test-clock';
import { testEnv } from './helpers/test-env';

const AUDIENCE = 'web-client.apps.googleusercontent.com';
const ITEM_ID = '44444444-4444-4444-8444-111111111111';
const CITY_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '11111111-1111-4111-8111-333333333333';
const CATEGORY_CODE = 'plumbing';

let authRepository: InMemoryAuthRepository;
let authService: AuthService;
let store: InMemoryPlatformStore;
let app: ReturnType<typeof createApp>;
let clock: TestClock;
let dispatchService: DispatchService;
let currentNonce: string;
let identity: GoogleIdentity;

function platformServices() {
  return {
    catalogueService: createCatalogueService(store),
    partnerService: createPartnerService(store),
    auditService: createAuditService(store),
    mediaService: createMediaService({
      store,
      config: { cloudName: 'fixyes-test', apiKey: 'key', apiSecret: 'secret' },
    }),
    addressService: createAddressService(store),
    bookingService: createBookingService(store),
    dispatchService,
  };
}

beforeEach(() => {
  authRepository = new InMemoryAuthRepository();
  currentNonce = '';
  identity = {
    subject: 'google-customer',
    email: 'customer@example.com',
    emailVerified: true,
    name: 'Test Customer',
  };
  authService = createAuthService({
    repository: authRepository,
    audiences: [AUDIENCE],
    verifyGoogleToken: async () => ({ ...identity, nonce: currentNonce }),
  });

  store = new InMemoryPlatformStore();
  clock = new TestClock('2026-01-01T00:00:00.000Z');
  dispatchService = createDispatchService({
    store,
    clock,
    config: { offerTtlMs: 60_000, maxAttempts: 2, maxActiveJobs: 2, candidateLimit: 50 },
  });
  app = createApp({
    authService,
    checkDatabase: async () => true,
    platform: platformServices(),
  });
});

async function login(
  subject: string,
  email: string,
  name: string,
): Promise<{ token: string; userId: string }> {
  identity = { subject, email, emailVerified: true, name };
  const nonceResponse = await app.request('/v1/auth/nonce', { method: 'POST' }, testEnv());
  const { nonce } = (await nonceResponse.json()) as { nonce: string };
  currentNonce = nonce;

  const response = await app.request(
    '/v1/auth/google',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'test-id-token', nonce }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { token: string; user: { id: string } };
  return { token: body.token, userId: body.user.id };
}

function authHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra };
}

async function adminToken(): Promise<string> {
  const admin = await login('google-admin', 'admin@example.com', 'Admin');
  authRepository.setRoles(admin.userId, ['ADMIN']);
  return admin.token;
}

async function approvedPartner(
  subject: string,
  email: string,
  name: string,
): Promise<{ token: string; userId: string; adminToken: string }> {
  const partner = await login(subject, email, name);
  const onboard = await app.request(
    '/v1/partner/onboarding',
    {
      method: 'POST',
      headers: authHeaders(partner.token),
      body: JSON.stringify({ serviceCityId: CITY_ID, skills: [CATEGORY_CODE] }),
    },
    testEnv(),
  );
  expect(onboard.status).toBe(201);
  authRepository.setRoles(partner.userId, ['CUSTOMER', 'PARTNER']);

  const admin = await adminToken();
  const approve = await app.request(
    `/v1/admin/partners/${partner.userId}/approve`,
    {
      method: 'POST',
      headers: authHeaders(admin),
      body: JSON.stringify({ verifySkills: true }),
    },
    testEnv(),
  );
  expect(approve.status).toBe(200);

  const zones = await app.request(
    '/v1/partner/service-zones',
    {
      method: 'PUT',
      headers: authHeaders(partner.token),
      body: JSON.stringify({ zoneIds: [ZONE_ID] }),
    },
    testEnv(),
  );
  expect(zones.status).toBe(200);

  const availability = await app.request(
    '/v1/partner/availability',
    {
      method: 'PATCH',
      headers: authHeaders(partner.token),
      body: JSON.stringify({ isOnline: true, latitude: 23.03, longitude: 72.56 }),
    },
    testEnv(),
  );
  expect(availability.status).toBe(200);

  return { ...partner, adminToken: admin };
}

async function createAddress(token: string): Promise<Address> {
  const response = await app.request(
    '/v1/addresses',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        label: 'Home',
        addressLine: '12 Test Street',
        locality: 'Navrangpura',
        city: 'Ahmedabad',
        state: 'Gujarat',
        postalCode: '380009',
        latitude: 23.0365,
        longitude: 72.5611,
      }),
    },
    testEnv(),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { address: Address }).address;
}

async function createBooking(
  token: string,
  key: string,
  addressId: string,
): Promise<Booking> {
  const response = await app.request(
    '/v1/bookings',
    {
      method: 'POST',
      headers: authHeaders(token, { 'idempotency-key': key }),
      body: JSON.stringify({ serviceItemId: ITEM_ID, addressId }),
    },
    testEnv(),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { booking: Booking }).booking;
}

function pendingOfferFor(bookingId: string) {
  return [...store.dispatchOffers.values()].find(
    (offer) => offer.bookingId === bookingId && offer.status === 'PENDING',
  );
}

async function acceptOffer(token: string, offerId: string) {
  return app.request(
    `/v1/partner/offers/${offerId}/accept`,
    { method: 'POST', headers: authHeaders(token), body: JSON.stringify({}) },
    testEnv(),
  );
}

async function rejectOffer(token: string, offerId: string) {
  return app.request(
    `/v1/partner/offers/${offerId}/reject`,
    { method: 'POST', headers: authHeaders(token), body: JSON.stringify({}) },
    testEnv(),
  );
}

function setActiveJobs(partnerId: string, count: number): void {
  const availability = store.availability.get(partnerId);
  if (!availability) throw new Error('TEST_AVAILABILITY_MISSING');
  availability.activeJobCount = count;
}

describe('M4 dispatch candidate selection', () => {
  it('offers a booking to the eligible online partner and is idempotent when dispatch is retried', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const first = await approvedPartner('google-partner-1', 'partner1@example.com', 'Partner One');
    const second = await approvedPartner('google-partner-2', 'partner2@example.com', 'Partner Two');
    setActiveJobs(first.userId, 0);
    setActiveJobs(second.userId, 1);

    const address = await createAddress(customer.token);
    const booking = await createBooking(customer.token, 'm4-booking-0001', address.id);
    expect(booking).toMatchObject({ status: 'DISPATCHING', version: 2 });

    const offer = pendingOfferFor(booking.id);
    expect(offer).toMatchObject({
      partnerUserId: first.userId,
      status: 'PENDING',
      score: expect.any(String),
    });
    expect(await store.listDispatchAttempts(booking.id)).toMatchObject([
      { attemptNumber: 1, candidateCount: 2, outcome: 'OFFER_CREATED' },
    ]);

    const retried = await dispatchService.start(booking.id);
    expect(retried.status).toBe('DISPATCHING');
    expect(
      [...store.dispatchOffers.values()].filter((entry) => entry.bookingId === booking.id),
    ).toHaveLength(1);

    const offers = await app.request(
      '/v1/partner/offers',
      { headers: authHeaders(first.token) },
      testEnv(),
    );
    expect(offers.status).toBe(200);
    expect(await offers.json()).toMatchObject({
      offers: [{ id: offer?.id, bookingId: booking.id, serviceCity: 'Ahmedabad' }],
    });
  });

  it('filters unapproved, offline and zone-less partners', async () => {
    const eligible = await approvedPartner('google-eligible', 'eligible@example.com', 'Eligible');

    const pending = await login('google-pending', 'pending@example.com', 'Pending');
    await app.request(
      '/v1/partner/onboarding',
      {
        method: 'POST',
        headers: authHeaders(pending.token),
        body: JSON.stringify({ serviceCityId: CITY_ID, skills: [CATEGORY_CODE] }),
      },
      testEnv(),
    );
    setActiveJobs(pending.userId, 0);

    const noZone = await approvedPartner('google-nozone', 'nozone@example.com', 'No Zone');
    store.partnerZones.set(noZone.userId, []);

    const offline = await approvedPartner('google-offline', 'offline@example.com', 'Offline');
    const offlineAvailability = store.availability.get(offline.userId);
    if (!offlineAvailability) throw new Error('TEST_AVAILABILITY_MISSING');
    offlineAvailability.isOnline = false;

    const candidates = await store.listDispatchCandidates({
      categoryCode: CATEGORY_CODE,
      city: 'Ahmedabad',
      state: 'Gujarat',
      maxActiveJobs: 2,
      onlineOnly: true,
      limit: 50,
    });
    expect(candidates.map((candidate) => candidate.userId)).toEqual([eligible.userId]);
  });

  it('moves a booking to NO_PARTNER_AVAILABLE when no candidate exists', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const address = await createAddress(customer.token);
    const booking = await createBooking(customer.token, 'm4-booking-0002', address.id);

    expect(booking.status).toBe('NO_PARTNER_AVAILABLE');
    expect(await store.listDispatchAttempts(booking.id)).toMatchObject([
      { attemptNumber: 1, candidateCount: 0, outcome: 'NO_CANDIDATES' },
    ]);
  });
});

describe('M4 partner offer commands', () => {
  it('accepts an offer atomically, increments workload and is idempotent for the same partner', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const first = await approvedPartner('google-partner-1', 'partner1@example.com', 'Partner One');
    const second = await approvedPartner('google-partner-2', 'partner2@example.com', 'Partner Two');
    setActiveJobs(first.userId, 0);
    setActiveJobs(second.userId, 1);

    const address = await createAddress(customer.token);
    const booking = await createBooking(customer.token, 'm4-booking-0003', address.id);
    const offer = pendingOfferFor(booking.id);
    if (!offer) throw new Error('TEST_OFFER_MISSING');

    const accepted = await acceptOffer(first.token, offer.id);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      booking: { id: booking.id, status: 'PARTNER_ASSIGNED', partnerUserId: first.userId, version: 3 },
    });
    expect(store.availability.get(first.userId)?.activeJobCount).toBe(1);
    expect(store.dispatchOffers.get(offer.id)?.status).toBe('ACCEPTED');

    const duplicate = await acceptOffer(first.token, offer.id);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({
      booking: { id: booking.id, status: 'PARTNER_ASSIGNED', version: 3 },
    });

    const stolen = await acceptOffer(second.token, offer.id);
    expect(stolen.status).toBe(403);

    const events = await app.request(
      `/v1/bookings/${booking.id}/events?afterSequence=2`,
      { headers: authHeaders(customer.token) },
      testEnv(),
    );
    expect(await events.json()).toMatchObject({
      events: [{ sequence: 3, eventType: 'PARTNER_ASSIGNED' }],
    });
  });

  it('cancels the pending offer when the customer cancels the booking', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const partner = await approvedPartner('google-partner-1', 'partner1@example.com', 'Partner One');

    const address = await createAddress(customer.token);
    const booking = await createBooking(customer.token, 'm4-booking-0007', address.id);
    const offer = pendingOfferFor(booking.id);
    if (!offer) throw new Error('TEST_OFFER_MISSING');

    const cancelled = await app.request(
      `/v1/bookings/${booking.id}/cancel`,
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ reason: 'Changed plans' }),
      },
      testEnv(),
    );
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      booking: { status: 'CANCELLED_BY_CUSTOMER', version: 3 },
    });
    expect(store.dispatchOffers.get(offer.id)?.status).toBe('CANCELLED');

    const lateAccept = await acceptOffer(partner.token, offer.id);
    expect(lateAccept.status).toBe(409);
    expect(await lateAccept.json()).toMatchObject({ error: { code: 'OFFER_NOT_PENDING' } });
    expect(store.availability.get(partner.userId)?.activeJobCount).toBe(0);
  });

  it('rejects an offer and offers the next ranked candidate', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const first = await approvedPartner('google-partner-1', 'partner1@example.com', 'Partner One');
    const second = await approvedPartner('google-partner-2', 'partner2@example.com', 'Partner Two');
    setActiveJobs(first.userId, 0);
    setActiveJobs(second.userId, 1);

    const address = await createAddress(customer.token);
    const booking = await createBooking(customer.token, 'm4-booking-0004', address.id);
    const firstOffer = pendingOfferFor(booking.id);
    if (!firstOffer) throw new Error('TEST_OFFER_MISSING');

    const rejected = await rejectOffer(first.token, firstOffer.id);
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({ booking: { status: 'DISPATCHING' } });
    expect(store.dispatchOffers.get(firstOffer.id)?.status).toBe('REJECTED');

    const secondOffer = pendingOfferFor(booking.id);
    expect(secondOffer?.partnerUserId).toBe(second.userId);
    expect(await store.listDispatchAttempts(booking.id)).toHaveLength(2);

    const accepted = await acceptOffer(second.token, secondOffer?.id ?? '');
    expect(accepted.status).toBe(200);
    expect(store.availability.get(second.userId)?.activeJobCount).toBe(2);
  });

  it('expires an offer, advances, and exhausts the retry budget to NO_PARTNER_AVAILABLE', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const first = await approvedPartner('google-partner-1', 'partner1@example.com', 'Partner One');
    const second = await approvedPartner('google-partner-2', 'partner2@example.com', 'Partner Two');
    setActiveJobs(first.userId, 0);
    setActiveJobs(second.userId, 1);

    const address = await createAddress(customer.token);
    const booking = await createBooking(customer.token, 'm4-booking-0005', address.id);
    const firstOffer = pendingOfferFor(booking.id);
    if (!firstOffer) throw new Error('TEST_OFFER_MISSING');

    clock.advance(61_000);
    const firstExpiry = await dispatchService.expireOffers();
    expect(firstExpiry).toMatchObject({ expired: 1, advanced: 1 });
    expect(store.dispatchOffers.get(firstOffer.id)?.status).toBe('EXPIRED');
    expect(pendingOfferFor(booking.id)?.partnerUserId).toBe(second.userId);

    clock.advance(61_000);
    const secondExpiry = await dispatchService.expireOffers();
    expect(secondExpiry).toMatchObject({ expired: 1, advanced: 1 });

    const stale = await store.getBooking(booking.id);
    expect(stale).toMatchObject({ status: 'NO_PARTNER_AVAILABLE', version: 3 });
    expect(await store.listDispatchAttempts(booking.id)).toHaveLength(2);
  });
});

describe('M4 admin assignment and races', () => {
  it('lets an admin assign and reassign with eligibility checks and audit rows', async () => {
    const admin = await adminToken();
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const first = await approvedPartner('google-partner-1', 'partner1@example.com', 'Partner One');
    const second = await approvedPartner('google-partner-2', 'partner2@example.com', 'Partner Two');
    setActiveJobs(first.userId, 0);
    setActiveJobs(second.userId, 0);

    const booking = store.seedBooking({ customerUserId: customer.userId, status: 'REQUESTED' });

    const stale = await app.request(
      `/v1/admin/bookings/${booking.id}/assign`,
      {
        method: 'POST',
        headers: authHeaders(admin),
        body: JSON.stringify({
          partnerId: first.userId,
          reason: 'Stale admin tab',
          expectedVersion: 99,
        }),
      },
      testEnv(),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: 'BOOKING_VERSION_CONFLICT' },
    });

    const assign = await app.request(
      `/v1/admin/bookings/${booking.id}/assign`,
      {
        method: 'POST',
        headers: authHeaders(admin),
        body: JSON.stringify({ partnerId: first.userId, reason: 'Customer requested this partner' }),
      },
      testEnv(),
    );
    expect(assign.status).toBe(200);
    expect(await assign.json()).toMatchObject({
      booking: { status: 'PARTNER_ASSIGNED', partnerUserId: first.userId, version: 3 },
    });
    expect(store.availability.get(first.userId)?.activeJobCount).toBe(1);
    expect(store.auditLogs.at(-1)).toMatchObject({
      action: 'BOOKING_ASSIGNED',
      targetId: booking.id,
      reason: 'Customer requested this partner',
    });

    const reassign = await app.request(
      `/v1/admin/bookings/${booking.id}/reassign`,
      {
        method: 'POST',
        headers: authHeaders(admin),
        body: JSON.stringify({ partnerId: second.userId, reason: 'First partner unavailable' }),
      },
      testEnv(),
    );
    expect(reassign.status).toBe(200);
    expect(await reassign.json()).toMatchObject({
      booking: { status: 'PARTNER_ASSIGNED', partnerUserId: second.userId, version: 4 },
    });
    expect(store.availability.get(first.userId)?.activeJobCount).toBe(0);
    expect(store.availability.get(second.userId)?.activeJobCount).toBe(1);
    expect(store.auditLogs.at(-1)).toMatchObject({
      action: 'BOOKING_REASSIGNED',
      targetId: booking.id,
    });
  });

  it('refuses an ineligible admin assignment and non-admin access', async () => {
    const admin = await adminToken();
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const unapproved = await login('google-unapproved', 'unapproved@example.com', 'Unapproved');
    await app.request(
      '/v1/partner/onboarding',
      {
        method: 'POST',
        headers: authHeaders(unapproved.token),
        body: JSON.stringify({ serviceCityId: CITY_ID, skills: [CATEGORY_CODE] }),
      },
      testEnv(),
    );

    const booking = store.seedBooking({ customerUserId: customer.userId, status: 'REQUESTED' });
    const ineligible = await app.request(
      `/v1/admin/bookings/${booking.id}/assign`,
      {
        method: 'POST',
        headers: authHeaders(admin),
        body: JSON.stringify({ partnerId: unapproved.userId, reason: 'Emergency override' }),
      },
      testEnv(),
    );
    expect(ineligible.status).toBe(400);
    expect(await ineligible.json()).toMatchObject({ error: { code: 'PARTNER_NOT_ELIGIBLE' } });

    const forbidden = await app.request(
      `/v1/admin/bookings/${booking.id}/assign`,
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ partnerId: unapproved.userId, reason: 'Not allowed' }),
      },
      testEnv(),
    );
    expect(forbidden.status).toBe(403);
  });

  it('rejects a partner accept after an admin has assigned the booking', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const first = await approvedPartner('google-partner-1', 'partner1@example.com', 'Partner One');
    const second = await approvedPartner('google-partner-2', 'partner2@example.com', 'Partner Two');
    setActiveJobs(first.userId, 0);
    setActiveJobs(second.userId, 1);

    const address = await createAddress(customer.token);
    const booking = await createBooking(customer.token, 'm4-booking-0006', address.id);
    const offer = pendingOfferFor(booking.id);
    if (!offer) throw new Error('TEST_OFFER_MISSING');
    expect(offer.partnerUserId).toBe(first.userId);

    const assign = await app.request(
      `/v1/admin/bookings/${booking.id}/assign`,
      {
        method: 'POST',
        headers: authHeaders(second.adminToken),
        body: JSON.stringify({ partnerId: second.userId, reason: 'Operational override' }),
      },
      testEnv(),
    );
    expect(assign.status).toBe(200);
    expect(store.dispatchOffers.get(offer.id)?.status).toBe('CANCELLED');

    const race = await acceptOffer(first.token, offer.id);
    expect(race.status).toBe(409);
    expect(await race.json()).toMatchObject({ error: { code: 'OFFER_NOT_PENDING' } });

    const current = await store.getBooking(booking.id);
    expect(current?.partnerUserId).toBe(second.userId);
    expect(store.availability.get(first.userId)?.activeJobCount).toBe(0);
    expect(store.availability.get(second.userId)?.activeJobCount).toBe(2);
  });
});

describe('M4 dispatch validation and ranking', () => {
  it('requires a partner role for availability and validates zone membership', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const partner = await approvedPartner('google-partner-1', 'partner1@example.com', 'Partner One');

    const forbidden = await app.request(
      '/v1/partner/availability',
      {
        method: 'PATCH',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ isOnline: true }),
      },
      testEnv(),
    );
    expect(forbidden.status).toBe(403);

    const invalidZone = await app.request(
      '/v1/partner/service-zones',
      {
        method: 'PUT',
        headers: authHeaders(partner.token),
        body: JSON.stringify({ zoneIds: [crypto.randomUUID()] }),
      },
      testEnv(),
    );
    expect(invalidZone.status).toBe(400);
    expect(await invalidZone.json()).toMatchObject({ error: { code: 'INVALID_SERVICE_ZONE' } });

    const availability = await app.request(
      '/v1/partner/availability',
      { headers: authHeaders(partner.token) },
      testEnv(),
    );
    expect(await availability.json()).toMatchObject({
      availability: { isOnline: true, activeJobCount: 0 },
    });
  });

  it('ranks lower workload first and uses distance as the tie-breaker', () => {
    const distance = haversineKm(
      { latitude: '23.036500', longitude: '72.561100' },
      { latitude: '23.036500', longitude: '72.561100' },
    );
    expect(distance).toBeCloseTo(0, 5);

    const ranked = rankCandidates(
      [
        { userId: 'b', activeJobCount: 0, latitude: '23.1', longitude: '72.6' },
        { userId: 'a', activeJobCount: 0, latitude: '23.04', longitude: '72.56' },
        { userId: 'c', activeJobCount: 1, latitude: '23.03', longitude: '72.56' },
      ],
      { latitude: '23.036500', longitude: '72.561100' },
    );
    expect(ranked.map((entry) => entry.candidate.userId)).toEqual(['a', 'b', 'c']);
  });
});
