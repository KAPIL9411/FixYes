import type { BookingStatus } from '../db/schema';
import type { BookingEvent } from '../platform/types';

export const REALTIME_SCHEMA_VERSION = 1;

export type RealtimeEventType =
  | 'BOOKING_CREATED'
  | 'BOOKING_STATUS_CHANGED'
  | 'DISPATCH_STARTED'
  | 'PARTNER_ASSIGNED'
  | 'BOOKING_ASSIGNED'
  | 'BOOKING_REASSIGNED'
  | 'NO_PARTNER_AVAILABLE';

export interface RealtimeEnvelope {
  eventId: string;
  bookingId: string;
  sequence: number | null;
  type: string;
  occurredAt: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
}

const SAFE_FIELDS: Record<string, string[]> = {
  BOOKING_CREATED: ['status', 'serviceItemId'],
  DISPATCH_STARTED: ['fromStatus', 'toStatus'],
  NO_PARTNER_AVAILABLE: ['fromStatus', 'toStatus'],
  BOOKING_STATUS_CHANGED: ['fromStatus', 'toStatus'],
  PARTNER_ASSIGNED: ['fromStatus', 'toStatus'],
  BOOKING_ASSIGNED: ['fromStatus', 'toStatus', 'adminOverride'],
  BOOKING_REASSIGNED: ['fromStatus', 'toStatus', 'adminOverride'],
};

const DEFAULT_SAFE_FIELDS = ['fromStatus', 'toStatus'];

/**
 * Booking event payloads carry free-text reasons, partner IDs and offer IDs.
 * Only the listed fields may leave the database boundary.
 */
export function redactEventData(
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = SAFE_FIELDS[eventType] ?? DEFAULT_SAFE_FIELDS;
  const output: Record<string, unknown> = {};
  for (const field of allowed) {
    if (payload[field] !== undefined) output[field] = payload[field];
  }
  return output;
}

export function toRealtimeEnvelope(event: BookingEvent): RealtimeEnvelope {
  return {
    eventId: event.id,
    bookingId: event.bookingId,
    sequence: event.sequence,
    type: event.eventType,
    occurredAt: event.createdAt,
    schemaVersion: REALTIME_SCHEMA_VERSION,
    payload: redactEventData(event.eventType, event.payload),
  };
}

export type PushAudience = 'CUSTOMER' | 'PARTNER';

export interface PushContent {
  title: string;
  body: string;
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  REQUESTED: 'We received your request',
  DISPATCHING: 'Finding a partner for you',
  PARTNER_ASSIGNED: 'A partner is assigned',
  PARTNER_ACCEPTED: 'Your partner accepted',
  ON_THE_WAY: 'Your partner is on the way',
  ARRIVED: 'Your partner has arrived',
  IN_PROGRESS: 'Service in progress',
  COMPLETION_PENDING: 'Confirm your service is complete',
  COMPLETED: 'Service completed',
  CANCELLED_BY_CUSTOMER: 'Booking cancelled',
  CANCELLED_BY_PARTNER: 'Partner cancelled the booking',
  CANCELLED_BY_ADMIN: 'Booking cancelled by support',
  NO_PARTNER_AVAILABLE: 'No partner available right now',
  DISPUTED: 'Support is reviewing your booking',
};

const PARTNER_STATUS_LABEL: Partial<Record<BookingStatus, string>> = {
  PARTNER_ASSIGNED: 'You have a new assigned job',
  PARTNER_ACCEPTED: 'Job confirmed',
  ON_THE_WAY: 'Job update: on the way',
  ARRIVED: 'Job update: arrived',
  IN_PROGRESS: 'Job in progress',
  COMPLETION_PENDING: 'Customer needs to confirm completion',
  COMPLETED: 'Job completed',
  CANCELLED_BY_CUSTOMER: 'Customer cancelled the booking',
  CANCELLED_BY_ADMIN: 'Support changed the booking',
};

function statusOf(payload: Record<string, unknown>): BookingStatus | null {
  const value = payload.toStatus ?? payload.status;
  return typeof value === 'string' && value in STATUS_LABEL
    ? (value as BookingStatus)
    : null;
}

export function pushContent(
  eventType: string,
  payload: Record<string, unknown>,
  audience: PushAudience,
): PushContent | null {
  const status = statusOf(payload);

  if (eventType === 'OFFER_CREATED') {
    return { title: 'New job offer', body: 'Open Fixyes to accept or decline this job.' };
  }

  if (audience === 'PARTNER') {
    if (!status) return null;
    const body = PARTNER_STATUS_LABEL[status];
    if (!body) return null;
    return {
      title: 'Fixyes job update',
      body: eventType === 'BOOKING_REASSIGNED' || eventType === 'BOOKING_ASSIGNED'
        ? 'Support assigned you a job'
        : body,
    };
  }

  if (eventType === 'DISPATCH_STARTED') return null;
  if (!status) return null;
  return {
    title: 'Fixyes booking update',
    body: STATUS_LABEL[status],
  };
}

export function pushData(
  envelope: RealtimeEnvelope,
): Record<string, string | number | null> {
  return {
    bookingId: envelope.bookingId,
    eventId: envelope.eventId,
    sequence: envelope.sequence,
    type: envelope.type,
    schemaVersion: envelope.schemaVersion,
  };
}
