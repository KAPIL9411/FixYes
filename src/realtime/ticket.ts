import { constantTimeEqual } from '../lib/crypto';
import type { AppRole } from '../db/schema';

export const REALTIME_TICKET_SCOPE = 'booking.room';
export const DEFAULT_TICKET_TTL_MS = 30_000;
const MIN_SECRET_LENGTH = 32;

export interface TicketClaims {
  bookingId: string;
  userId: string;
  role: AppRole;
  scope: typeof REALTIME_TICKET_SCOPE;
  jti: string;
  issuedAt: number;
  expiresAt: number;
}

export type TicketRejection =
  | 'MALFORMED'
  | 'SIGNATURE'
  | 'EXPIRED'
  | 'SCOPE'
  | 'BOOKING_MISMATCH';

export class TicketRejected extends Error {
  constructor(readonly reason: TicketRejection) {
    super(`Realtime ticket rejected: ${reason}`);
    this.name = 'TicketRejected';
  }
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('REALTIME_TICKET_SECRET must be at least 32 characters');
  }
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signTicket(
  claims: TicketClaims,
  secret: string,
): Promise<string> {
  const body = toBase64Url(
    encoder.encode(
      JSON.stringify({
        b: claims.bookingId,
        u: claims.userId,
        r: claims.role,
        s: claims.scope,
        j: claims.jti,
        i: claims.issuedAt,
        e: claims.expiresAt,
      }),
    ),
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret, 'sign'),
    encoder.encode(body),
  );
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export interface VerifyTicketOptions {
  token: string;
  secret: string;
  /** When the room already knows its booking, the ticket must match it. */
  expectedBookingId?: string;
  now: Date;
}

export async function verifyTicket({
  token,
  secret,
  expectedBookingId,
  now,
}: VerifyTicketOptions): Promise<TicketClaims> {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new TicketRejected('MALFORMED');

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = fromBase64Url(parts[1]);
  } catch {
    throw new TicketRejected('MALFORMED');
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret, 'verify'),
    signatureBytes,
    encoder.encode(parts[0]),
  );
  if (!valid) throw new TicketRejected('SIGNATURE');

  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(
      new TextDecoder().decode(fromBase64Url(parts[0])),
    ) as Record<string, unknown>;
  } catch {
    throw new TicketRejected('MALFORMED');
  }

  const { b, u, r, s, j, i, e } = decoded;
  if (
    typeof b !== 'string' ||
    typeof u !== 'string' ||
    typeof r !== 'string' ||
    typeof j !== 'string' ||
    typeof i !== 'number' ||
    typeof e !== 'number'
  ) {
    throw new TicketRejected('MALFORMED');
  }
  if (s !== REALTIME_TICKET_SCOPE) throw new TicketRejected('SCOPE');
  if (e <= now.getTime()) throw new TicketRejected('EXPIRED');
  if (expectedBookingId !== undefined && !constantTimeEqual(b, expectedBookingId)) {
    throw new TicketRejected('BOOKING_MISMATCH');
  }

  return {
    bookingId: b,
    userId: u,
    role: r as AppRole,
    scope: REALTIME_TICKET_SCOPE,
    jti: j,
    issuedAt: i,
    expiresAt: e,
  };
}

export async function issueTicket(
  input: { bookingId: string; userId: string; role: AppRole },
  secret: string,
  now: Date,
  ttlMs: number = DEFAULT_TICKET_TTL_MS,
): Promise<{ ticket: string; expiresAt: Date; jti: string }> {
  const expiresAt = new Date(now.getTime() + ttlMs);
  const jti = crypto.randomUUID();
  const ticket = await signTicket(
    {
      bookingId: input.bookingId,
      userId: input.userId,
      role: input.role,
      scope: REALTIME_TICKET_SCOPE,
      jti,
      issuedAt: now.getTime(),
      expiresAt: expiresAt.getTime(),
    },
    secret,
  );
  return { ticket, expiresAt, jti };
}
