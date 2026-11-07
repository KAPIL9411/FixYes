import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import type { RealtimeService } from '../realtime/realtime-service';
import type { RealtimeUpgrader } from '../realtime/gateway';
import type { AppEnv } from '../types';

const uuidSchema = z.string().uuid();

function bookingId(c: Context<AppEnv>): string {
  const value = c.req.param('bookingId');
  if (!value || !uuidSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_ID', 'Invalid bookingId');
  }
  return value;
}

function websocketOrigin(c: Context<AppEnv>): string {
  const configured = c.env.REALTIME_URL_BASE?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const url = new URL(c.req.url);
  const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${url.host}`;
}

export interface RealtimeRouteDependencies {
  realtimeService: RealtimeService | null;
  upgrader: RealtimeUpgrader;
}

export function createRealtimeRoutes(deps: RealtimeRouteDependencies) {
  return new Hono<AppEnv>()
    .post('/bookings/:bookingId/realtime-ticket', async (c) => {
      if (!deps.realtimeService) {
        throw new AppError(
          503,
          'REALTIME_NOT_CONFIGURED',
          'Realtime tickets are not configured in this environment',
        );
      }
      const id = bookingId(c);
      const issued = await deps.realtimeService.issue(c.get('auth').user, id);
      return c.json({
        realtime: {
          ticket: issued.ticket,
          expiresAt: issued.expiresAt,
          websocketUrl: `${websocketOrigin(c)}${issued.websocketPath}`,
          protocol: issued.protocol,
          schemaVersion: issued.schemaVersion,
        },
      });
    })
    .get('/realtime/bookings/:bookingId/ws', (c) => {
      return deps.upgrader.upgrade(bookingId(c), c.req.raw);
    });
}
