import { beforeEach, describe, expect, it } from 'vitest';
import type { GoogleIdentity } from '../src/auth/google-token';
import { createAuthService, type AuthService } from '../src/auth/service';
import { createApp } from '../src/app';
import { createAddressService, createBookingService } from '../src/platform/booking-services';
import { createDispatchService, type DispatchService } from '../src/platform/dispatch-services';
import {
  createAuditService,
  createCatalogueService,
  createMediaService,
  createPartnerService,
} from '../src/platform/services';
import { createNotificationService } from '../src/notifications/notification-service';
import { createPushService } from '../src/notifications/push-service';
import { createDurableObjectUpgrader, unavailableUpgrader, type RealtimeUpgrader } from '../src/realtime/gateway';
import { createRealtimeService, type RealtimeService } from '../src/realtime/realtime-service';
import { verifyTicket } from '../src/realtime/ticket';
import type { Booking } from '../src/platform/types';
import { InMemoryAuthRepository } from './helpers/in-memory-auth-repository';
import { InMemoryPlatformStore } from './helpers/in-memory-platform-store';
import { TestClock } from './helpers/test-clock';
import { testEnv } from './helpers/test-env';

const AUDIENCE = 'web-client.apps.googleusercontent.com';
const ITEM_ID = '44444444-4444-4444-8444-111111111111';
const CITY_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '11111111-1111-4111-8111-333333333333';
const SECRET = 'm5-realtime-ticket-secret-0123456789abcd';

let authRepository: InMemoryAuthRepository;
let authService: AuthService;
let store: InMemoryPlatformStore;
let clock: TestClock;
let dispatchService: DispatchService;
let realtimeService: RealtimeService;
let app: ReturnType<typeof createApp>;
let currentNonce: string;
let identity: GoogleIdentity;

function buildApp(options: { secret?: string | null; pushEnabled?: boolean; upgrader?: RealtimeUpgrader } = {}) {
  const secret = options.secret === undefined ? SECRET : options.secret;

  return createApp({
    authService,
    checkDatabase: async () => true,
    realtime: {
      realtimeService: secret ? createRealtimeService({ store, secret, clock }) : null,
      upgrader: options.upgrader ?? unavailableUpgrader(),
    },
    pushService: createPushService({ store, pushEnabled: options.pushEnabled ?? false }),
    platform: {
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
      notifier: { notify: (bookingId) => void bookingId },
    },
  });
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
  realtimeService = createRealtimeService({ store, secret: SECRET, clock });
  app = buildApp();
});

async function login(subject: string, email: string, name: string): Promise<{ token: string; userId: string }> {
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
): Promise<{ token: string; userId: string }> {
  const partner = await login(subject, email, name);
  await app.request(
    '/v1/partner/onboarding',
    {
      method: 'POST',
      headers: authHeaders(partner.token),
      body: JSON.stringify({ serviceCityId: CITY_ID, skills: ['plumbing'] }),
    },
    testEnv(),
  );
  authRepository.setRoles(partner.userId, ['CUSTOMER', 'PARTNER']);

  const admin = await adminToken();
  await app.request(
    `/v1/admin/partners/${partner.userId}/approve`,
    { method: 'POST', headers: authHeaders(admin), body: JSON.stringify({ verifySkills: true }) },
    testEnv(),
  );
  await app.request(
    '/v1/partner/service-zones',
    {
      method: 'PUT',
      headers: authHeaders(partner.token),
      body: JSON.stringify({ zoneIds: [ZONE_ID] }),
    },
    testEnv(),
  );
  await app.request(
    '/v1/partner/availability',
    {
      method: 'PATCH',
      headers: authHeaders(partner.token),
      body: JSON.stringify({ isOnline: true, latitude: 23.03, longitude: 72.56 }),
    },
    testEnv(),
  );
  return partner;
}

async function createAddress(token: string): Promise<string> {
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
  return ((await response.json()) as { address: { id: string } }).address.id;
}

async function dispatchableBooking(): Promise<{
  booking: Booking;
  customerToken: string;
  partner: { token: string; userId: string };
}> {
  const partner = await approvedPartner('google-partner', 'partner@example.com', 'Partner');
  const customer = await login('google-customer', 'customer@example.com', 'Customer');
  const addressId = await createAddress(customer.token);
  const response = await app.request(
    '/v1/bookings',
    {
      method: 'POST',
      headers: authHeaders(customer.token, { 'idempotency-key': 'm5-booking-1' }),
      body: JSON.stringify({ serviceItemId: ITEM_ID, addressId }),
    },
    testEnv(),
  );
  expect(response.status).toBe(201);
  const booking = ((await response.json()) as { booking: Booking }).booking;
  return { booking, customerToken: customer.token, partner };
}

function ticketRequest(bookingId: string, token: string) {
  return app.request(
    `/v1/bookings/${bookingId}/realtime-ticket`,
    { method: 'POST', headers: authHeaders(token) },
    testEnv(),
  );
}

describe('M5 realtime ticket issuance', () => {
  it('issues a booking-scoped ticket to the customer', async () => {
    const { booking, customerToken } = await dispatchableBooking();
    const response = await ticketRequest(booking.id, customerToken);
    expect(response.status).toBe(200);
    const { realtime } = (await response.json()) as {
      realtime: { ticket: string; expiresAt: string; websocketUrl: string; protocol: string; schemaVersion: number };
    };
    expect(realtime.protocol).toBe('fixyes-realtime');
    expect(realtime.schemaVersion).toBe(1);
    expect(realtime.websocketUrl).toBe(`ws://localhost/v1/realtime/bookings/${booking.id}/ws`);

    const claims = await verifyTicket({
      token: realtime.ticket,
      secret: SECRET,
      expectedBookingId: booking.id,
      now: clock.now(),
    });
    expect(claims).toMatchObject({ bookingId: booking.id, userId: expect.any(String), role: 'CUSTOMER' });
  });

  it('admits the offered partner while the offer is pending', async () => {
    const { booking, partner } = await dispatchableBooking();
    const response = await ticketRequest(booking.id, partner.token);
    expect(response.status).toBe(200);
    const { realtime } = (await response.json()) as { realtime: { ticket: string } };
    const claims = await verifyTicket({
      token: realtime.ticket,
      secret: SECRET,
      expectedBookingId: booking.id,
      now: clock.now(),
    });
    expect(claims.role).toBe('PARTNER');
  });

  it('admits the assigned partner and an admin', async () => {
    const { booking, partner } = await dispatchableBooking();
    const offers = await app.request(
      '/v1/partner/offers',
      { headers: authHeaders(partner.token) },
      testEnv(),
    );
    const offerId = ((await offers.json()) as { offers: { id: string }[] }).offers[0].id;
    await app.request(
      `/v1/partner/offers/${offerId}/accept`,
      { method: 'POST', headers: authHeaders(partner.token) },
      testEnv(),
    );

    expect((await ticketRequest(booking.id, partner.token)).status).toBe(200);
    expect((await ticketRequest(booking.id, await adminToken())).status).toBe(200);
  });

  it('refuses strangers and unauthenticated callers', async () => {
    const { booking } = await dispatchableBooking();
    const stranger = await login('google-stranger', 'stranger@example.com', 'Stranger');
    expect((await ticketRequest(booking.id, stranger.token)).status).toBe(403);
    expect((await ticketRequest(booking.id, await adminToken())).status).toBe(200);

    const anonymous = await app.request(
      `/v1/bookings/${booking.id}/realtime-ticket`,
      { method: 'POST' },
      testEnv(),
    );
    expect(anonymous.status).toBe(401);
  });

  it('rejects a ticket replayed against another booking', async () => {
    const { booking, customerToken } = await dispatchableBooking();
    const other = store.seedBooking({ customerUserId: 'd'.repeat(36), status: 'REQUESTED' });
    const response = await ticketRequest(booking.id, customerToken);
    const { realtime } = (await response.json()) as { realtime: { ticket: string } };

    await expect(
      verifyTicket({
        token: realtime.ticket,
        secret: SECRET,
        expectedBookingId: other.id,
        now: clock.now(),
      }),
    ).rejects.toThrow(/BOOKING_MISMATCH/);

    await expect(
      verifyTicket({ token: realtime.ticket, secret: 'x'.repeat(40), now: clock.now() }),
    ).rejects.toThrow(/SIGNATURE/);
  });

  it('refuses an unknown booking id', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const missing = await ticketRequest('99999999-9999-4999-8999-999999999999', customer.token);
    expect(missing.status).toBe(404);

    const invalid = await ticketRequest('not-a-uuid', customer.token);
    expect(invalid.status).toBe(400);
  });

  it('expires the ticket once the dispatch offer lapses', async () => {
    const { booking, partner } = await dispatchableBooking();
    clock.advance(61_000);
    expect((await ticketRequest(booking.id, partner.token)).status).toBe(403);
  });

  it('reports realtime as unavailable when the ticket secret is absent', async () => {
    const bare = buildApp({ secret: '' });
    const { booking, customerToken } = await dispatchableBooking();
    const ticket = await bare.request(
      `/v1/bookings/${booking.id}/realtime-ticket`,
      { method: 'POST', headers: authHeaders(customerToken) },
      testEnv(),
    );
    expect(ticket.status).toBe(503);
    expect(((await ticket.json()) as { error: { code: string } }).error.code).toBe(
      'REALTIME_NOT_CONFIGURED',
    );

    const socket = await bare.request(
      `/v1/realtime/bookings/${booking.id}/ws`,
      { headers: { upgrade: 'websocket' } },
      testEnv(),
    );
    expect(socket.status).toBe(503);
  });

  it('forwards the websocket handshake to the booking room stub', async () => {
    const requested: { name: string; url: string }[] = [];
    const binding = {
      getByName: (name: string) => ({
        fetch: async (request: Request) => {
          requested.push({ name, url: request.url });
          return new Response('room', { status: 200 });
        },
      }),
    } as unknown as DurableObjectNamespace;

    const proxied = buildApp({ upgrader: createDurableObjectUpgrader(binding) });
    const { booking } = await dispatchableBooking();
    const response = await proxied.request(
      `/v1/realtime/bookings/${booking.id}/ws?ticket=abc`,
      { headers: { upgrade: 'websocket' } },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('room');
    expect(requested).toEqual([
      { name: booking.id, url: 'https://booking-room.internal/ws?ticket=abc' },
    ]);
  });
});

describe('M5 push token registration', () => {
  const token = (index: number) => `ExponentPushToken[device-${index}]`;

  it('registers, lists and revokes a token', async () => {
    const pushApp = buildApp({ pushEnabled: true });
    const customer = await login('google-customer', 'customer@example.com', 'Customer');

    const created = await pushApp.request(
      '/v1/push-tokens',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ expoPushToken: token(1), devicePlatform: 'ios' }),
      },
      testEnv(),
    );
    expect(created.status).toBe(200);
    const pushToken = ((await created.json()) as { pushToken: { id: string; active: boolean } })
      .pushToken;
    expect(pushToken.active).toBe(true);

    const listed = await pushApp.request('/v1/push-tokens', { headers: authHeaders(customer.token) }, testEnv());
    expect(((await listed.json()) as { pushTokens: unknown[] }).pushTokens).toHaveLength(1);

    const revoked = await pushApp.request(
      `/v1/push-tokens/${pushToken.id}`,
      { method: 'DELETE', headers: authHeaders(customer.token) },
      testEnv(),
    );
    expect(revoked.status).toBe(204);
    expect(store.pushTokens[0].active).toBe(false);
  });

  it('re-activates a token that a device registers again', async () => {
    const pushApp = buildApp({ pushEnabled: true });
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const body = JSON.stringify({ expoPushToken: token(2) });

    const first = await pushApp.request(
      '/v1/push-tokens',
      { method: 'POST', headers: authHeaders(customer.token), body },
      testEnv(),
    );
    const id = ((await first.json()) as { pushToken: { id: string } }).pushToken.id;
    await pushApp.request(`/v1/push-tokens/${id}`, { method: 'DELETE', headers: authHeaders(customer.token) }, testEnv());

    const again = await pushApp.request(
      '/v1/push-tokens',
      { method: 'POST', headers: authHeaders(customer.token), body },
      testEnv(),
    );
    expect(((await again.json()) as { pushToken: { id: string; active: boolean } }).pushToken).toMatchObject({
      id,
      active: true,
    });
  });

  it('validates the token shape and the caller', async () => {
    const pushApp = buildApp({ pushEnabled: true });
    const customer = await login('google-customer', 'customer@example.com', 'Customer');

    const malformed = await pushApp.request(
      '/v1/push-tokens',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ expoPushToken: 'ExponentPushToken[]' }),
      },
      testEnv(),
    );
    expect(malformed.status).toBe(400);

    const anonymous = await pushApp.request('/v1/push-tokens', { method: 'POST' }, testEnv());
    expect(anonymous.status).toBe(401);

    const unknownDelete = await pushApp.request(
      '/v1/push-tokens/99999999-9999-4999-8999-999999999999',
      { method: 'DELETE', headers: authHeaders(customer.token) },
      testEnv(),
    );
    expect(unknownDelete.status).toBe(404);
  });

  it('never lists or revokes another user token', async () => {
    const pushApp = buildApp({ pushEnabled: true });
    const owner = await login('google-owner', 'owner@example.com', 'Owner');
    const other = await login('google-other', 'other@example.com', 'Other');

    const created = await pushApp.request(
      '/v1/push-tokens',
      {
        method: 'POST',
        headers: authHeaders(owner.token),
        body: JSON.stringify({ expoPushToken: token(3) }),
      },
      testEnv(),
    );
    const id = ((await created.json()) as { pushToken: { id: string } }).pushToken.id;

    expect(
      (
        await pushApp.request('/v1/push-tokens', { headers: authHeaders(other.token) }, testEnv())
      ).status,
    ).toBe(200);
    const { pushTokens } = (await pushApp.request(
      '/v1/push-tokens',
      { headers: authHeaders(other.token) },
      testEnv(),
    ).then((response) => response.json())) as { pushTokens: unknown[] };
    expect(pushTokens).toHaveLength(0);

    expect(
      (
        await pushApp.request(
          `/v1/push-tokens/${id}`,
          { method: 'DELETE', headers: authHeaders(other.token) },
          testEnv(),
        )
      ).status,
    ).toBe(404);
    expect(store.pushTokens[0].active).toBe(true);
  });

  it('caps the number of active tokens per user', async () => {
    const pushApp = buildApp({ pushEnabled: true });
    const customer = await login('google-customer', 'customer@example.com', 'Customer');

    for (let index = 0; index < 10; index += 1) {
      const response = await pushApp.request(
        '/v1/push-tokens',
        {
          method: 'POST',
          headers: authHeaders(customer.token),
          body: JSON.stringify({ expoPushToken: token(index) }),
        },
        testEnv(),
      );
      expect(response.status).toBe(200);
    }

    const overflow = await pushApp.request(
      '/v1/push-tokens',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ expoPushToken: token(99) }),
      },
      testEnv(),
    );
    expect(overflow.status).toBe(409);
  });

  it('refuses registrations while push is not configured', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Customer');
    const response = await app.request(
      '/v1/push-tokens',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ expoPushToken: token(4) }),
      },
      testEnv(),
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'PUSH_NOT_CONFIGURED',
    );
  });
});
