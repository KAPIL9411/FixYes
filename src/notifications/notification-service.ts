import type { RealtimeEnvelope } from '../domain/realtime';
import { pushContent, type PushAudience } from '../domain/realtime';
import { isDeviceNotRegistered, type ExpoPushMessage, type ExpoPushSender } from './expo-push';
import { log } from '../lib/logger';
import { systemClock, type Clock } from '../lib/clock';
import type { PlatformStore } from '../platform/store-contract';
import type { CreateDeliveryInput, NotificationDelivery, OutboxEvent } from '../platform/types';
import type { RealtimeGateway } from '../realtime/gateway';

export interface NotificationConfig {
  batchSize: number;
  deliveryBatchSize: number;
  maxOutboxAttempts: number;
  maxDeliveryAttempts: number;
  backoffBaseMs: number;
  backoffCapMs: number;
  receiptDelayMs: number;
  receiptBatchSize: number;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  batchSize: 25,
  deliveryBatchSize: 50,
  maxOutboxAttempts: 5,
  maxDeliveryAttempts: 4,
  backoffBaseMs: 15_000,
  backoffCapMs: 15 * 60_000,
  receiptDelayMs: 60_000,
  receiptBatchSize: 100,
};

export interface DrainSummary {
  claimed: number;
  processed: number;
  retried: number;
  dead: number;
  deliveries: number;
  sent: number;
  failed: number;
}

function emptySummary(): DrainSummary {
  return { claimed: 0, processed: 0, retried: 0, dead: 0, deliveries: 0, sent: 0, failed: 0 };
}

export interface NotificationService {
  drainDue(): Promise<DrainSummary>;
  drainBooking(bookingId: string): Promise<DrainSummary>;
  retryDueDeliveries(now?: Date): Promise<{ attempted: number; sent: number; failed: number }>;
  reconcileReceipts(now?: Date): Promise<{ checked: number; delivered: number; failed: number }>;
}

export interface NotificationServiceOptions {
  store: PlatformStore;
  realtime: RealtimeGateway;
  push: ExpoPushSender | null;
  clock?: Clock;
  config?: Partial<NotificationConfig>;
}

/**
 * Post-commit fan-out trigger. The route response never waits for realtime or
 * push work; the cron drain is the durable fallback.
 */
export interface WaitUntilRunner {
  waitUntil(promise: Promise<unknown>): void;
}

export interface BookingNotifier {
  notify(bookingId: string, ctx: WaitUntilRunner): void;
}

export function createBookingNotifier(service?: NotificationService): BookingNotifier {
  if (!service) return { notify: () => undefined };
  return {
    notify(bookingId, ctx) {
      ctx.waitUntil(
        service
          .drainBooking(bookingId)
          .then(() => undefined)
          .catch((error) => log('warn', { event: 'notification_kick_failed', bookingId, error })),
      );
    },
  };
}

interface PushTarget {
  userId: string;
  audience: PushAudience;
  eventType: string;
  payload: Record<string, unknown>;
  data: Record<string, unknown>;
}

function backoff(attempts: number, config: NotificationConfig): number {
  return Math.min(config.backoffBaseMs * 2 ** Math.max(0, attempts - 1), config.backoffCapMs);
}

function asEnvelope(value: unknown): RealtimeEnvelope | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.eventId !== 'string' ||
    typeof candidate.bookingId !== 'string' ||
    typeof candidate.type !== 'string' ||
    typeof candidate.payload !== 'object' ||
    candidate.payload === null
  ) {
    return null;
  }
  return candidate as unknown as RealtimeEnvelope;
}

export function createNotificationService(
  options: NotificationServiceOptions,
): NotificationService {
  const store = options.store;
  const realtime = options.realtime;
  const push = options.push;
  const clock = options.clock ?? systemClock;
  const config: NotificationConfig = { ...DEFAULT_NOTIFICATION_CONFIG, ...options.config };

  async function pushTargets(row: OutboxEvent): Promise<PushTarget[]> {
    const booking = await store.getBooking(row.aggregateId);
    if (!booking) return [];

    if (row.eventType === 'DISPATCH_OFFER_CREATED') {
      const partnerUserId = row.payload.partnerUserId;
      if (typeof partnerUserId !== 'string') return [];
      return [
        {
          userId: partnerUserId,
          audience: 'PARTNER',
          eventType: 'OFFER_CREATED',
          payload: {},
          data: {
            bookingId: row.aggregateId,
            offerId: row.payload.offerId ?? null,
            expiresAt: row.payload.expiresAt ?? null,
          },
        },
      ];
    }

    if (row.eventType !== 'BOOKING_EVENT') return [];
    const envelope = asEnvelope(row.payload.envelope);
    if (!envelope) return [];
    const actorUserId = typeof row.payload.actorUserId === 'string' ? row.payload.actorUserId : null;

    const targets: PushTarget[] = [];
    const data = {
      bookingId: booking.id,
      eventId: envelope.eventId,
      sequence: envelope.sequence,
      type: envelope.type,
    };

    if (booking.customerUserId !== actorUserId) {
      targets.push({
        userId: booking.customerUserId,
        audience: 'CUSTOMER',
        eventType: envelope.type,
        payload: envelope.payload,
        data,
      });
    }
    if (booking.partnerUserId && booking.partnerUserId !== actorUserId) {
      targets.push({
        userId: booking.partnerUserId,
        audience: 'PARTNER',
        eventType: envelope.type,
        payload: envelope.payload,
        data,
      });
    }

    return targets.filter(
      (target) => pushContent(target.eventType, target.payload, target.audience) !== null,
    );
  }

  async function planDeliveries(row: OutboxEvent): Promise<CreateDeliveryInput[]> {
    const targets = await pushTargets(row);
    if (targets.length === 0) return [];
    const tokens = await store.activePushTokensForUsers([
      ...new Set(targets.map((target) => target.userId)),
    ]);
    const inputs: CreateDeliveryInput[] = [];
    for (const target of targets) {
      for (const token of tokens.filter((entry) => entry.userId === target.userId)) {
        inputs.push({
          userId: target.userId,
          pushTokenId: token.id,
          bookingId: row.aggregateId,
          outboxEventId: row.id,
          eventType: target.eventType,
        });
      }
    }
    return inputs;
  }

  async function buildMessage(
    delivery: NotificationDelivery,
  ): Promise<{ message: ExpoPushMessage; token: string } | null> {
    const token = delivery.pushTokenId ? await store.getPushToken(delivery.pushTokenId) : null;
    if (!token || !token.active) return null;

    const outbox = delivery.outboxEventId ? await store.getOutboxEvent(delivery.outboxEventId) : null;
    const booking = outbox ? await store.getBooking(outbox.aggregateId) : null;
    if (!outbox || !booking) return null;

    const audience: PushAudience =
      booking.customerUserId === delivery.userId ? 'CUSTOMER' : 'PARTNER';
    let eventType = delivery.eventType;
    let payload: Record<string, unknown> = {};

    if (outbox.eventType === 'DISPATCH_OFFER_CREATED') {
      eventType = 'OFFER_CREATED';
    } else {
      const envelope = asEnvelope(outbox.payload.envelope);
      if (!envelope) return null;
      payload = envelope.payload;
    }

    const content = pushContent(eventType, payload, audience);
    if (!content) return null;
    return {
      token: token.expoPushToken,
      message: {
        to: token.expoPushToken,
        title: content.title,
        body: content.body,
        data: { bookingId: booking.id, deliveryId: delivery.id, type: eventType },
        sound: 'default',
      },
    };
  }

  async function sendDeliveries(
    deliveries: NotificationDelivery[],
    now: Date,
  ): Promise<{ sent: number; failed: number }> {
    if (deliveries.length === 0 || !push) return { sent: 0, failed: 0 };

    const built: {
      delivery: NotificationDelivery;
      message: ExpoPushMessage;
      token: string;
    }[] = [];
    let failed = 0;

    for (const delivery of deliveries) {
      const builtMessage = await buildMessage(delivery);
      if (!builtMessage) {
        await store.updateNotificationDelivery(
          delivery.id,
          {
            status: 'FAILED',
            errorCode: 'PUSH_TOKEN_UNAVAILABLE',
            attempts: delivery.attempts + 1,
            nextAttemptAt: null,
          },
          now,
        );
        failed += 1;
        continue;
      }
      built.push({ ...builtMessage, delivery });
    }

    if (built.length === 0) return { sent: 0, failed };

    let tickets;
    try {
      tickets = await push.send(built.map((entry) => entry.message));
    } catch (error) {
      for (const entry of built) {
        const attempts = entry.delivery.attempts + 1;
        await store.updateNotificationDelivery(
          entry.delivery.id,
          {
            status: 'FAILED',
            errorCode: 'EXPO_REQUEST_FAILED',
            attempts,
            nextAttemptAt:
              attempts >= config.maxDeliveryAttempts
                ? null
                : new Date(now.getTime() + backoff(attempts, config)),
          },
          now,
        );
        failed += 1;
      }
      log('warn', { event: 'expo_push_request_failed', count: built.length, error });
      return { sent: 0, failed };
    }

    let sent = 0;
    for (const [index, entry] of built.entries()) {
      const ticket = tickets[index] ?? { status: 'error' as const };
      const attempts = entry.delivery.attempts + 1;

      if (ticket.status === 'ok' && ticket.id) {
        await store.updateNotificationDelivery(
          entry.delivery.id,
          { status: 'SENT', expoTicketId: ticket.id, attempts, errorCode: null, nextAttemptAt: null },
          now,
        );
        sent += 1;
        continue;
      }

      const dead = isDeviceNotRegistered(ticket);
      if (dead) {
        await store.deactivatePushTokenByValue(entry.token, now);
      }
      await store.updateNotificationDelivery(
        entry.delivery.id,
        {
          status: 'FAILED',
          errorCode: dead ? 'DEVICE_NOT_REGISTERED' : (ticket.details?.error ?? 'PUSH_TICKET_ERROR'),
          attempts,
          nextAttemptAt:
            dead || attempts >= config.maxDeliveryAttempts
              ? null
              : new Date(now.getTime() + backoff(attempts, config)),
        },
        now,
      );
      failed += 1;
    }
    return { sent, failed };
  }

  async function processRow(row: OutboxEvent, now: Date, summary: DrainSummary): Promise<void> {
    let realtimeFailed = false;
    if (row.eventType === 'BOOKING_EVENT') {
      const envelope = asEnvelope(row.payload.envelope);
      if (envelope) {
        try {
          await realtime.publish(envelope.bookingId, envelope);
        } catch (error) {
          realtimeFailed = true;
          log('warn', { event: 'realtime_publish_failed', bookingId: envelope.bookingId, error });
        }
      }
    }

    let deliveries = await store.listDeliveriesByOutboxEvent(row.id);
    if (deliveries.length === 0 && push) {
      deliveries = await store.createNotificationDeliveries(await planDeliveries(row));
    }
    const unsent = deliveries.filter((delivery) => delivery.status === 'PENDING');
    summary.deliveries += deliveries.length;
    if (unsent.length > 0) {
      const { sent, failed } = await sendDeliveries(unsent, now);
      summary.sent += sent;
      summary.failed += failed;
    }

    if (!realtimeFailed) {
      await store.markOutboxProcessed([row.id], now);
      summary.processed += 1;
      return;
    }

    if (row.attempts >= config.maxOutboxAttempts) {
      await store.markOutboxProcessed([row.id], now);
      summary.dead += 1;
      log('error', {
        event: 'outbox_dead_letter',
        outboxId: row.id,
        bookingId: row.aggregateId,
        attempts: row.attempts,
      });
      return;
    }

    await store.markOutboxRetry(
      [row.id],
      now,
      new Date(now.getTime() + backoff(row.attempts, config)),
      'REALTIME_PUBLISH_FAILED',
    );
    summary.retried += 1;
  }

  async function drain(summary: DrainSummary, bookingId?: string): Promise<DrainSummary> {
    const now = clock.now();
    const rows = await store.claimOutboxEvents(now, config.batchSize, bookingId);
    summary.claimed += rows.length;
    for (const row of rows) {
      await processRow(row, now, summary);
    }
    return summary;
  }

  return {
    async drainDue() {
      return drain(emptySummary());
    },

    async drainBooking(bookingId) {
      return drain(emptySummary(), bookingId);
    },

    async retryDueDeliveries(now = clock.now()) {
      const deliveries = await store.listDueDeliveries(now, config.deliveryBatchSize);
      const { sent, failed } = await sendDeliveries(deliveries, now);
      return { attempted: deliveries.length, sent, failed };
    },

    async reconcileReceipts(now = clock.now()) {
      if (!push) return { checked: 0, delivered: 0, failed: 0 };
      const deliveries = await store.listDeliveriesForReceipts(
        now,
        config.receiptDelayMs,
        config.receiptBatchSize,
      );
      const ticketIds = deliveries
        .map((delivery) => delivery.expoTicketId)
        .filter((id): id is string => typeof id === 'string');
      if (ticketIds.length === 0) return { checked: 0, delivered: 0, failed: 0 };

      const receipts = await push.getReceipts(ticketIds);
      let delivered = 0;
      let failed = 0;

      for (const delivery of deliveries) {
        const receipt = delivery.expoTicketId ? receipts.get(delivery.expoTicketId) : undefined;
        if (!receipt) continue;
        if (receipt.status === 'ok') {
          await store.updateNotificationDelivery(delivery.id, { status: 'RECEIPT_OK' }, now);
          delivered += 1;
          continue;
        }
        if (isDeviceNotRegistered(receipt)) {
          const token = delivery.pushTokenId ? await store.getPushToken(delivery.pushTokenId) : null;
          if (token) await store.deactivatePushTokenByValue(token.expoPushToken, now);
        }
        await store.updateNotificationDelivery(
          delivery.id,
          { status: 'RECEIPT_ERROR', errorCode: receipt.details?.error ?? 'RECEIPT_ERROR' },
          now,
        );
        failed += 1;
      }
      return { checked: deliveries.length, delivered, failed };
    },
  };
}
