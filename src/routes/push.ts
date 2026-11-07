import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { parseJson } from '../lib/validation';
import type { DevicePlatform, PushService } from '../notifications/push-service';
import type { AppEnv } from '../types';

const uuidSchema = z.string().uuid();

const registerSchema = z
  .object({
    expoPushToken: z.string().trim().min(8).max(255),
    devicePlatform: z.enum(['ios', 'android', 'web']).optional(),
  })
  .strict();

function tokenId(c: Context<AppEnv>): string {
  const value = c.req.param('tokenId');
  if (!value || !uuidSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_ID', 'Invalid push token id');
  }
  return value;
}

export function createPushRoutes(service: PushService) {
  return new Hono<AppEnv>()
    .post('/', async (c) => {
      const body = await parseJson(c, registerSchema);
      const pushToken = await service.register(c.get('auth').user, {
        expoPushToken: body.expoPushToken,
        devicePlatform: (body.devicePlatform ?? null) as DevicePlatform | null,
      });
      return c.json({ pushToken });
    })
    .get('/', async (c) => c.json({ pushTokens: await service.list(c.get('auth').user) }))
    .delete('/:tokenId', async (c) => {
      await service.deactivate(c.get('auth').user, tokenId(c));
      return new Response(null, { status: 204 });
    });
}
