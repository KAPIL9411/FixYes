import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { parseJson } from '../lib/validation';
import type { AddressService } from '../platform/booking-services';
import type { AppEnv } from '../types';

const uuidSchema = z.string().uuid();

const addressFields = z.object({
  label: z.string().trim().min(1).max(50).nullable().optional(),
  addressLine: z.string().trim().min(3).max(300),
  locality: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'postalCode must be a 6-digit Indian PIN code')
    .nullable()
    .optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

function coordinatesTogether(value: {
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  const hasLatitude = Object.prototype.hasOwnProperty.call(value, 'latitude');
  const hasLongitude = Object.prototype.hasOwnProperty.call(value, 'longitude');
  return hasLatitude === hasLongitude;
}

const createAddressSchema = addressFields.refine(coordinatesTogether, {
  message: 'latitude and longitude must be provided together',
  path: ['latitude'],
});

const updateAddressSchema = addressFields
  .partial()
  .refine(coordinatesTogether, {
    message: 'latitude and longitude must be provided together',
    path: ['latitude'],
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one address field is required',
  });

function addressId(c: Context<AppEnv>): string {
  const value = c.req.param('addressId');
  if (!value || !uuidSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_ID', 'Invalid addressId');
  }
  return value;
}

export function createAddressRoutes(service: AddressService) {
  return new Hono<AppEnv>()
    .get('/', async (c) => {
      const addresses = await service.list(c.get('auth').user.id);
      return c.json({ addresses });
    })
    .post('/', async (c) => {
      const body = await parseJson(c, createAddressSchema);
      const address = await service.create(c.get('auth').user.id, {
        label: body.label ?? null,
        addressLine: body.addressLine,
        locality: body.locality ?? null,
        city: body.city,
        state: body.state,
        postalCode: body.postalCode ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
      });
      return c.json({ address }, 201);
    })
    .patch('/:addressId', async (c) => {
      const body = await parseJson(c, updateAddressSchema);
      const address = await service.update(c.get('auth').user.id, addressId(c), body);
      return c.json({ address });
    })
    .delete('/:addressId', async (c) => {
      await service.delete(c.get('auth').user.id, addressId(c));
      return c.body(null, 204);
    });
}
