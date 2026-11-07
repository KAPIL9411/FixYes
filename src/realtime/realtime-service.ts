import type { AppRole } from '../db/schema';
import type { AuthUser } from '../auth/service';
import { assertCanAccessBooking, type PolicyUser } from '../auth/policy';
import { AppError } from '../lib/errors';
import { systemClock, type Clock } from '../lib/clock';
import { issueTicket } from './ticket';
import type { PlatformStore } from '../platform/store-contract';

export interface RealtimeTicket {
  ticket: string;
  expiresAt: string;
  websocketPath: string;
  protocol: string;
  schemaVersion: number;
}

export interface RealtimeService {
  issue(actor: AuthUser, bookingId: string): Promise<RealtimeTicket>;
}

export interface RealtimeServiceOptions {
  store: PlatformStore;
  secret: string;
  clock?: Clock;
  ttlMs?: number;
}

function toPolicyUser(actor: AuthUser): PolicyUser {
  return { id: actor.id, roles: actor.roles, accountDisabled: false };
}

function roleFor(actor: AuthUser, customerUserId: string): AppRole {
  if (actor.roles.includes('ADMIN')) return 'ADMIN';
  if (customerUserId === actor.id) return 'CUSTOMER';
  return 'PARTNER';
}

export function createRealtimeService({
  store,
  secret,
  clock = systemClock,
  ttlMs,
}: RealtimeServiceOptions): RealtimeService {
  return {
    async issue(actor, bookingId) {
      const booking = await store.getBooking(bookingId);
      if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');

      const now = clock.now();
      const offeredPartnerUserIds = (await store.listDispatchOffersForBooking(booking.id))
        .filter(
          (offer) =>
            offer.status === 'PENDING' && new Date(offer.expiresAt).getTime() > now.getTime(),
        )
        .map((offer) => offer.partnerUserId);

      assertCanAccessBooking(toPolicyUser(actor), {
        customerUserId: booking.customerUserId,
        partnerUserId: booking.partnerUserId,
        offeredPartnerUserIds,
      });

      const { ticket, expiresAt } = await issueTicket(
        { bookingId: booking.id, userId: actor.id, role: roleFor(actor, booking.customerUserId) },
        secret,
        now,
        ttlMs,
      );

      return {
        ticket,
        expiresAt: expiresAt.toISOString(),
        websocketPath: `/v1/realtime/bookings/${booking.id}/ws`,
        protocol: 'fixyes-realtime',
        schemaVersion: 1,
      };
    },
  };
}
