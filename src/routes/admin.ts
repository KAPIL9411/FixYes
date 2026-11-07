import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { sha256Hex } from '../lib/crypto';
import { parseJson, parseQuery } from '../lib/validation';
import { notifyBooking } from '../notifications/route-hook';
import type { DispatchService } from '../platform/dispatch-services';
import type { CatalogueService, PartnerService, AuditService } from '../platform/services';
import type { AuditMeta } from '../platform/types';
import type { AppEnv } from '../types';

const uuidSchema = z.string().uuid();
const partnerStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
]);

const listPartnersQuery = z.object({
  status: partnerStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
});

const listAuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
});

const cityEnabledSchema = z.object({ enabled: z.boolean(), reason: z.string().max(500).optional() });
const createZoneSchema = z.object({
  cityId: z.string().uuid(),
  name: z.string().min(2).max(120),
  boundaryGeojson: z.record(z.string(), z.unknown()).nullable().optional(),
  enabled: z.boolean().default(false),
  reason: z.string().max(500).optional(),
});
const createCategorySchema = z.object({
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Code must contain only letters, numbers, dashes or underscores'),
  name: z.string().min(2).max(120),
  enabled: z.boolean().default(false),
  reason: z.string().max(500).optional(),
});
const createItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  basePrice: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'basePrice must be a positive INR amount with up to 2 decimals')
    .nullable()
    .optional(),
  enabled: z.boolean().default(false),
  reason: z.string().max(500).optional(),
});
const approveSchema = z.object({
  reason: z.string().max(500).optional(),
  verifySkills: z.boolean().default(true),
});
const suspendSchema = z.object({ reason: z.string().min(3).max(500) });
const assignBookingSchema = z.object({
  partnerId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().positive().optional(),
});

function uuidParam(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name);
  if (!value || !uuidSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_ID', `Invalid ${name}`);
  }
  return value;
}

async function auditMeta(c: Context<AppEnv>, reason: string | undefined): Promise<AuditMeta> {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  return {
    adminUserId: c.get('auth').user.id,
    reason: reason?.trim() || null,
    requestId: c.get('requestId'),
    ipHash: await sha256Hex(ip),
    userAgent: c.req.header('user-agent')?.slice(0, 200) ?? null,
  };
}

export interface AdminRouteDependencies {
  catalogueService: CatalogueService;
  partnerService: PartnerService;
  auditService: AuditService;
  dispatchService?: DispatchService;
}

export function createAdminRoutes(deps: AdminRouteDependencies) {
  return new Hono<AppEnv>()
    .patch('/service-cities/:cityId', async (c) => {
      const body = await parseJson(c, cityEnabledSchema);
      const city = await deps.catalogueService.setCityEnabled(
        uuidParam(c, 'cityId'),
        body.enabled,
        await auditMeta(c, body.reason),
      );
      return c.json({ city });
    })
    .post('/service-zones', async (c) => {
      const body = await parseJson(c, createZoneSchema);
      const zone = await deps.catalogueService.createZone(
        {
          cityId: body.cityId,
          name: body.name,
          boundaryGeojson: body.boundaryGeojson ?? null,
          enabled: body.enabled,
        },
        await auditMeta(c, body.reason),
      );
      return c.json({ zone }, 201);
    })
    .get('/service-categories', async (c) => {
      const categories = await deps.catalogueService.listCategories(false);
      return c.json({ categories });
    })
    .post('/service-categories', async (c) => {
      const body = await parseJson(c, createCategorySchema);
      const category = await deps.catalogueService.createCategory(
        { code: body.code, name: body.name, enabled: body.enabled },
        await auditMeta(c, body.reason),
      );
      return c.json({ category }, 201);
    })
    .post('/service-items', async (c) => {
      const body = await parseJson(c, createItemSchema);
      const item = await deps.catalogueService.createItem(
        {
          categoryId: body.categoryId,
          name: body.name,
          description: body.description ?? null,
          basePrice: body.basePrice ?? null,
          enabled: body.enabled,
        },
        await auditMeta(c, body.reason),
      );
      return c.json({ item }, 201);
    })
    .get('/partners', async (c) => {
      const query = parseQuery(c, listPartnersQuery);
      const partners = await deps.partnerService.listPartners(query);
      return c.json(partners);
    })
    .get('/partners/:partnerId', async (c) => {
      const profile = await deps.partnerService.getProfile(uuidParam(c, 'partnerId'));
      return c.json({ profile });
    })
    .post('/partners/:partnerId/approve', async (c) => {
      const body = await parseJson(c, approveSchema);
      const profile = await deps.partnerService.approve(
        uuidParam(c, 'partnerId'),
        c.get('auth').user.id,
        body.verifySkills,
        await auditMeta(c, body.reason),
      );
      return c.json({ profile });
    })
    .post('/partners/:partnerId/suspend', async (c) => {
      const body = await parseJson(c, suspendSchema);
      const profile = await deps.partnerService.suspend(
        uuidParam(c, 'partnerId'),
        c.get('auth').user.id,
        body.reason,
        await auditMeta(c, body.reason),
      );
      return c.json({ profile });
    })
    .post('/bookings/:bookingId/assign', async (c) => {
      if (!deps.dispatchService) {
        throw new AppError(503, 'DISPATCH_NOT_CONFIGURED', 'Dispatch is not configured');
      }
      const body = await parseJson(c, assignBookingSchema);
      const booking = await deps.dispatchService.assign(
        c.get('auth').user,
        uuidParam(c, 'bookingId'),
        body.partnerId,
        body.reason,
        await auditMeta(c, body.reason),
        body.expectedVersion,
      );
      notifyBooking(c, booking.id);
      return c.json({ booking });
    })
    .post('/bookings/:bookingId/reassign', async (c) => {
      if (!deps.dispatchService) {
        throw new AppError(503, 'DISPATCH_NOT_CONFIGURED', 'Dispatch is not configured');
      }
      const body = await parseJson(c, assignBookingSchema);
      const booking = await deps.dispatchService.reassign(
        c.get('auth').user,
        uuidParam(c, 'bookingId'),
        body.partnerId,
        body.reason,
        await auditMeta(c, body.reason),
        body.expectedVersion,
      );
      notifyBooking(c, booking.id);
      return c.json({ booking });
    })
    .get('/audit-logs', async (c) => {
      const query = parseQuery(c, listAuditQuery);
      const logs = await deps.auditService.list(query);
      return c.json(logs);
    });
}
