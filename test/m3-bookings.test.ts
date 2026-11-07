import { beforeEach, describe, expect, it } from 'vitest';
import type { GoogleIdentity } from '../src/auth/google-token';
import { createAuthService, type AuthService } from '../src/auth/service';
import { createApp } from '../src/app';
import { canTransition, isTerminalStatus } from '../src/domain/booking-state';
import { paiseToInr, parseInrToPaise } from '../src/domain/money';
import { createAddressService, createBookingService } from '../src/platform/booking-services';
import {
  createAuditService,
  createCatalogueService,
  createMediaService,
  createPartnerService,
} from '../src/platform/services';
import type { Address, Booking, ServiceItem } from '../src/platform/types';
import { InMemoryAuthRepository } from './helpers/in-memory-auth-repository';
import { InMemoryPlatformStore } from './helpers/in-memory-platform-store';
import { testEnv } from './helpers/test-env';

const AUDIENCE = 'web-client.apps.googleusercontent.com';
const ITEM_ID = '44444444-4444-4444-8444-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-111111111111';
const RETIRED_CATEGORY_ID = '22222222-2222-4222-8222-333333333333';
const AHMEDABAD = { city: 'Ahmedabad', state: 'Gujarat' };
const SURAT = { city: 'Surat', state: 'Gujarat' };

let authRepository: InMemoryAuthRepository;
let authService: AuthService;
let store: InMemoryPlatformStore;
let app: ReturnType<typeof createApp>;
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

async function createAddress(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<Address> {
  const response = await app.request(
    '/v1/addresses',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        label: 'Home',
        addressLine: '12 Test Street',
        locality: 'Navrangpura',
        ...AHMEDABAD,
        postalCode: '380009',
        latitude: 23.0365,
        longitude: 72.5611,
        ...overrides,
      }),
    },
    testEnv(),
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { address: Address };
  return body.address;
}

async function createBooking(
  token: string,
  idempotencyKey: string,
  addressId: string,
  overrides: Record<string, unknown> = {},
) {
  return app.request(
    '/v1/bookings',
    {
      method: 'POST',
      headers: authHeaders(token, { 'idempotency-key': idempotencyKey }),
      body: JSON.stringify({
        serviceItemId: ITEM_ID,
        addressId,
        ...overrides,
      }),
    },
    testEnv(),
  );
}

async function getBooking(token: string, bookingId: string) {
  return app.request(`/v1/bookings/${bookingId}`, { headers: authHeaders(token) }, testEnv());
}

async function transition(
  token: string,
  bookingId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  return app.request(
    `/v1/partner/bookings/${bookingId}/status`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ status, ...extra }),
    },
    testEnv(),
  );
}

async function cancel(
  token: string,
  bookingId: string,
  body: Record<string, unknown> = {},
) {
  return app.request(
    `/v1/bookings/${bookingId}/cancel`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    testEnv(),
  );
}

describe('M3 address storage', () => {
  it('creates, lists, updates and deletes only the caller’s addresses', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const other = await login('google-other', 'other@example.com', 'Other');

    const address = await createAddress(customer.token, { label: '  Home  ' });
    expect(address).toMatchObject({
      userId: customer.userId,
      label: 'Home',
      city: 'Ahmedabad',
      latitude: '23.036500',
      longitude: '72.561100',
    });

    const list = await app.request('/v1/addresses', { headers: authHeaders(customer.token) }, testEnv());
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ addresses: [{ id: address.id }] });

    const otherList = await app.request('/v1/addresses', { headers: authHeaders(other.token) }, testEnv());
    expect(await otherList.json()).toMatchObject({ addresses: [] });

    const otherPatch = await app.request(
      `/v1/addresses/${address.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(other.token),
        body: JSON.stringify({ label: 'Stolen' }),
      },
      testEnv(),
    );
    expect(otherPatch.status).toBe(404);

    const otherDelete = await app.request(
      `/v1/addresses/${address.id}`,
      { method: 'DELETE', headers: authHeaders(other.token) },
      testEnv(),
    );
    expect(otherDelete.status).toBe(404);

    const patch = await app.request(
      `/v1/addresses/${address.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ label: 'Office', addressLine: ' 99 New Road ' }),
      },
      testEnv(),
    );
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({
      address: { label: 'Office', addressLine: '99 New Road' },
    });

    const invalidCoordinates = await app.request(
      `/v1/addresses/${address.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ latitude: 23.1 }),
      },
      testEnv(),
    );
    expect(invalidCoordinates.status).toBe(400);
    expect(await invalidCoordinates.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const remove = await app.request(
      `/v1/addresses/${address.id}`,
      { method: 'DELETE', headers: authHeaders(customer.token) },
      testEnv(),
    );
    expect(remove.status).toBe(204);

    const after = await app.request('/v1/addresses', { headers: authHeaders(customer.token) }, testEnv());
    expect(await after.json()).toMatchObject({ addresses: [] });
  });

  it('refuses to delete an address that a booking still references', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const address = await createAddress(customer.token);
    const created = await createBooking(customer.token, 'booking-key-0010', address.id);
    expect(created.status).toBe(201);

    const response = await app.request(
      `/v1/addresses/${address.id}`,
      { method: 'DELETE', headers: authHeaders(customer.token) },
      testEnv(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'ADDRESS_IN_USE' } });
  });

  it('requires authentication and validates address payloads', async () => {
    const anonymous = await app.request('/v1/addresses', {}, testEnv());
    expect(anonymous.status).toBe(401);

    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const badPostalCode = await app.request(
      '/v1/addresses',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({
          addressLine: '12 Test Street',
          ...AHMEDABAD,
          postalCode: '0123',
        }),
      },
      testEnv(),
    );
    expect(badPostalCode.status).toBe(400);
    expect(await badPostalCode.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('M3 booking creation', () => {
  it('prices on the server, snapshots the address and replays idempotent requests', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const address = await createAddress(customer.token);

    const created = await createBooking(customer.token, 'booking-key-0001', address.id);
    expect(created.status).toBe(201);
    expect(created.headers.get('idempotent-replay')).toBe('false');
    const createdBody = (await created.json()) as { booking: Booking };
    expect(createdBody.booking).toMatchObject({
      customerUserId: customer.userId,
      serviceItemId: ITEM_ID,
      addressId: address.id,
      status: 'REQUESTED',
      quotedTotal: '299.00',
      currency: 'INR',
      version: 1,
      serviceAddressLine: '12 Test Street',
      serviceCity: 'Ahmedabad',
      serviceState: 'Gujarat',
      servicePostalCode: '380009',
    });

    await app.request(
      `/v1/addresses/${address.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ addressLine: 'Changed Later' }),
      },
      testEnv(),
    );

    const stillSnapshotted = await getBooking(customer.token, createdBody.booking.id);
    expect(await stillSnapshotted.json()).toMatchObject({
      booking: { serviceAddressLine: '12 Test Street' },
    });

    const replay = await createBooking(customer.token, 'booking-key-0001', address.id);
    expect(replay.status).toBe(200);
    expect(replay.headers.get('idempotent-replay')).toBe('true');
    expect(await replay.json()).toMatchObject({ booking: { id: createdBody.booking.id } });
    expect(store.bookings.size).toBe(1);

    const conflict = await createBooking(customer.token, 'booking-key-0001', address.id, {
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_CONFLICT' } });

    const second = await createBooking(customer.token, 'booking-key-0002', address.id);
    expect(second.status).toBe(201);
    expect(store.bookings.size).toBe(2);

    const other = await login('google-other', 'other@example.com', 'Other');
    const otherAddress = await createAddress(other.token);
    const otherCustomerSameKey = await createBooking(
      other.token,
      'booking-key-0001',
      otherAddress.id,
    );
    expect(otherCustomerSameKey.status).toBe(201);
    expect(store.bookings.size).toBe(3);

    const events = await app.request(
      `/v1/bookings/${createdBody.booking.id}/events`,
      { headers: authHeaders(customer.token) },
      testEnv(),
    );
    expect(events.status).toBe(200);
    expect(await events.json()).toMatchObject({
      events: [{ sequence: 1, eventType: 'BOOKING_CREATED', actorUserId: customer.userId }],
    });

    const item = store.items.find((entry) => entry.id === ITEM_ID);
    if (!item) throw new Error('TEST_ITEM_MISSING');
    item.enabled = false;
    const replayAfterDisable = await createBooking(
      customer.token,
      'booking-key-0001',
      address.id,
    );
    expect(replayAfterDisable.status).toBe(200);
    expect(replayAfterDisable.headers.get('idempotent-replay')).toBe('true');
    expect(await replayAfterDisable.json()).toMatchObject({
      booking: { id: createdBody.booking.id },
    });
  });

  it('requires a valid Idempotency-Key and rejects client-supplied pricing', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const address = await createAddress(customer.token);

    const missing = await app.request(
      '/v1/bookings',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ serviceItemId: ITEM_ID, addressId: address.id }),
      },
      testEnv(),
    );
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });

    const badKey = await app.request(
      '/v1/bookings',
      {
        method: 'POST',
        headers: authHeaders(customer.token, { 'idempotency-key': 'short' }),
        body: JSON.stringify({ serviceItemId: ITEM_ID, addressId: address.id }),
      },
      testEnv(),
    );
    expect(badKey.status).toBe(400);
    expect(await badKey.json()).toMatchObject({ error: { code: 'INVALID_IDEMPOTENCY_KEY' } });

    const clientPrice = await createBooking(customer.token, 'booking-key-0003', address.id, {
      quotedTotal: '1.00',
      total: '1.00',
    });
    expect(clientPrice.status).toBe(400);
    expect(await clientPrice.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects addresses outside enabled cities, unavailable items and past schedules', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const ahmedabad = await createAddress(customer.token);
    const surat = await createAddress(customer.token, {
      label: 'Other home',
      addressLine: '1 Surat Road',
      ...SURAT,
      postalCode: '395003',
    });

    const outsideCity = await createBooking(customer.token, 'booking-key-0004', surat.id);
    expect(outsideCity.status).toBe(400);
    expect(await outsideCity.json()).toMatchObject({ error: { code: 'CITY_NOT_AVAILABLE' } });

    const nullPriceItem: ServiceItem = {
      id: '44444444-4444-4444-8444-222222222222',
      categoryId: CATEGORY_ID,
      name: 'Inspection',
      description: null,
      basePrice: null,
      currency: 'INR',
      enabled: true,
    };
    store.items.push(nullPriceItem);
    const nullPrice = await createBooking(customer.token, 'booking-key-0005', ahmedabad.id, {
      serviceItemId: nullPriceItem.id,
    });
    expect(nullPrice.status).toBe(409);
    expect(await nullPrice.json()).toMatchObject({ error: { code: 'PRICE_NOT_AVAILABLE' } });

    const disabledItem: ServiceItem = {
      ...nullPriceItem,
      id: '44444444-4444-4444-8444-333333333333',
      basePrice: '499.00',
      enabled: false,
    };
    store.items.push(disabledItem);
    const disabled = await createBooking(customer.token, 'booking-key-0006', ahmedabad.id, {
      serviceItemId: disabledItem.id,
    });
    expect(disabled.status).toBe(404);
    expect(await disabled.json()).toMatchObject({ error: { code: 'SERVICE_ITEM_NOT_AVAILABLE' } });

    const retiredCategoryItem: ServiceItem = {
      ...nullPriceItem,
      id: '44444444-4444-4444-8444-444444444444',
      categoryId: RETIRED_CATEGORY_ID,
      basePrice: '199.00',
    };
    store.items.push(retiredCategoryItem);
    const retiredCategory = await createBooking(customer.token, 'booking-key-0007', ahmedabad.id, {
      serviceItemId: retiredCategoryItem.id,
    });
    expect(retiredCategory.status).toBe(400);
    expect(await retiredCategory.json()).toMatchObject({ error: { code: 'CATEGORY_NOT_AVAILABLE' } });

    const past = await createBooking(customer.token, 'booking-key-0008', ahmedabad.id, {
      scheduledAt: '2020-01-01T00:00:00.000Z',
    });
    expect(past.status).toBe(400);
    expect(await past.json()).toMatchObject({ error: { code: 'INVALID_SCHEDULE' } });
  });
});

describe('M3 booking access control', () => {
  it('limits booking reads and events to the customer, assigned partner and admin', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const other = await login('google-other', 'other@example.com', 'Other');
    const partner = await login('google-partner', 'partner@example.com', 'Partner');
    const strangerPartner = await login('google-stranger', 'stranger@example.com', 'Stranger');
    const admin = await login('google-admin', 'admin@example.com', 'Admin');
    authRepository.setRoles(partner.userId, ['CUSTOMER', 'PARTNER']);
    authRepository.setRoles(strangerPartner.userId, ['CUSTOMER', 'PARTNER']);
    authRepository.setRoles(admin.userId, ['ADMIN']);

    const address = await createAddress(customer.token);
    const created = await createBooking(customer.token, 'booking-key-0009', address.id);
    const booking = ((await created.json()) as { booking: Booking }).booking;
    store.seedBooking({
      customerUserId: customer.userId,
      partnerUserId: partner.userId,
      status: 'PARTNER_ASSIGNED',
      addressId: address.id,
    });
    store.bookings.set(booking.id, {
      ...booking,
      partnerUserId: partner.userId,
      status: 'PARTNER_ASSIGNED',
    });

    expect((await getBooking(other.token, booking.id)).status).toBe(403);
    expect((await getBooking(strangerPartner.token, booking.id)).status).toBe(403);
    expect((await getBooking(partner.token, booking.id)).status).toBe(200);
    expect((await getBooking(admin.token, booking.id)).status).toBe(200);

    const otherEvents = await app.request(
      `/v1/bookings/${booking.id}/events`,
      { headers: authHeaders(other.token) },
      testEnv(),
    );
    expect(otherEvents.status).toBe(403);

    const partnerEvents = await app.request(
      `/v1/bookings/${booking.id}/events`,
      { headers: authHeaders(partner.token) },
      testEnv(),
    );
    expect(partnerEvents.status).toBe(200);

    expect((await getBooking(customer.token, crypto.randomUUID())).status).toBe(404);
  });
});

describe('M3 customer booking transitions', () => {
  it('cancels a requested booking and writes an append-only event', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const booking = store.seedBooking({ customerUserId: customer.userId, status: 'REQUESTED' });

    const response = await cancel(customer.token, booking.id, {
      reason: 'No longer needed',
      expectedVersion: 1,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      booking: { status: 'CANCELLED_BY_CUSTOMER', version: 2 },
    });

    const events = await app.request(
      `/v1/bookings/${booking.id}/events?afterSequence=1`,
      { headers: authHeaders(customer.token) },
      testEnv(),
    );
    expect(await events.json()).toMatchObject({
      events: [
        {
          sequence: 2,
          eventType: 'BOOKING_STATUS_CHANGED',
          payload: {
            fromStatus: 'REQUESTED',
            toStatus: 'CANCELLED_BY_CUSTOMER',
            reason: 'No longer needed',
          },
        },
      ],
    });
  });

  it('rejects stale versions, terminal transitions and cancellation after completion pending', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const terminal = store.seedBooking({
      customerUserId: customer.userId,
      status: 'CANCELLED_BY_CUSTOMER',
    });
    const pending = store.seedBooking({
      customerUserId: customer.userId,
      status: 'COMPLETION_PENDING',
    });
    const requested = store.seedBooking({ customerUserId: customer.userId, status: 'REQUESTED' });

    const stale = await cancel(customer.token, requested.id, { expectedVersion: 7 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: 'BOOKING_VERSION_CONFLICT' } });

    const terminalResponse = await cancel(customer.token, terminal.id);
    expect(terminalResponse.status).toBe(409);
    expect(await terminalResponse.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } });

    const pendingResponse = await cancel(customer.token, pending.id);
    expect(pendingResponse.status).toBe(409);
    expect(await pendingResponse.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } });

    const completeTooEarly = await app.request(
      `/v1/bookings/${requested.id}/complete`,
      { method: 'POST', headers: authHeaders(customer.token), body: JSON.stringify({}) },
      testEnv(),
    );
    expect(completeTooEarly.status).toBe(409);
    expect(await completeTooEarly.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } });

    const other = await login('google-other', 'other@example.com', 'Other');
    expect((await cancel(other.token, requested.id)).status).toBe(403);
  });

  it('lets the customer confirm completion only from completion pending', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const booking = store.seedBooking({
      customerUserId: customer.userId,
      status: 'COMPLETION_PENDING',
    });

    const response = await app.request(
      `/v1/bookings/${booking.id}/complete`,
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      booking: { status: 'COMPLETED', version: 2 },
    });

    const again = await app.request(
      `/v1/bookings/${booking.id}/complete`,
      { method: 'POST', headers: authHeaders(customer.token), body: JSON.stringify({}) },
      testEnv(),
    );
    expect(again.status).toBe(409);
  });
});

describe('M3 partner booking transitions', () => {
  it('runs the assigned partner through arrival and completion pending, then the customer completes', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const partner = await login('google-partner', 'partner@example.com', 'Partner');
    authRepository.setRoles(partner.userId, ['CUSTOMER', 'PARTNER']);

    const booking = store.seedBooking({
      customerUserId: customer.userId,
      partnerUserId: partner.userId,
      status: 'PARTNER_ASSIGNED',
    });

    const chain = [
      ['PARTNER_ACCEPTED', 2],
      ['ON_THE_WAY', 3],
      ['ARRIVED', 4],
      ['IN_PROGRESS', 5],
      ['COMPLETION_PENDING', 6],
    ] as const;

    for (const [status, version] of chain) {
      const response = await transition(partner.token, booking.id, status, {
        expectedVersion: version - 1,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ booking: { status, version } });
    }

    const complete = await app.request(
      `/v1/bookings/${booking.id}/complete`,
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ expectedVersion: 6 }),
      },
      testEnv(),
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({
      booking: { status: 'COMPLETED', version: 7 },
    });

    const events = await app.request(
      `/v1/bookings/${booking.id}/events?afterSequence=5`,
      { headers: authHeaders(customer.token) },
      testEnv(),
    );
    expect(await events.json()).toMatchObject({
      events: [
        { sequence: 6, payload: { toStatus: 'COMPLETION_PENDING' } },
        { sequence: 7, payload: { toStatus: 'COMPLETED' } },
      ],
    });
  });

  it('enforces assignment, partner roles, reasons and valid transitions', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const partner = await login('google-partner', 'partner@example.com', 'Partner');
    const otherPartner = await login('google-other-partner', 'other-partner@example.com', 'Other');
    authRepository.setRoles(partner.userId, ['CUSTOMER', 'PARTNER']);
    authRepository.setRoles(otherPartner.userId, ['CUSTOMER', 'PARTNER']);

    const booking = store.seedBooking({
      customerUserId: customer.userId,
      partnerUserId: partner.userId,
      status: 'ARRIVED',
    });

    expect((await transition(customer.token, booking.id, 'IN_PROGRESS')).status).toBe(403);
    expect((await transition(otherPartner.token, booking.id, 'IN_PROGRESS')).status).toBe(403);

    const missingReason = await transition(partner.token, booking.id, 'CANCELLED_BY_PARTNER');
    expect(missingReason.status).toBe(400);
    expect(await missingReason.json()).toMatchObject({
      error: { code: 'CANCELLATION_REASON_REQUIRED' },
    });

    const invalid = await transition(partner.token, booking.id, 'PARTNER_ACCEPTED');
    expect(invalid.status).toBe(409);
    expect(await invalid.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } });

    const cancelled = await transition(partner.token, booking.id, 'CANCELLED_BY_PARTNER', {
      reason: 'Customer unreachable',
    });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      booking: { status: 'CANCELLED_BY_PARTNER', version: 2 },
    });

    const inProgress = store.seedBooking({
      customerUserId: customer.userId,
      partnerUserId: partner.userId,
      status: 'IN_PROGRESS',
    });
    const tooLate = await transition(partner.token, inProgress.id, 'CANCELLED_BY_PARTNER', {
      reason: 'Changed my mind',
    });
    expect(tooLate.status).toBe(409);
  });
});

describe('M3 booking state and money units', () => {
  it('parses and formats INR without floating point loss', () => {
    expect(parseInrToPaise('299')).toBe(29_900);
    expect(parseInrToPaise('299.5')).toBe(29_950);
    expect(parseInrToPaise('0.01')).toBe(1);
    expect(parseInrToPaise(' 12.34 ')).toBe(1_234);
    expect(parseInrToPaise('1.234')).toBeNull();
    expect(parseInrToPaise('-1')).toBeNull();
    expect(parseInrToPaise('abc')).toBeNull();
    expect(parseInrToPaise('99999999999')).toBeNull();

    expect(paiseToInr(29_900)).toBe('299.00');
    expect(paiseToInr(1)).toBe('0.01');
    expect(() => paiseToInr(-1)).toThrow(RangeError);
  });

  it('keeps the transition matrix role-aware and terminal states closed', () => {
    expect(canTransition('REQUESTED', 'CANCELLED_BY_CUSTOMER', 'CUSTOMER')).toBe(true);
    expect(canTransition('REQUESTED', 'PARTNER_ACCEPTED', 'PARTNER')).toBe(false);
    expect(canTransition('PARTNER_ASSIGNED', 'PARTNER_ACCEPTED', 'PARTNER')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETION_PENDING', 'PARTNER')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'CANCELLED_BY_PARTNER', 'PARTNER')).toBe(false);
    expect(canTransition('COMPLETION_PENDING', 'COMPLETED', 'CUSTOMER')).toBe(true);
    expect(canTransition('COMPLETION_PENDING', 'COMPLETED', 'PARTNER')).toBe(false);
    expect(canTransition('COMPLETED', 'COMPLETED', 'ADMIN')).toBe(false);
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('CANCELLED_BY_ADMIN')).toBe(true);
    expect(isTerminalStatus('IN_PROGRESS')).toBe(false);
  });
});
