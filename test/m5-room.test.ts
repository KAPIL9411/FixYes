import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingRoom, REALTIME_PROTOCOL } from '../src/durable-objects/booking-room';
import { REALTIME_TICKET_SCOPE, signTicket, type TicketClaims } from '../src/realtime/ticket';
import type { RealtimeEnvelope } from '../src/domain/realtime';
import {
  FakeDurableObjectState,
  FakeResponse,
  FakeSocket,
  envelopeRequest,
  installWebSocketPair,
  wsRequest,
} from './helpers/fake-durable-object';

const SECRET = 'unit-test-realtime-ticket-secret-0123456789';
const BOOKING_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOOKING_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let state: FakeDurableObjectState;
let room: BookingRoom;

async function ticket(
  bookingId = BOOKING_A,
  overrides: Partial<TicketClaims> = {},
): Promise<string> {
  const now = Date.now();
  const claims: TicketClaims = {
    bookingId,
    userId: USER,
    role: 'CUSTOMER',
    scope: REALTIME_TICKET_SCOPE,
    jti: crypto.randomUUID(),
    issuedAt: now,
    expiresAt: now + 30_000,
    ...overrides,
  };
  return signTicket(claims, SECRET);
}

async function connect(token: string, protocol = REALTIME_PROTOCOL): Promise<FakeResponse> {
  const response = await room.fetch(
    wsRequest('https://booking-room.internal/ws', { ticket: token, protocol }),
  );
  return response as unknown as FakeResponse;
}

function envelope(sequence: number | null, bookingId = BOOKING_A): RealtimeEnvelope {
  return {
    eventId: `event-${sequence ?? 0}`,
    bookingId,
    sequence,
    type: 'BOOKING_STATUS_CHANGED',
    occurredAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    payload: { fromStatus: 'REQUESTED', toStatus: 'DISPATCHING' },
  };
}

async function publish(body: unknown, secret = SECRET): Promise<FakeResponse> {
  const response = await room.fetch(envelopeRequest(BOOKING_A, secret, body));
  return response as unknown as FakeResponse;
}

interface Room {
  client: FakeSocket;
  server: FakeSocket;
}

async function open(bookingId = BOOKING_A): Promise<Room> {
  const response = await connect(await ticket(bookingId));
  if (response.status !== 101) {
    throw new Error(`handshake failed: ${await response.text()}`);
  }
  return { client: response.webSocket!, server: state.serverSocket(state.accepted.length - 1) };
}

function lastFrame(socket: FakeSocket): Record<string, unknown> {
  const frame = socket.sent.at(-1);
  if (frame === undefined) throw new Error('socket received nothing');
  return JSON.parse(frame) as Record<string, unknown>;
}

beforeEach(() => {
  installWebSocketPair();
  vi.stubGlobal('Response', FakeResponse);
  state = new FakeDurableObjectState();
  room = new BookingRoom(state as unknown as DurableObjectState, {
    REALTIME_TICKET_SECRET: SECRET,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('M5 booking room handshake authorisation', () => {
  it('rejects a handshake without a ticket', async () => {
    const response = (await room.fetch(
      wsRequest('https://booking-room.internal/ws'),
    )) as unknown as FakeResponse;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'REALTIME_TICKET_REQUIRED' } });
    expect(state.accepted).toHaveLength(0);
  });

  it('accepts a signed ticket and greets with the room sequence', async () => {
    state.values.set('lastSequence', 7);
    const response = await connect(await ticket());
    expect(response.status).toBe(101);
    expect(response.headers.get('sec-websocket-protocol')).toBe(REALTIME_PROTOCOL);
    expect(response.webSocket!.messages()[0]).toMatchObject({
      type: 'HELLO',
      bookingId: BOOKING_A,
      latestSequence: 7,
      schemaVersion: 1,
    });
  });

  it('accepts a query-string ticket when no subprotocol is offered', async () => {
    const token = await ticket();
    const response = await room.fetch(
      wsRequest(`https://booking-room.internal/ws?ticket=${encodeURIComponent(token)}`),
    );
    expect((response as unknown as FakeResponse).status).toBe(101);
  });

  it('rejects a tampered signature', async () => {
    const [body] = (await ticket()).split('.');
    const response = await connect(`${body}.${'A'.repeat(43)}`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'REALTIME_TICKET_REJECTED', reason: 'SIGNATURE' },
    });
  });

  it('rejects expired, mis-scoped and malformed tickets', async () => {
    const expired = await connect(await ticket(BOOKING_A, { expiresAt: Date.now() - 1 }));
    expect(await expired.json()).toMatchObject({ error: { reason: 'EXPIRED' } });
    const scoped = await connect(
      await ticket(BOOKING_A, { scope: 'admin.console' as unknown as TicketClaims['scope'] }),
    );
    expect(await scoped.json()).toMatchObject({ error: { reason: 'SCOPE' } });

    for (const token of ['nodo t', 'a.b', '###.###']) {
      const response = await connect(token);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { reason: 'MALFORMED' } });
    }
  });

  it('rejects a ticket minted for a different booking once the room is bound', async () => {
    await open();
    const response = await connect(await ticket(BOOKING_B));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { reason: 'BOOKING_MISMATCH' } });
  });

  it('rejects a replayed ticket', async () => {
    const token = await ticket();
    expect((await connect(token)).status).toBe(101);
    const replay = await connect(token);
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ error: { reason: 'REPLAY' } });
  });
});

describe('M5 booking room fan-out', () => {
  it('refers unauthenticated and mis-targeted publishes', async () => {
    const anonymous = (await room.fetch(
      new Request('https://booking-room.internal/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(envelope(1)),
      }),
    )) as unknown as FakeResponse;
    expect(anonymous.status).toBe(403);

    expect((await publish(envelope(1), 'wrong-secret')).status).toBe(403);

    state.values.set('bookingId', BOOKING_A);
    expect((await publish(envelope(1, BOOKING_B))).status).toBe(403);
  });

  it('rejects an envelope that is not a booking event', async () => {
    const response = await publish({ bookingId: BOOKING_A });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'INVALID_ENVELOPE' } });
  });

  it('broadcasts to connected sockets and dedupes by sequence', async () => {
    const { client } = await open();

    expect(await (await publish(envelope(1))).json()).toEqual({ delivered: 1, deduped: false });
    expect(await (await publish(envelope(1))).json()).toEqual({ delivered: 0, deduped: true });
    expect(await (await publish(envelope(2))).json()).toEqual({ delivered: 1, deduped: false });

    const frames = client.messages();
    expect(frames).toHaveLength(3);
    expect(frames[1]).toEqual({
      type: 'BOOKING_EVENT',
      event: expect.objectContaining({ sequence: 1 }),
    });
  });

  it('forwards the envelope untouched and nothing else', async () => {
    const { client } = await open();
    const event = { ...envelope(3), payload: { toStatus: 'CANCELLED_BY_CUSTOMER' } };
    await publish({ ...event, actorUserId: USER, internalNote: 'private notes' });

    expect(client.messages()[1]).toEqual({ type: 'BOOKING_EVENT', event });
  });
});

describe('M5 booking room client traffic', () => {
  it('answers PING and SYNC but refuses client writes', async () => {
    const { client, server } = await open();

    room.webSocketMessage(server, JSON.stringify({ type: 'PING' }));
    expect(lastFrame(client)).toMatchObject({ type: 'PONG' });

    room.webSocketMessage(server, JSON.stringify({ type: 'SYNC' }));
    expect(lastFrame(client)).toMatchObject({ type: 'SYNC_ACK', recovery: 'REST_EVENTS' });

    room.webSocketMessage(
      server,
      JSON.stringify({ type: 'BOOKING_STATUS_CHANGED', status: 'COMPLETED' }),
    );
    expect(lastFrame(client)).toEqual({ type: 'ERROR', code: 'MESSAGE_NOT_ACCEPTED' });
  });

  it('rejects invalid JSON without closing', async () => {
    const { client, server } = await open();
    room.webSocketMessage(server, '{not json');
    expect(lastFrame(client)).toEqual({ type: 'ERROR', code: 'INVALID_JSON' });
    expect(server.closeCode).toBeNull();
  });

  it('closes binary frames and oversized messages', async () => {
    const first = await open();
    room.webSocketMessage(first.server, new ArrayBuffer(8));
    expect(first.server.closeCode).toBe(1003);

    const second = await open();
    room.webSocketMessage(second.server, 'x'.repeat(9_000));
    expect(second.server.closeCode).toBe(1009);
  });

  it('rate limits client messages per window', async () => {
    const { server } = await open();
    for (let index = 0; index < 30; index += 1) {
      room.webSocketMessage(server, JSON.stringify({ type: 'PING' }));
      expect(server.closeCode).toBeNull();
    }
    room.webSocketMessage(server, JSON.stringify({ type: 'PING' }));
    expect(server.closeCode).toBe(1008);
  });

  it('closes sockets whose authorization window expired or that went idle', async () => {
    const now = Date.now();
    const expired = await open();
    (expired.server.attachment as { expiresAt: number }).expiresAt = now - 1;

    const idle = await open();
    (idle.server.attachment as { lastActivityAt: number }).lastActivityAt = now - 6 * 60_000;

    await room.alarm();
    expect(expired.server.closeCode).toBe(1000);
    expect(idle.server.closeCode).toBe(1000);
    expect(state.alarmTime).not.toBeNull();
  });

  it('drops a socket that lost its attachment', async () => {
    const { server } = await open();
    server.attachment = null;
    room.webSocketMessage(server, JSON.stringify({ type: 'PING' }));
    expect(server.closeCode).toBe(1008);
  });
});
