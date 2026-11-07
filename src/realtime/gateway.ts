import type { RealtimeEnvelope } from '../domain/realtime';

export interface RealtimeGateway {
  publish(bookingId: string, envelope: RealtimeEnvelope): Promise<void>;
}

/**
 * Calls the booking-scoped Durable Object stub. The room is created on demand by
 * name, so a booking with no connected clients costs one empty POST.
 */
export function createDurableObjectGateway(
  binding: DurableObjectNamespace,
  secret: string,
): RealtimeGateway {
  return {
    async publish(bookingId, envelope) {
      const stub = binding.getByName(bookingId);
      const response = await stub.fetch(
        new Request('https://booking-room.fixyes.local/event', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-fixyes-internal': secret },
          body: JSON.stringify(envelope),
        }),
      );
      if (!response.ok) {
        throw new Error(`Realtime fan-out failed with status ${response.status}`);
      }
    },
  };
}

export function noopRealtimeGateway(): RealtimeGateway {
  return { publish: async () => undefined };
}

export interface RealtimeUpgrader {
  upgrade(bookingId: string, request: Request): Promise<Response>;
}

/**
 * Forwards the client WebSocket upgrade to the booking room. The handshake
 * authorisation itself happens inside the Durable Object using the ticket.
 */
export function createDurableObjectUpgrader(
  binding: DurableObjectNamespace,
): RealtimeUpgrader {
  return {
    async upgrade(bookingId, request) {
      const url = new URL(request.url);
      const target = new URL(`/ws${url.search}`, 'https://booking-room.internal');
      return binding
        .getByName(bookingId)
        .fetch(new Request(target.toString(), request));
    },
  };
}

export function unavailableUpgrader(): RealtimeUpgrader {
  return {
    upgrade: async () =>
      new Response(JSON.stringify({ error: { code: 'REALTIME_NOT_CONFIGURED' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
  };
}
