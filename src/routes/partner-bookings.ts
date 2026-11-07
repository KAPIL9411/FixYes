import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { parseJson } from '../lib/validation';
import { requireRole } from '../middleware/auth';
import { notifyBooking } from '../notifications/route-hook';
import type { BookingService } from '../platform/booking-services';
import type { AppEnv } from '../types';

const uuidSchema = z.string().uuid();

const partnerStatuses = [
  'PARTNER_ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETION_PENDING',
  'CANCELLED_BY_PARTNER',
] as const;

const statusSchema = z
  .object({
    status: z.enum(partnerStatuses),
    reason: z.string().trim().max(500).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

function bookingId(c: Context<AppEnv>): string {
  const value = c.req.param('bookingId');
  if (!value || !uuidSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_ID', 'Invalid bookingId');
  }
  return value;
}

export function createPartnerBookingRoutes(service: BookingService) {
  return new Hono<AppEnv>().post('/:bookingId/status', requireRole('PARTNER'), async (c) => {
    const body = await parseJson(c, statusSchema);
    const booking = await service.partnerStatus(
      c.get('auth').user,
      bookingId(c),
      body.status,
      body.reason,
      body.expectedVersion,
    );
    notifyBooking(c, booking.id);
    return c.json({ booking });
  });
}
