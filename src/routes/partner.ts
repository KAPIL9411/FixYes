import { Hono } from 'hono';
import { z } from 'zod';
import { parseJson } from '../lib/validation';
import type { PartnerService } from '../platform/services';
import type { AppEnv } from '../types';

const onboardingSchema = z.object({
  serviceCityId: z.string().uuid(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string().min(2).max(50)).min(1).max(10),
});

export function createPartnerRoutes(service: PartnerService) {
  return new Hono<AppEnv>()
    .post('/onboarding', async (c) => {
      const body = await parseJson(c, onboardingSchema);
      const userId = c.get('auth').user.id;
      const profile = await service.onboard(userId, body);
      return c.json({ profile }, 201);
    })
    .get('/profile', async (c) => {
      const profile = await service.getProfile(c.get('auth').user.id);
      return c.json({ profile });
    });
}
