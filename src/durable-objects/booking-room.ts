import type { AppRole } from '../db/schema';
import { REALTIME_SCHEMA_VERSION, type RealtimeEnvelope } from '../domain/realtime';
import { constantTimeEqual } from '../lib/crypto';
import { REALTIME_TICKET_SCOPE, TicketRejected, verifyTicket } from '../realtime/ticket';

export const REALTIME_PROTOCOL = 'fixyes-realtime';
export const REALTIME_TICKET_PROTOCOL_PREFIX = 'fixyes-ticket.';

const MAX_MESSAGES_PER_WINDOW = 30;
const MESSAGE_WINDOW_MS = 60_000;
const MAX_CONNECTION_MS = 15 * 60_000;
const IDLE_TIMEOUT_MS = 5 * 60_000;
const MAX_MESSAGE_BYTES = 8_192;
const USED_TICKET_RETENTION_MS = 10 * 60_000;
const MAX_USED_TICKETS = 4_096;

export interface RoomEnv {
  REALTIME_TICKET_SECRET: string;
}

interface ConnectionAttachment {
  connectionId: string;
  userId: string;
  role: AppRole;
  expiresAt: number;
  lastActivityAt: number;
  messageCount: number;
  windowStartedAt: number;
}

function readEnvelope(value: unknown): RealtimeEnvelope | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const validSequence = candidate.sequence === null || typeof candidate.sequence === 'number';
  if (
    typeof candidate.eventId !== 'string' ||
    typeof candidate.bookingId !== 'string' ||
    typeof candidate.type !== 'string' ||
    typeof candidate.occurredAt !== 'string' ||
    typeof candidate.schemaVersion !== 'number' ||
    !validSequence ||
    !candidate.payload ||
    typeof candidate.payload !== 'object'
  ) {
    return null;
  }
  // Only the published contract crosses the socket, never the caller's extra fields.
  return {
    eventId: candidate.eventId,
    bookingId: candidate.bookingId,
    sequence: candidate.sequence as number | null,
    type: candidate.type,
    occurredAt: candidate.occurredAt,
    schemaVersion: candidate.schemaVersion,
    payload: candidate.payload as Record<string, unknown>,
  };
}

function reject(reason: string, status = 401): Response {
  return new Response(
    JSON.stringify({ error: { code: 'REALTIME_TICKET_REJECTED', reason } }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

/**
 * Booking-scoped WebSocket room. It stores no authoritative state and accepts no
 * client writes; the Worker publishes committed, redacted events into it.
 */
export class BookingRoom {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: RoomEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/event') return this.publish(request);
    if (request.method === 'GET' && url.pathname === '/ws') return this.connect(request, url);
    return new Response('Not found', { status: 404 });
  }

  private async publish(request: Request): Promise<Response> {
    const secret = this.env.REALTIME_TICKET_SECRET;
    const provided = request.headers.get('x-fixyes-internal') ?? '';
    if (!secret || !constantTimeEqual(provided, secret)) {
      return new Response(JSON.stringify({ error: { code: 'FORBIDDEN' } }), { status: 403 });
    }

    const envelope = readEnvelope(await request.json().catch(() => null));
    if (!envelope) {
      return new Response(JSON.stringify({ error: { code: 'INVALID_ENVELOPE' } }), { status: 400 });
    }

    const stored = await this.state.storage.get<string>('bookingId');
    if (stored && stored !== envelope.bookingId) {
      return new Response(JSON.stringify({ error: { code: 'BOOKING_MISMATCH' } }), { status: 403 });
    }

    if (typeof envelope.sequence === 'number') {
      const last = (await this.state.storage.get<number>('lastSequence')) ?? 0;
      if (envelope.sequence <= last) {
        return new Response(JSON.stringify({ delivered: 0, deduped: true }));
      }
      await this.state.storage.put('lastSequence', envelope.sequence);
    }
    if (!stored) await this.state.storage.put('bookingId', envelope.bookingId);

    const body = JSON.stringify({ type: 'BOOKING_EVENT', event: envelope });
    let delivered = 0;
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(body);
        delivered += 1;
      } catch {
        // An unwritable socket is closed by the runtime; delivery is at-least-once.
      }
    }
    return new Response(JSON.stringify({ delivered, deduped: false }));
  }

  private readTicket(request: Request, url: URL): string | null {
    const protocols = (request.headers.get('sec-websocket-protocol') ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const prefixed = protocols.find((protocol) =>
      protocol.startsWith(REALTIME_TICKET_PROTOCOL_PREFIX),
    );
    if (prefixed) return prefixed.slice(REALTIME_TICKET_PROTOCOL_PREFIX.length);
    return url.searchParams.get('ticket');
  }

  private async claimTicket(jti: string, expiresAt: number): Promise<boolean> {
    const used = (await this.state.storage.get<Record<string, number>>('usedTickets')) ?? {};
    const now = Date.now();
    for (const [id, expiry] of Object.entries(used)) {
      if (expiry <= now) delete used[id];
    }
    if (used[jti]) return false;
    used[jti] = expiresAt + USED_TICKET_RETENTION_MS;

    const entries = Object.entries(used);
    if (entries.length > MAX_USED_TICKETS) {
      entries
        .sort((a, b) => a[1] - b[1])
        .slice(0, entries.length - MAX_USED_TICKETS)
        .forEach(([id]) => delete used[id]);
    }
    await this.state.storage.put('usedTickets', used);
    return true;
  }

  private async connect(request: Request, url: URL): Promise<Response> {
    const token = this.readTicket(request, url);
    if (!token) {
      return new Response(JSON.stringify({ error: { code: 'REALTIME_TICKET_REQUIRED' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    const stored = await this.state.storage.get<string>('bookingId');
    let claims;
    try {
      claims = await verifyTicket({
        token,
        secret: this.env.REALTIME_TICKET_SECRET,
        expectedBookingId: stored,
        now: new Date(),
      });
    } catch (error) {
      return reject(error instanceof TicketRejected ? error.reason : 'MALFORMED');
    }

    if (claims.scope !== REALTIME_TICKET_SCOPE) return reject('SCOPE');
    if (!stored) await this.state.storage.put('bookingId', claims.bookingId);
    if (!(await this.claimTicket(claims.jti, claims.expiresAt))) return reject('REPLAY');

    const now = Date.now();
    const attachment: ConnectionAttachment = {
      connectionId: crypto.randomUUID(),
      userId: claims.userId,
      role: claims.role,
      expiresAt: now + MAX_CONNECTION_MS,
      lastActivityAt: now,
      messageCount: 0,
      windowStartedAt: now,
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [attachment.connectionId]);
    server.serializeAttachment(attachment);
    await this.armAlarm();

    const latestSequence = (await this.state.storage.get<number>('lastSequence')) ?? 0;
    server.send(
      JSON.stringify({
        type: 'HELLO',
        bookingId: claims.bookingId,
        schemaVersion: REALTIME_SCHEMA_VERSION,
        latestSequence,
        connectionId: attachment.connectionId,
        expiresAt: new Date(attachment.expiresAt).toISOString(),
      }),
    );

    const headers: Record<string, string> = {};
    if ((request.headers.get('sec-websocket-protocol') ?? '').includes(REALTIME_PROTOCOL)) {
      headers['sec-websocket-protocol'] = REALTIME_PROTOCOL;
    }
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  private async armAlarm(): Promise<void> {
    const sockets = this.state.getWebSockets();
    if (sockets.length === 0) return;
    let soonest = Number.POSITIVE_INFINITY;
    for (const socket of sockets) {
      const attachment = socket.deserializeAttachment() as ConnectionAttachment | null;
      if (!attachment) continue;
      soonest = Math.min(
        soonest,
        attachment.expiresAt,
        attachment.lastActivityAt + IDLE_TIMEOUT_MS,
      );
    }
    if (Number.isFinite(soonest)) {
      await this.state.storage.setAlarm(Math.max(soonest, Date.now() + 100));
    }
  }

  private touch(socket: WebSocket): ConnectionAttachment | null {
    const attachment = socket.deserializeAttachment() as ConnectionAttachment | null;
    if (!attachment) return null;
    attachment.lastActivityAt = Date.now();
    socket.serializeAttachment(attachment);
    return attachment;
  }

  private overLimit(attachment: ConnectionAttachment): boolean {
    const now = Date.now();
    if (now - attachment.windowStartedAt > MESSAGE_WINDOW_MS) {
      attachment.windowStartedAt = now;
      attachment.messageCount = 0;
    }
    attachment.messageCount += 1;
    return attachment.messageCount > MAX_MESSAGES_PER_WINDOW;
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const attachment = this.touch(ws);
    if (!attachment) {
      ws.close(1008, 'connection state lost');
      return;
    }
    if (typeof message !== 'string') {
      ws.close(1003, 'binary frames are not accepted');
      return;
    }
    if (message.length > MAX_MESSAGE_BYTES) {
      ws.close(1009, 'message too large');
      return;
    }
    if (this.overLimit(attachment)) {
      ws.close(1008, 'message rate limit exceeded');
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message) as Record<string, unknown>;
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', code: 'INVALID_JSON' }));
      return;
    }

    const kind = typeof parsed.type === 'string' ? parsed.type : '';
    if (kind === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', serverTime: new Date().toISOString() }));
      return;
    }
    if (kind === 'SYNC') {
      ws.send(
        JSON.stringify({
          type: 'SYNC_ACK',
          recovery: 'REST_EVENTS',
          instruction: 'Fetch GET /v1/bookings/{bookingId}/events?afterSequence= for missed events',
        }),
      );
      return;
    }

    // Clients subscribe; they never set authoritative state over the socket.
    ws.send(JSON.stringify({ type: 'ERROR', code: 'MESSAGE_NOT_ACCEPTED' }));
  }

  webSocketClose(): void {
    void this.armAlarm();
  }

  webSocketError(ws: WebSocket): void {
    ws.close(1011, 'socket error');
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as ConnectionAttachment | null;
      if (!attachment) {
        socket.close(1008, 'connection state lost');
        continue;
      }
      if (attachment.expiresAt <= now) {
        socket.close(1000, 'authorization window expired');
        continue;
      }
      if (attachment.lastActivityAt + IDLE_TIMEOUT_MS <= now) {
        socket.close(1000, 'idle timeout');
      }
    }
    await this.armAlarm();
  }
}
