import { beforeEach, describe, expect, it } from 'vitest';
import type { GoogleIdentity } from '../src/auth/google-token';
import { createAuthService, type AuthService } from '../src/auth/service';
import { createApp } from '../src/app';
import { encodeCursor } from '../src/lib/cursor';
import { signCloudinaryParams, type CloudinaryResource } from '../src/media/cloudinary';
import { createAddressService, createBookingService } from '../src/platform/booking-services';
import {
  createAuditService,
  createCatalogueService,
  createMediaService,
  createPartnerService,
  type MediaService,
} from '../src/platform/services';
import { InMemoryAuthRepository } from './helpers/in-memory-auth-repository';
import { InMemoryPlatformStore } from './helpers/in-memory-platform-store';
import { testEnv } from './helpers/test-env';

const AUDIENCE = 'web-client.apps.googleusercontent.com';
const CITY_ID = '11111111-1111-4111-8111-111111111111';
const UNAVAILABLE_CITY_ID = '11111111-1111-4111-8111-222222222222';
const CATEGORY_CODE = 'plumbing';

let authRepository: InMemoryAuthRepository;
let authService: AuthService;
let store: InMemoryPlatformStore;
let app: ReturnType<typeof createApp>;
let mediaService: MediaService;
let currentNonce: string;
let identity: GoogleIdentity;
let cloudinaryResource: CloudinaryResource | null;

function platformServices() {
  return {
    catalogueService: createCatalogueService(store),
    partnerService: createPartnerService(store),
    auditService: createAuditService(store),
    mediaService,
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
  cloudinaryResource = null;
  mediaService = createMediaService({
    store,
    config: {
      cloudName: 'fixyes-test',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
    },
    client: {
      getResource: async ({ publicId, resourceType, type }) =>
        cloudinaryResource ? { ...cloudinaryResource, publicId, resourceType, type } : null,
    },
  });

  app = createApp({
    authService,
    checkDatabase: async () => true,
    platform: platformServices(),
  });
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

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function onboard(token: string) {
  return app.request(
    '/v1/partner/onboarding',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        serviceCityId: CITY_ID,
        bio: 'Two decades of plumbing experience.',
        skills: [CATEGORY_CODE],
      }),
    },
    testEnv(),
  );
}

describe('M2 service catalogue', () => {
  it('serves enabled cities, zones, categories and items publicly', async () => {
    const cities = await app.request('/v1/service-cities', {}, testEnv());
    expect(cities.status).toBe(200);
    const cityBody = (await cities.json()) as { cities: { id: string }[] };
    expect(cityBody.cities.map((city) => city.id)).toEqual([CITY_ID]);

    const zones = await app.request(`/v1/service-zones?cityId=${CITY_ID}`, {}, testEnv());
    expect(zones.status).toBe(200);
    expect(await zones.json()).toMatchObject({ zones: [{ name: 'West Ahmedabad' }] });

    const categories = await app.request('/v1/service-categories', {}, testEnv());
    const categoryBody = (await categories.json()) as { categories: { code: string }[] };
    expect(categoryBody.categories.map((category) => category.code)).toEqual([
      'plumbing',
      'electrical',
    ]);

    const items = await app.request(
      `/v1/service-items?categoryId=22222222-2222-4222-8222-111111111111`,
      {},
      testEnv(),
    );
    expect(items.status).toBe(200);
    expect(await items.json()).toMatchObject({ items: [{ name: 'Tap repair' }] });
  });

  it('rejects invalid catalogue query parameters', async () => {
    const response = await app.request('/v1/service-zones?cityId=not-a-uuid', {}, testEnv());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('M2 admin authorization and audit logging', () => {
  it('requires an authenticated admin and writes an audit row for mutations', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Test Customer');

    const anonymous = await app.request(
      '/v1/admin/service-categories',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'cleaning', name: 'Cleaning' }),
      },
      testEnv(),
    );
    expect(anonymous.status).toBe(401);

    const forbidden = await app.request(
      '/v1/admin/service-categories',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ code: 'cleaning', name: 'Cleaning' }),
      },
      testEnv(),
    );
    expect(forbidden.status).toBe(403);

    authRepository.setRoles(customer.userId, ['ADMIN']);
    const created = await app.request(
      '/v1/admin/service-categories',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ code: 'cleaning', name: 'Cleaning', enabled: true }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);

    const audit = await app.request('/v1/admin/audit-logs', {
      headers: authHeaders(customer.token),
    }, testEnv());
    expect(audit.status).toBe(200);
    const body = (await audit.json()) as {
      items: { action: string; adminUserId: string; requestId: string | null }[];
    };
    expect(body.items[0]).toMatchObject({
      action: 'SERVICE_CATEGORY_CREATED',
      adminUserId: customer.userId,
      requestId: expect.any(String),
    });
  });

  it('returns 409 for a duplicate category code', async () => {
    const admin = await login('google-admin', 'admin@example.com', 'Admin');
    authRepository.setRoles(admin.userId, ['ADMIN']);

    const response = await app.request(
      '/v1/admin/service-categories',
      {
        method: 'POST',
        headers: authHeaders(admin.token),
        body: JSON.stringify({ code: 'plumbing', name: 'Plumbing duplicate' }),
      },
      testEnv(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'CATEGORY_EXISTS' } });
  });
});

describe('M2 partner onboarding and approval', () => {
  it('rejects onboarding in a disabled city or with a disabled skill', async () => {
    const partner = await login('google-partner', 'partner@example.com', 'Test Partner');

    const disabledCity = await app.request(
      '/v1/partner/onboarding',
      {
        method: 'POST',
        headers: authHeaders(partner.token),
        body: JSON.stringify({ serviceCityId: UNAVAILABLE_CITY_ID, skills: [CATEGORY_CODE] }),
      },
      testEnv(),
    );
    expect(disabledCity.status).toBe(400);
    expect(await disabledCity.json()).toMatchObject({ error: { code: 'CITY_NOT_AVAILABLE' } });

    const disabledSkill = await onboard(partner.token).then(() =>
      app.request(
        '/v1/partner/onboarding',
        {
          method: 'POST',
          headers: authHeaders(partner.token),
          body: JSON.stringify({ serviceCityId: CITY_ID, skills: ['retired'] }),
        },
        testEnv(),
      ),
    );
    expect(disabledSkill.status).toBe(400);
    expect(await disabledSkill.json()).toMatchObject({ error: { code: 'INVALID_SKILL' } });
  });

  it('creates a pending profile, lets an admin approve it, and records audit rows', async () => {
    const partner = await login('google-partner', 'partner@example.com', 'Test Partner');
    const response = await onboard(partner.token);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { profile: { status: string; userId: string } };
    expect(body.profile).toMatchObject({
      userId: partner.userId,
      status: 'PENDING_REVIEW',
    });

    const admin = await login('google-admin', 'admin@example.com', 'Admin');
    authRepository.setRoles(admin.userId, ['ADMIN']);

    const pending = await app.request(
      '/v1/admin/partners?status=PENDING_REVIEW',
      { headers: authHeaders(admin.token) },
      testEnv(),
    );
    const pendingBody = (await pending.json()) as { items: { userId: string }[] };
    expect(pendingBody.items.map((entry) => entry.userId)).toContain(partner.userId);

    const approve = await app.request(
      `/v1/admin/partners/${partner.userId}/approve`,
      {
        method: 'POST',
        headers: authHeaders(admin.token),
        body: JSON.stringify({ verifySkills: true }),
      },
      testEnv(),
    );
    expect(approve.status).toBe(200);
    expect(await approve.json()).toMatchObject({
      profile: {
        status: 'APPROVED',
        skills: [{ categoryCode: CATEGORY_CODE, verified: true }],
      },
    });

    const audit = await app.request(
      '/v1/admin/audit-logs',
      { headers: authHeaders(admin.token) },
      testEnv(),
    );
    const auditBody = (await audit.json()) as { items: { action: string; targetId: string }[] };
    expect(auditBody.items[0]).toMatchObject({
      action: 'PARTNER_APPROVED',
      targetId: partner.userId,
    });
  });

  it('suspends a partner with a required reason and audit entry', async () => {
    const partner = await login('google-partner', 'partner@example.com', 'Test Partner');
    await onboard(partner.token);

    const admin = await login('google-admin', 'admin@example.com', 'Admin');
    authRepository.setRoles(admin.userId, ['ADMIN']);

    const missingReason = await app.request(
      `/v1/admin/partners/${partner.userId}/suspend`,
      {
        method: 'POST',
        headers: authHeaders(admin.token),
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(missingReason.status).toBe(400);

    const suspended = await app.request(
      `/v1/admin/partners/${partner.userId}/suspend`,
      {
        method: 'POST',
        headers: authHeaders(admin.token),
        body: JSON.stringify({ reason: 'Repeated policy violations' }),
      },
      testEnv(),
    );
    expect(suspended.status).toBe(200);
    expect(await suspended.json()).toMatchObject({ profile: { status: 'SUSPENDED' } });

    expect(store.auditLogs.at(-1)).toMatchObject({
      action: 'PARTNER_SUSPENDED',
      targetId: partner.userId,
      reason: 'Repeated policy violations',
    });
  });

  it('rejects malformed and non-UUID partner list cursors', async () => {
    const admin = await login('google-admin', 'admin@example.com', 'Admin');
    authRepository.setRoles(admin.userId, ['ADMIN']);

    const malformed = await app.request(
      '/v1/admin/partners?cursor=not-a-cursor',
      { headers: authHeaders(admin.token) },
      testEnv(),
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: 'INVALID_CURSOR' } });

    const crafted = encodeCursor({ createdAt: new Date().toISOString(), id: 'not-a-uuid' });
    const nonUuid = await app.request(
      `/v1/admin/partners?cursor=${encodeURIComponent(crafted)}`,
      { headers: authHeaders(admin.token) },
      testEnv(),
    );
    expect(nonUuid.status).toBe(400);
    expect(await nonUuid.json()).toMatchObject({ error: { code: 'INVALID_CURSOR' } });
  });
});

describe('M2 Cloudinary signed uploads', () => {
  it('returns a signed avatar upload and independently matches the signature', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Test Customer');
    const response = await app.request(
      '/v1/media/signature',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ kind: 'AVATAR' }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      signature: {
        publicId: string;
        params: Record<string, string>;
        maxBytes: number;
        allowedFormats: string[];
      };
    };
    expect(body.signature.publicId).toMatch(
      new RegExp(`^fixyes/avatars/${customer.userId}/[0-9a-f-]{36}$`),
    );
    expect(body.signature.maxBytes).toBe(5 * 1024 * 1024);
    expect(body.signature.allowedFormats).toContain('webp');

    const expected = await signCloudinaryParams(
      {
        public_id: body.signature.params.public_id,
        timestamp: body.signature.params.timestamp,
      },
      'test-api-secret',
    );
    expect(body.signature.params.signature).toBe(expected);
  });

  it('requires a partner profile for private documents', async () => {
    const customer = await login('google-customer', 'customer@example.com', 'Test Customer');
    const response = await app.request(
      '/v1/media/signature',
      {
        method: 'POST',
        headers: authHeaders(customer.token),
        body: JSON.stringify({ kind: 'PARTNER_DOCUMENT' }),
      },
      testEnv(),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'PARTNER_PROFILE_REQUIRED' } });
  });

  it('confirms an uploaded document against Cloudinary metadata and enforces limits', async () => {
    const partner = await login('google-partner', 'partner@example.com', 'Test Partner');
    await onboard(partner.token);

    const signatureResponse = await app.request(
      '/v1/media/signature',
      {
        method: 'POST',
        headers: authHeaders(partner.token),
        body: JSON.stringify({ kind: 'PARTNER_DOCUMENT' }),
      },
      testEnv(),
    );
    expect(signatureResponse.status).toBe(200);
    const signature = (await signatureResponse.json()) as {
      signature: { publicId: string; params: Record<string, string> };
    };
    expect(signature.signature.params.type).toBe('authenticated');

    cloudinaryResource = {
      publicId: signature.signature.publicId,
      resourceType: 'image',
      type: 'authenticated',
      format: 'jpg',
      bytes: 1024,
      folder: 'fixyes/partner-documents',
      secureUrl: null,
    };

    const confirmed = await app.request(
      '/v1/media/confirm',
      {
        method: 'POST',
        headers: authHeaders(partner.token),
        body: JSON.stringify({ publicId: signature.signature.publicId }),
      },
      testEnv(),
    );
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({
      asset: { verified: true, format: 'jpg', bytes: 1024 },
    });

    const tooLarge = await app.request(
      '/v1/media/signature',
      {
        method: 'POST',
        headers: authHeaders(partner.token),
        body: JSON.stringify({ kind: 'PARTNER_DOCUMENT' }),
      },
      testEnv(),
    );
    const tooLargeBody = (await tooLarge.json()) as { signature: { publicId: string } };
    cloudinaryResource = {
      publicId: tooLargeBody.signature.publicId,
      resourceType: 'image',
      type: 'authenticated',
      format: 'jpg',
      bytes: 11 * 1024 * 1024,
      folder: 'fixyes/partner-documents',
      secureUrl: null,
    };

    const rejected = await app.request(
      '/v1/media/confirm',
      {
        method: 'POST',
        headers: authHeaders(partner.token),
        body: JSON.stringify({ publicId: tooLargeBody.signature.publicId }),
      },
      testEnv(),
    );
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({ error: { code: 'MEDIA_SIZE_NOT_ALLOWED' } });
  });

  it('does not let another user confirm someone else’s asset', async () => {
    const partner = await login('google-partner', 'partner@example.com', 'Test Partner');
    await onboard(partner.token);
    const signatureResponse = await app.request(
      '/v1/media/signature',
      {
        method: 'POST',
        headers: authHeaders(partner.token),
        body: JSON.stringify({ kind: 'AVATAR' }),
      },
      testEnv(),
    );
    const signature = (await signatureResponse.json()) as {
      signature: { publicId: string };
    };

    const other = await login('google-other', 'other@example.com', 'Other');
    const response = await app.request(
      '/v1/media/confirm',
      {
        method: 'POST',
        headers: authHeaders(other.token),
        body: JSON.stringify({ publicId: signature.signature.publicId }),
      },
      testEnv(),
    );
    expect(response.status).toBe(404);
  });
});
