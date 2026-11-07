import type { BookingStatus } from '../db/schema';
import { AppError } from '../lib/errors';

export type BookingActorRole = 'CUSTOMER' | 'PARTNER' | 'ADMIN' | 'SYSTEM';

type TransitionMap = Record<
  BookingStatus,
  Partial<Record<BookingStatus, readonly BookingActorRole[]>>
>;

export const BOOKING_TRANSITIONS: TransitionMap = {
  REQUESTED: {
    DISPATCHING: ['SYSTEM', 'ADMIN'],
    CANCELLED_BY_CUSTOMER: ['CUSTOMER'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
  DISPATCHING: {
    PARTNER_ASSIGNED: ['SYSTEM', 'ADMIN'],
    NO_PARTNER_AVAILABLE: ['SYSTEM', 'ADMIN'],
    CANCELLED_BY_CUSTOMER: ['CUSTOMER'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
  PARTNER_ASSIGNED: {
    PARTNER_ACCEPTED: ['PARTNER'],
    CANCELLED_BY_PARTNER: ['PARTNER'],
    CANCELLED_BY_CUSTOMER: ['CUSTOMER'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
  PARTNER_ACCEPTED: {
    ON_THE_WAY: ['PARTNER'],
    CANCELLED_BY_PARTNER: ['PARTNER'],
    CANCELLED_BY_CUSTOMER: ['CUSTOMER'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
  ON_THE_WAY: {
    ARRIVED: ['PARTNER'],
    CANCELLED_BY_PARTNER: ['PARTNER'],
    CANCELLED_BY_CUSTOMER: ['CUSTOMER'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
  ARRIVED: {
    IN_PROGRESS: ['PARTNER'],
    CANCELLED_BY_PARTNER: ['PARTNER'],
    CANCELLED_BY_CUSTOMER: ['CUSTOMER'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
  IN_PROGRESS: {
    COMPLETION_PENDING: ['PARTNER'],
    CANCELLED_BY_CUSTOMER: ['CUSTOMER'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
  COMPLETION_PENDING: {
    COMPLETED: ['CUSTOMER', 'ADMIN', 'SYSTEM'],
    DISPUTED: ['CUSTOMER', 'ADMIN'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
  COMPLETED: {},
  CANCELLED_BY_CUSTOMER: {},
  CANCELLED_BY_PARTNER: {},
  CANCELLED_BY_ADMIN: {},
  NO_PARTNER_AVAILABLE: {},
  DISPUTED: {
    COMPLETED: ['ADMIN'],
    CANCELLED_BY_ADMIN: ['ADMIN'],
  },
};

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActorRole,
): boolean {
  return BOOKING_TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function assertTransitionAllowed(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActorRole,
): void {
  if (!canTransition(from, to, actor)) {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Booking cannot move from ${from} to ${to} for ${actor}`,
    );
  }
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return Object.keys(BOOKING_TRANSITIONS[status]).length === 0;
}
