import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { parseJson } from '../lib/validation';
import { requireRole } from '../middleware/auth';
import { notifyBooking } from '../notifications/route-hook';
import type { DispatchService } from '../platform/dispatch-services';
import type { AppEnv } from '../types';

const uuidSchema = z.string().uuid();

const availabilitySchema = z
  .object({
    isOnline: z.boolean(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    message: 'latitude and longitude must be provided together',
    path: ['latitude'],
  });

const zonesSchema = z
  .object({
    zoneIds: z.array(z.string().uuid()).max(50),
  })
  .strict();

function offerId(c: Context<AppEnv>): string {
  const value = c.req.param('offerId');
  if (!value || !uuidSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_ID', 'Invalid offerId');
  }
  return value;
}

export function createPartnerDispatchRoutes(service: DispatchService) {
  return new Hono<AppEnv>()
    .get('/availability', requireRole('PARTNER'), async (c) => {
      const availability = await service.getAvailability(c.get('auth').user);
      return c.json({ availability });
    })
    .patch('/availability', requireRole('PARTNER'), async (c) => {
      const body = await parseJson(c, availabilitySchema);
      const availability = await service.setAvailability(c.get('auth').user, {
        isOnline: body.isOnline,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
      });
      return c.json({ availability });
    })
    .get('/service-zones', requireRole('PARTNER'), async (c) => {
      const zoneIds = await service.getZoneIds(c.get('auth').user);
      return c.json({ zoneIds });
    })
    .put('/service-zones', requireRole('PARTNER'), async (c) => {
      const body = await parseJson(c, zonesSchema);
      const zoneIds = await service.setZoneIds(c.get('auth').user, body.zoneIds);
      return c.json({ zoneIds });
    })
    .get('/offers', requireRole('PARTNER'), async (c) => {
      const offers = await service.listOffers(c.get('auth').user);
      return c.json({ offers });
    })
    .post('/offers/:offerId/accept', requireRole('PARTNER'), async (c) => {
      const booking = await service.acceptOffer(c.get('auth').user, offerId(c));
      notifyBooking(c, booking.id);
      return c.json({ booking });
    })
    .post('/offers/:offerId/reject', requireRole('PARTNER'), async (c) => {
      const booking = await service.rejectOffer(c.get('auth').user, offerId(c));
      notifyBooking(c, booking.id);
      return c.json({ booking });
    });
}
