import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_CONFIG,
  createNotificationService,
} from '../src/notifications/notification-service';
import {
  ExpoPushTransientError,
  createExpoPushSender,
  type ExpoOutcome,
  type ExpoPushMessage,
  type ExpoPushSender,
  type ExpoTicket,
} from '../src/notifications/expo-push';
import type { RealtimeEnvelope } from '../src/domain/realtime';
import type { RealtimeGateway } from '../src/realtime/gateway';
import type { Booking } from '../src/platform/types';
import { InMemoryPlatformStore } from './helpers/in-memory-platform-store';
import { TestClock } from './helpers/test-clock';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_TOKEN = 'ExponentPushToken[customer]';
const PARTNER_TOKEN = 'ExponentPushToken[partner]';

let store: InMemoryPlatformStore;
let clock: TestClock;
let published: RealtimeEnvelope[];
let gateway: RealtimeGateway;

interface PushHarness {
  sender: ExpoPushSender;
  batches: ExpoPushMessage[][];
  receiptRequests: string[][];
}

function createPushHarness(
  ticketFor: (message: ExpoPushMessage, index: number) => ExpoTicket = () => ({
    status: 'ok',
    id: 'ticket-placeholder',
  }),
  receipts: Map<string, ExpoOutcome> = new Map(),
): PushHarness {
  const batches: ExpoPushMessage[][] = [];
  const receiptRequests: string[][] = [];
  return {
    batches,
    receiptRequests,
    sender: {
      send: async (messages) => {
        const index = batches.reduce((total, batch) => total + batch.length, 0);
        batches.push(messages);
        return messages.map((message, offset) => ticketFor(message, index + offset));
      },
      getReceipts: async (ids) => {
        receiptRequests.push(ids);
        return receipts;
      },
    },
  };
}

function okTickets(): (message: ExpoPushMessage, index: number) => ExpoTicket {
  return (_message, index) => ({ status: 'ok', id: `ticket-${index}` });
}

async function service(options: { push?: PushHarness | null; failRealtime?: boolean } = {}) {
  const gatewayImpl = gateway;
  return createNotificationService({
    store,
    realtime: options.failRealtime
      ? { publish: async () => { throw new Error('room unavailable'); } }
      : gatewayImpl,
    push: options.push === null ? null : (options.push ?? createPushHarness()).sender,
    clock,
  });
}

async function assignedBooking(): Promise<Booking> {
  const booking = store.seedBooking({
    customerUserId: CUSTOMER,
    partnerUserId: PARTNER,
    status: 'PARTNER_ASSIGNED',
  });
  store.outbox.length = 0;
  published = [];
  return booking;
}

async function onTheWay(booking: Booking, actorUserId: string | null): Promise<void> {
  await store.transitionBooking({
    bookingId: booking.id,
    actorUserId,
    fromStatus: 'PARTNER_ASSIGNED',
    toStatus: 'ON_THE_WAY',
    expectedVersion: booking.version,
    eventType: 'BOOKING_STATUS_CHANGED',
    payload: {
      fromStatus: 'PARTNER_ASSIGNED',
      toStatus: 'ON_THE_WAY',
      reason: 'partner private notes',
      partnerPhone: '+919000000000',
    },
  });
}

async function registerTokens(): Promise<void> {
  await store.upsertPushToken({
    userId: CUSTOMER,
    expoPushToken: CUSTOMER_TOKEN,
    devicePlatform: 'android',
  });
  await store.upsertPushToken({
    userId: PARTNER,
    expoPushToken: PARTNER_TOKEN,
    devicePlatform: 'ios',
  });
}

beforeEach(() => {
  store = new InMemoryPlatformStore();
  // The in-memory store stamps rows with wall time, so the fake clock starts just ahead of it.
  clock = new TestClock(new Date(Date.now() + 10_000).toISOString());
  published = [];
  gateway = { publish: async (_bookingId, envelope) => { published.push(envelope); } };
});

describe('M5 outbox fan-out', () => {
  it('redacts private fields before an event leaves the database', async () => {
    const booking = await assignedBooking();
    await onTheWay(booking, PARTNER);
    const row = store.outbox.at(-1)!;
    const envelope = row.payload.envelope as RealtimeEnvelope;
    expect(envelope.payload).toEqual({ fromStatus: 'PARTNER_ASSIGNED', toStatus: 'ON_THE_WAY' });
    expect(JSON.stringify(row.payload)).not.toMatch(/private notes|919000000000/);
  });

  it('publishes the committed event and pushes to the waiting participant', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, PARTNER);

    const push = createPushHarness(okTickets());
    const summary = await (await service({ push })).drainDue();

    expect(summary).toMatchObject({ claimed: 1, processed: 1, sent: 1, failed: 0 });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ type: 'BOOKING_STATUS_CHANGED', bookingId: booking.id });
    expect(push.batches[0]).toHaveLength(1);
    expect(push.batches[0][0]).toMatchObject({
      to: CUSTOMER_TOKEN,
      title: 'Fixyes booking update',
      body: 'Your partner is on the way',
    });
    expect(store.deliveries[0]).toMatchObject({ status: 'SENT', expoTicketId: 'ticket-0' });
    expect(store.outbox[0].processedAt).not.toBeNull();
  });

  it('never notifies an actor about their own action', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, CUSTOMER);

    const push = createPushHarness(okTickets());
    await (await service({ push })).drainDue();

    expect(push.batches[0].map((message) => message.to)).toEqual([PARTNER_TOKEN]);
  });

  it('drops an audience that has no label for the status', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await store.transitionBooking({
      bookingId: booking.id,
      actorUserId: PARTNER,
      fromStatus: 'PARTNER_ASSIGNED',
      toStatus: 'DISPATCHING',
      expectedVersion: booking.version,
      eventType: 'DISPATCH_STARTED',
      payload: { fromStatus: 'PARTNER_ASSIGNED', toStatus: 'DISPATCHING' },
    });

    const push = createPushHarness(okTickets());
    const summary = await (await service({ push })).drainDue();

    expect(published).toHaveLength(1);
    expect(summary.sent).toBe(0);
    expect(push.batches).toHaveLength(0);
  });

  it('notifies only the offered partner about a dispatch offer', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await store.createDispatchAttempt({
      bookingId: booking.id,
      candidateCount: 2,
      outcome: 'OFFERED',
      partnerUserId: PARTNER,
      expiresAt: new Date(clock.now().getTime() + 60_000),
      score: '0.5000',
    });

    const push = createPushHarness(okTickets());
    await (await service({ push })).drainDue();

    expect(published).toHaveLength(0);
    expect(push.batches[0]).toHaveLength(1);
    expect(push.batches[0][0]).toMatchObject({ to: PARTNER_TOKEN, title: 'New job offer' });
    expect(JSON.stringify(push.batches[0][0]!.data)).not.toMatch(/private|phone/i);
  });

  it('drains only the requested booking', async () => {
    const first = await assignedBooking();
    const second = store.seedBooking({ customerUserId: PARTNER, status: 'REQUESTED' });
    await onTheWay(first, PARTNER);

    const scoped = await (await service({ push: createPushHarness() })).drainBooking(first.id);
    expect(scoped.claimed).toBe(1);
    expect(store.outbox.find((row) => row.aggregateId === second.id)!.processedAt).toBeNull();
    expect(
      store.outbox.filter((row) => row.aggregateId === first.id && !row.processedAt),
    ).toHaveLength(0);
  });

  it('does not create duplicate deliveries when a retry replays the row', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, PARTNER);

    const push = createPushHarness(okTickets());
    const failing = createNotificationService({
      store,
      realtime: {
        publish: async () => {
          throw new Error('room unavailable');
        },
      },
      push: push.sender,
      clock,
    });

    await failing.drainDue();
    clock.advance(DEFAULT_NOTIFICATION_CONFIG.backoffCapMs);
    await failing.drainDue();

    expect(store.deliveries).toHaveLength(1);
    expect(push.batches).toHaveLength(1);
  });

  it('retries a row whose realtime publish failed and settles it', async () => {
    const booking = await assignedBooking();
    await onTheWay(booking, PARTNER);

    const failing = await service({ push: null, failRealtime: true });
    const first = await failing.drainDue();
    expect(first).toMatchObject({ claimed: 1, processed: 0, retried: 1 });
    expect(store.outbox[0]).toMatchObject({ processedAt: null, attempts: 1, lastError: 'REALTIME_PUBLISH_FAILED' });

    clock.advance(DEFAULT_NOTIFICATION_CONFIG.backoffCapMs);
    const second = await (await service({ push: null })).drainDue();
    expect(second.processed).toBe(1);
    expect(store.outbox[0].processedAt).not.toBeNull();
  });

  it('dead-letters a row once the attempt budget is spent', async () => {
    const booking = await assignedBooking();
    await onTheWay(booking, PARTNER);

    const failing = await service({ push: null, failRealtime: true });
    for (let attempt = 0; attempt < DEFAULT_NOTIFICATION_CONFIG.maxOutboxAttempts; attempt += 1) {
      await failing.drainDue();
      clock.advance(DEFAULT_NOTIFICATION_CONFIG.backoffCapMs);
    }

    expect(store.outbox[0].processedAt).not.toBeNull();
    expect(store.outbox[0].attempts).toBe(DEFAULT_NOTIFICATION_CONFIG.maxOutboxAttempts);
    expect((await (await service({ push: null })).drainDue()).claimed).toBe(0);
  });

  it('pushes nothing when no participant has a token', async () => {
    const booking = await assignedBooking();
    await onTheWay(booking, PARTNER);

    const push = createPushHarness(okTickets());
    const summary = await (await service({ push })).drainDue();

    expect(summary.deliveries).toBe(0);
    expect(push.batches).toHaveLength(0);
    expect(store.outbox[0].processedAt).not.toBeNull();
  });
});

describe('M5 Expo push transport', () => {
  function message(index: number): ExpoPushMessage {
    return {
      to: `ExponentPushToken[device-${index}]`,
      title: 'Fixyes booking update',
      body: 'Your partner is on the way',
      data: { bookingId: 'booking' },
    };
  }

  it('batches sends and receipts within the documented limits', async () => {
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as unknown;
      calls.push({
        url: String(input),
        body,
        auth: (init?.headers as Record<string, string> | undefined)?.authorization ?? null,
      });
      const data = Array.isArray(body)
        ? body.map((_, index) => ({ status: 'ok', id: `ticket-${index}` }))
        : Object.fromEntries(
            (Object.keys((body as { ids: string[] }).ids) ?? []).map((key) => [
              (body as { ids: string[] }).ids[Number(key)],
              { status: 'ok' },
            ]),
          );
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const sender = createExpoPushSender({ EXPO_ACCESS_TOKEN: '' }, fetchImpl);
    const tickets = await sender.send(Array.from({ length: 150 }, (_, index) => message(index)));
    expect(tickets).toHaveLength(150);
    expect(calls[0].body).toHaveLength(100);
    expect(calls[1].body).toHaveLength(50);
    expect(calls[0].auth).toBeNull();

    const receipts = await sender.getReceipts(Array.from({ length: 1200 }, (_, i) => `t${i}`));
    expect(receipts.size).toBe(1200);
    expect(receipts.get('t0')).toEqual({ status: 'ok' });
  });

  it('retries transient transport and rate-limit responses', async () => {
    for (const status of [429, 500]) {
      const sender = createExpoPushSender(
        { EXPO_ACCESS_TOKEN: 'token' },
        (async () => new Response('{}', { status })) as typeof fetch,
      );
      await expect(sender.send([message(1)])).rejects.toBeInstanceOf(ExpoPushTransientError);
    }

    const broken = createExpoPushSender(
      { EXPO_ACCESS_TOKEN: 'token' },
      (async () => {
        throw new TypeError('offline');
      }) as typeof fetch,
    );
    await expect(broken.send([message(1)])).rejects.toBeInstanceOf(ExpoPushTransientError);
  });

  it('treats a ticket count mismatch as transient', async () => {
    const sender = createExpoPushSender(
      { EXPO_ACCESS_TOKEN: 'token' },
      (async () =>
        new Response(JSON.stringify({ data: [{ status: 'ok', id: 'a' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    );
    await expect(sender.send([message(1), message(2)])).rejects.toBeInstanceOf(
      ExpoPushTransientError,
    );
  });

  it('surfaces Expo-level request errors as transient', async () => {
    const sender = createExpoPushSender(
      { EXPO_ACCESS_TOKEN: 'token' },
      (async () =>
        new Response(JSON.stringify({ errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    );
    await expect(sender.send([message(1)])).rejects.toBeInstanceOf(ExpoPushTransientError);
  });
});

  it('deactivates a DeviceNotRegistered token without retrying', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, PARTNER);

    const push = createPushHarness(() => ({
      status: 'error',
      details: { error: 'DeviceNotRegistered' },
    }));
    await (await service({ push })).drainDue();

    expect(store.deliveries[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'DEVICE_NOT_REGISTERED',
      nextAttemptAt: null,
    });
    expect(store.pushTokens.find((token) => token.expoPushToken === CUSTOMER_TOKEN)!.active).toBe(
      false,
    );
    expect((await (await service({ push })).retryDueDeliveries()).attempted).toBe(0);
  });

  it('retries a ticket-level failure with backoff', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, PARTNER);

    let attempt = 0;
    const push = createPushHarness(() =>
      attempt === 0
        ? { status: 'error', details: { error: 'TooManyRequests' } }
        : { status: 'ok', id: 'ticket-retry' },
    );
    const notifications = await service({ push });

    await notifications.drainDue();
    attempt = 1;
    expect(store.deliveries[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'TooManyRequests',
      attempts: 1,
    });
    expect(new Date(store.deliveries[0].nextAttemptAt!).getTime()).toBe(
      clock.now().getTime() + DEFAULT_NOTIFICATION_CONFIG.backoffBaseMs,
    );

    clock.advance(DEFAULT_NOTIFICATION_CONFIG.backoffBaseMs);
    const retry = await notifications.retryDueDeliveries();
    expect(retry).toMatchObject({ attempted: 1, sent: 1 });
    expect(store.deliveries[0]).toMatchObject({ status: 'SENT', expoTicketId: 'ticket-retry' });
  });

  it('holds every delivery when the Expo request itself fails', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, PARTNER);

    const push: PushHarness = {
      batches: [],
      receiptRequests: [],
      sender: {
        send: async () => {
          throw new ExpoPushTransientError('rate limited');
        },
        getReceipts: async () => new Map(),
      },
    };

    await (await service({ push })).drainDue();
    expect(store.deliveries[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'EXPO_REQUEST_FAILED',
      attempts: 1,
    });
    clock.advance(DEFAULT_NOTIFICATION_CONFIG.backoffBaseMs);
    const retried = createPushHarness(okTickets());
    expect((await (await service({ push: retried })).retryDueDeliveries()).attempted).toBe(1);
  });

  it('reconciles receipts and prunes a dead token from a receipt error', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, PARTNER);

    const receipts = new Map<string, ExpoOutcome>();
    receipts.set('ticket-0', { status: 'ok' });
    const push = createPushHarness(okTickets(), receipts);
    const notifications = await service({ push });

    await notifications.drainDue();
    clock.advance(DEFAULT_NOTIFICATION_CONFIG.receiptDelayMs);
    expect(await notifications.reconcileReceipts()).toMatchObject({
      checked: 1,
      delivered: 1,
      failed: 0,
    });
    expect(store.deliveries[0].status).toBe('RECEIPT_OK');

    receipts.set('ticket-0', { status: 'error', details: { error: 'DeviceNotRegistered' } });
    store.deliveries[0].status = 'SENT';
    store.deliveries[0].updatedAt = clock.now().toISOString();
    clock.advance(DEFAULT_NOTIFICATION_CONFIG.receiptDelayMs);
    const second = await notifications.reconcileReceipts();
    expect(second.failed).toBe(1);
    expect(store.deliveries[0]).toMatchObject({ status: 'RECEIPT_ERROR' });
    expect(store.pushTokens.find((token) => token.expoPushToken === CUSTOMER_TOKEN)!.active).toBe(
      false,
    );
  });

  it('does not reconcile receipts before the delay has elapsed', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, PARTNER);

    const push = createPushHarness(okTickets(), new Map([['ticket-0', { status: 'ok' } as ExpoOutcome]]));
    const notifications = await service({ push });
    await notifications.drainDue();

    expect(await notifications.reconcileReceipts()).toMatchObject({ checked: 0 });
    expect(push.receiptRequests).toHaveLength(0);
  });

  it('runs without a push sender configured', async () => {
    const booking = await assignedBooking();
    await registerTokens();
    await onTheWay(booking, PARTNER);

    const summary = await (await service({ push: null })).drainDue();
    expect(summary).toMatchObject({ processed: 1, deliveries: 0, sent: 0 });
    expect(store.deliveries).toHaveLength(0);
  });
});
