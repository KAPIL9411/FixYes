import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { parseJson } from '../lib/validation';
import type { MediaKind, MediaService } from '../platform/services';
import type { AppEnv } from '../types';

const signatureSchema = z.object({ kind: z.enum(['AVATAR', 'PARTNER_DOCUMENT']) });
const confirmSchema = z.object({ publicId: z.string().min(10).max(300) });

export function createMediaRoutes(service: MediaService) {
  return new Hono<AppEnv>()
    .post('/signature', async (c) => {
      const body = await parseJson(c, signatureSchema);
      const signature = await service.createSignature(
        c.get('auth').user.id,
        body.kind as MediaKind,
      );
      return c.json({ signature });
    })
    .post('/confirm', async (c) => {
      const body = await parseJson(c, confirmSchema);
      if (body.publicId.includes('..') || /[^a-zA-Z0-9/_-]/.test(body.publicId)) {
        throw new AppError(400, 'INVALID_PUBLIC_ID', 'Invalid Cloudinary public ID');
      }
      const asset = await service.confirm(c.get('auth').user.id, body.publicId);
      return c.json({ asset });
    });
}
