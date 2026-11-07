import { Hono } from 'hono';
import { z } from 'zod';
import { parseQuery } from '../lib/validation';
import type { CatalogueService } from '../platform/services';
import type { AppEnv } from '../types';

const zonesQuery = z.object({ cityId: z.string().uuid() });
const itemsQuery = z.object({ categoryId: z.string().uuid().optional() });

export function createCatalogueRoutes(service: CatalogueService) {
  return new Hono<AppEnv>()
    .get('/service-cities', async (c) => {
      const cities = await service.listCities(true);
      return c.json({ cities });
    })
    .get('/service-zones', async (c) => {
      const query = parseQuery(c, zonesQuery);
      const zones = await service.listZones(query.cityId, true);
      return c.json({ zones });
    })
    .get('/service-categories', async (c) => {
      const categories = await service.listCategories(true);
      return c.json({ categories });
    })
    .get('/service-items', async (c) => {
      const query = parseQuery(c, itemsQuery);
      const items = await service.listItems(query.categoryId, true);
      return c.json({ items });
    });
}
