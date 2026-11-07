/**
 * Minimal stand-in for the Durable Object runtime: the vitest suite executes the
 * BookingRoom class directly, so the workers runtime globals have to be faked.
 */

export class FakeSocket {
  readonly sent: string[] = [];
  closeCode: number | null = null;
  closeReason: string | null = null;
  attachment: unknown = null;
  /** The socket on the other end of the pair; writes and closes land there. */
  peer: FakeSocket | null = null;

  send(data: string): void {
    if (this.closeCode !== null) throw new Error('socket is closed');
    const sink = this.peer ?? this;
    sink.sent.push(typeof data === 'string' ? data : String(data));
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code ?? 1005;
    this.closeReason = reason ?? null;
    if (this.peer) {
      this.peer.closeCode = this.closeCode;
      this.peer.closeReason = this.closeReason;
    }
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }

  /** Convenience for tests: decode every JSON frame the room pushed to this socket. */
  messages(): Record<string, unknown>[] {
    return this.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
  }
}

export class FakeWebSocketPair {
  readonly 0: FakeSocket;
  readonly 1: FakeSocket;

  constructor() {
    this[0] = new FakeSocket();
    this[1] = new FakeSocket();
    this[0].peer = this[1];
    this[1].peer = this[0];
  }
}

interface StorageEntry {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(time: number): Promise<void>;
}

export class FakeDurableObjectState {
  readonly values = new Map<string, unknown>();
  readonly accepted: FakeSocket[] = [];
  alarmTime: number | null = null;

  readonly storage: StorageEntry = {
    get: async <T>(key: string) => this.values.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      this.values.set(key, value);
    },
    setAlarm: async (time: number) => {
      this.alarmTime = time;
    },
  };

  acceptWebSocket(socket: FakeSocket): void {
    this.accepted.push(socket);
  }

  getWebSockets(): FakeSocket[] {
    return this.accepted.filter((socket) => socket.closeCode === null);
  }

  /** The server-side socket handed to the room for the nth accepted connection. */
  serverSocket(index = 0): FakeSocket {
    const socket = this.accepted[index];
    if (!socket) throw new Error('NO_ACCEPTED_SOCKET');
    return socket;
  }
}

export function installWebSocketPair(): void {
  Object.defineProperty(globalThis, 'WebSocketPair', {
    value: FakeWebSocketPair,
    configurable: true,
    writable: true,
  });
}

/**
 * The fetch spec forbids constructing a Response with status 101, so the room
 * needs a stand-in that can carry the upgraded socket.
 */
export class FakeResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly webSocket: FakeSocket | undefined;
  private readonly body: string | null;

  constructor(
    body?: string | null,
    init: { status?: number; headers?: Record<string, string>; webSocket?: FakeSocket } = {},
  ) {
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers ?? {});
    this.webSocket = init.webSocket;
    this.body = body ?? null;
  }

  async text(): Promise<string> {
    return this.body ?? '';
  }

  async json(): Promise<Record<string, unknown>> {
    return JSON.parse(this.body ?? 'null') as Record<string, unknown>;
  }
}

export function wsRequest(
  url: string,
  options: { ticket?: string; protocol?: string } = {},
): Request {
  const headers = new Headers();
  const protocols = options.protocol ? [options.protocol] : [];
  if (options.ticket) protocols.push(`fixyes-ticket.${options.ticket}`);
  if (protocols.length > 0) headers.set('sec-websocket-protocol', protocols.join(', '));
  return new Request(url, { headers });
}

export function envelopeRequest(bookingId: string, secret: string, body: unknown): Request {
  return new Request('https://booking-room.internal/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fixyes-internal': secret },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
