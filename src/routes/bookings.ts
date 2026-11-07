import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { readIdempotencyKey } from '../lib/idempotency';
import { parseJson, parseQuery } from '../lib/validation';
import { requireRole } from '../middleware/auth';
import { notifyBooking } from '../notifications/route-hook';
import type { BookingService } from '../platform/booking-services';
import type { DispatchService } from '../platform/dispatch-services';
import type { AppEnv } from '../types';

const uuidSchema = z.string().uuid();

const createBookingSchema = z
  .object({
    serviceItemId: z.string().uuid(),
    addressId: z.string().uuid(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const cancelSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

const completeSchema = z
  .object({
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

const eventsQuery = z.object({
  afterSequence: z.coerce.number().int().min(0).default(0),
});

function bookingId(c: Context<AppEnv>): string {
  const value = c.req.param('bookingId');
  if (!value || !uuidSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_ID', 'Invalid bookingId');
  }
  return value;
}

export function createBookingRoutes(service: BookingService, dispatchService?: DispatchService) {
  return new Hono<AppEnv>()
    .post('/', requireRole('CUSTOMER'), async (c) => {
      const idempotencyKey = readIdempotencyKey(c);
      const body = await parseJson(c, createBookingSchema);
      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      const result = await service.create(
        c.get('auth').user,
        {
          serviceItemId: body.serviceItemId,
          addressId: body.addressId,
          scheduledAt,
        },
        idempotencyKey,
      );
      let booking = result.booking;
      if (
        dispatchService &&
        (booking.status === 'REQUESTED' || booking.status === 'DISPATCHING')
      ) {
        booking = await dispatchService.start(booking.id);
      }
      notifyBooking(c, booking.id);
      c.header('Idempotent-Replay', result.replayed ? 'true' : 'false');
      return c.json({ booking }, result.replayed ? 200 : 201);
    })
    .get('/:bookingId/events', async (c) => {
      const query = parseQuery(c, eventsQuery);
      const events = await service.events(c.get('auth').user, bookingId(c), query.afterSequence);
      return c.json({ events });
    })
    .get('/:bookingId', async (c) => {
      const booking = await service.get(c.get('auth').user, bookingId(c));
      return c.json({ booking });
    })
    .post('/:bookingId/cancel', requireRole('CUSTOMER'), async (c) => {
      const body = await parseJson(c, cancelSchema);
      const booking = await service.cancel(
        c.get('auth').user,
        bookingId(c),
        body.reason,
        body.expectedVersion,
      );
      notifyBooking(c, booking.id);
      return c.json({ booking });
    })
    .post('/:bookingId/complete', requireRole('CUSTOMER'), async (c) => {
      const body = await parseJson(c, completeSchema);
      const booking = await service.complete(
        c.get('auth').user,
        bookingId(c),
        body.expectedVersion,
      );
      notifyBooking(c, booking.id);
      return c.json({ booking });
    });
}
