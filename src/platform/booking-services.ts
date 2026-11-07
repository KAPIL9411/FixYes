import type { AuthUser } from '../auth/service';
import { assertCanAccessBooking, type PolicyUser } from '../auth/policy';
import type { BookingStatus } from '../db/schema';
import { assertTransitionAllowed, type BookingActorRole } from '../domain/booking-state';
import { paiseToInr, parseInrToPaise } from '../domain/money';
import { isForeignKeyViolation } from '../lib/db-errors';
import { forbidden, AppError } from '../lib/errors';
import { sha256Hex } from '../lib/crypto';
import { systemClock, type Clock } from '../lib/clock';
import type { PlatformStore } from './store-contract';
import type {
  Address,
  Booking,
  BookingEvent,
  CreateAddressInput,
  UpdateAddressInput,
} from './types';

function toPolicyUser(actor: AuthUser): PolicyUser {
  return { id: actor.id, roles: actor.roles, accountDisabled: false };
}

function requireCustomer(actor: AuthUser): void {
  if (!actor.roles.includes('CUSTOMER')) throw forbidden('Customer role required');
}

function requirePartner(actor: AuthUser): void {
  if (!actor.roles.includes('PARTNER')) throw forbidden('Partner role required');
}

export interface AddressService {
  list(userId: string): Promise<Address[]>;
  create(userId: string, input: CreateAddressInput): Promise<Address>;
  update(userId: string, addressId: string, input: UpdateAddressInput): Promise<Address>;
  delete(userId: string, addressId: string): Promise<void>;
}

export function createAddressService(store: PlatformStore): AddressService {
  return {
    list: (userId) => store.listAddresses(userId),

    create(userId, input) {
      return store.createAddress({
        ...input,
        userId,
        label: input.label?.trim() || null,
        addressLine: input.addressLine.trim(),
        locality: input.locality?.trim() || null,
        city: input.city.trim(),
        state: input.state.trim(),
        postalCode: input.postalCode?.trim() || null,
      });
    },

    async update(userId, addressId, input) {
      const existing = await store.getAddress(addressId, userId);
      if (!existing) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found');

      const normalized: UpdateAddressInput = {
        ...input,
        ...(input.label !== undefined ? { label: input.label?.trim() || null } : {}),
        ...(input.addressLine !== undefined ? { addressLine: input.addressLine.trim() } : {}),
        ...(input.locality !== undefined ? { locality: input.locality?.trim() || null } : {}),
        ...(input.city !== undefined ? { city: input.city.trim() } : {}),
        ...(input.state !== undefined ? { state: input.state.trim() } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode?.trim() || null } : {}),
      };

      const updated = await store.updateAddress(addressId, userId, normalized);
      if (!updated) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found');
      return updated;
    },

    async delete(userId, addressId) {
      try {
        const deleted = await store.deleteAddress(addressId, userId);
        if (!deleted) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found');
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new AppError(409, 'ADDRESS_IN_USE', 'Address is used by a booking and cannot be deleted');
        }
        throw error;
      }
    },
  };
}

export interface CreateBookingCommand {
  serviceItemId: string;
  addressId: string;
  scheduledAt: Date | null;
}

export interface BookingService {
  create(
    actor: AuthUser,
    input: CreateBookingCommand,
    idempotencyKey: string,
  ): Promise<{ booking: Booking; replayed: boolean }>;
  get(actor: AuthUser, bookingId: string): Promise<Booking>;
  events(actor: AuthUser, bookingId: string, afterSequence: number): Promise<BookingEvent[]>;
  cancel(
    actor: AuthUser,
    bookingId: string,
    reason: string | undefined,
    expectedVersion: number | undefined,
  ): Promise<Booking>;
  complete(
    actor: AuthUser,
    bookingId: string,
    expectedVersion: number | undefined,
  ): Promise<Booking>;
  partnerStatus(
    actor: AuthUser,
    bookingId: string,
    status: BookingStatus,
    reason: string | undefined,
    expectedVersion: number | undefined,
  ): Promise<Booking>;
}

export function createBookingService(
  store: PlatformStore,
  clock: Clock = systemClock,
): BookingService {
  async function loadBooking(bookingId: string): Promise<Booking> {
    const booking = await store.getBooking(bookingId);
    if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    return booking;
  }

  async function applyTransition(
    actor: AuthUser,
    booking: Booking,
    nextStatus: BookingStatus,
    actorRole: BookingActorRole,
    reason: string | undefined,
    expectedVersion: number | undefined,
  ): Promise<Booking> {
    if (expectedVersion !== undefined && expectedVersion !== booking.version) {
      throw new AppError(
        409,
        'BOOKING_VERSION_CONFLICT',
        'Booking has changed; refresh the booking and retry',
      );
    }

    assertTransitionAllowed(booking.status, nextStatus, actorRole);

    const trimmedReason = reason?.trim();
    const result = await store.transitionBooking({
      bookingId: booking.id,
      actorUserId: actor.id,
      fromStatus: booking.status,
      toStatus: nextStatus,
      expectedVersion: booking.version,
      eventType: 'BOOKING_STATUS_CHANGED',
      payload: {
        fromStatus: booking.status,
        toStatus: nextStatus,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      },
    });

    if (!result) {
      throw new AppError(409, 'BOOKING_CONFLICT', 'Booking changed; refresh the booking and retry');
    }
    return result.booking;
  }

  return {
    async create(actor, input, idempotencyKey) {
      requireCustomer(actor);

      if (input.scheduledAt && Number.isNaN(input.scheduledAt.getTime())) {
        throw new AppError(400, 'INVALID_SCHEDULE', 'scheduledAt must be a valid date');
      }

      const requestHash = await sha256Hex(
        JSON.stringify({
          serviceItemId: input.serviceItemId,
          addressId: input.addressId,
          scheduledAt: input.scheduledAt?.toISOString() ?? null,
        }),
      );

      const existing = await store.getIdempotency(actor.id, idempotencyKey);
      if (existing && new Date(existing.expiresAt).getTime() > clock.now().getTime()) {
        if (existing.requestHash !== requestHash) {
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'The same idempotency key was used with a different request',
          );
        }
        const booking = await store.getBooking(existing.bookingId);
        if (!booking) throw new Error('IDEMPOTENT_BOOKING_MISSING');
        return { booking, replayed: true };
      }

      const address = await store.getAddress(input.addressId, actor.id);
      if (!address) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found');

      const item = await store.getServiceItem(input.serviceItemId);
      if (!item || !item.enabled) {
        throw new AppError(404, 'SERVICE_ITEM_NOT_AVAILABLE', 'Service item is not available');
      }
      if (item.currency !== 'INR') {
        throw new AppError(409, 'PRICE_NOT_AVAILABLE', 'Service item pricing is not available');
      }

      const categories = await store.listCategories(false);
      const category = categories.find((entry) => entry.id === item.categoryId);
      if (!category || !category.enabled) {
        throw new AppError(400, 'CATEGORY_NOT_AVAILABLE', 'Service category is not available');
      }

      const cities = await store.listCities(true);
      const city = cities.find(
        (entry) =>
          entry.name.toLowerCase() === address.city.trim().toLowerCase() &&
          entry.state.toLowerCase() === address.state.trim().toLowerCase(),
      );
      if (!city) {
        throw new AppError(400, 'CITY_NOT_AVAILABLE', 'This service address is outside the enabled cities');
      }

      if (input.scheduledAt && input.scheduledAt.getTime() < clock.now().getTime() - 60_000) {
        throw new AppError(400, 'INVALID_SCHEDULE', 'scheduledAt cannot be in the past');
      }

      const basePricePaise = item.basePrice === null ? null : parseInrToPaise(item.basePrice);
      if (basePricePaise === null) {
        throw new AppError(409, 'PRICE_NOT_AVAILABLE', 'Service item pricing is not available');
      }
      const quotedTotal = paiseToInr(basePricePaise);

      const result = await store.createBooking(
        {
          customerUserId: actor.id,
          serviceItemId: input.serviceItemId,
          addressId: input.addressId,
          scheduledAt: input.scheduledAt,
          quotedTotal,
          idempotencyKey,
          requestHash,
          snapshot: {
            addressLine: address.addressLine,
            locality: address.locality,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            latitude: address.latitude,
            longitude: address.longitude,
          },
        },
        {
          eventType: 'BOOKING_CREATED',
          actorUserId: actor.id,
          payload: {
            status: 'REQUESTED',
            serviceItemId: input.serviceItemId,
            quotedTotal,
          },
        },
      );

      if (result.replayed) {
        if (result.requestHash !== requestHash) {
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'The same idempotency key was used with a different request',
          );
        }
        const existing = await store.getBooking(result.bookingId);
        if (!existing) throw new Error('IDEMPOTENT_BOOKING_MISSING');
        return { booking: existing, replayed: true };
      }

      return { booking: result.booking, replayed: false };
    },

    async get(actor, bookingId) {
      const booking = await loadBooking(bookingId);
      assertCanAccessBooking(toPolicyUser(actor), booking);
      return booking;
    },

    async events(actor, bookingId, afterSequence) {
      const booking = await loadBooking(bookingId);
      assertCanAccessBooking(toPolicyUser(actor), booking);
      return store.listBookingEvents(booking.id, afterSequence);
    },

    async cancel(actor, bookingId, reason, expectedVersion) {
      const booking = await loadBooking(bookingId);
      if (booking.customerUserId !== actor.id) {
        throw forbidden('Only the booking customer can cancel this booking');
      }
      return applyTransition(
        actor,
        booking,
        'CANCELLED_BY_CUSTOMER',
        'CUSTOMER',
        reason,
        expectedVersion,
      );
    },

    async complete(actor, bookingId, expectedVersion) {
      const booking = await loadBooking(bookingId);
      if (booking.customerUserId !== actor.id) {
        throw forbidden('Only the booking customer can confirm completion');
      }
      return applyTransition(actor, booking, 'COMPLETED', 'CUSTOMER', undefined, expectedVersion);
    },

    async partnerStatus(actor, bookingId, status, reason, expectedVersion) {
      requirePartner(actor);
      const booking = await loadBooking(bookingId);
      if (booking.partnerUserId !== actor.id) {
        throw forbidden('Only the assigned partner can update this booking');
      }
      if (status === 'CANCELLED_BY_PARTNER' && (!reason || reason.trim().length < 3)) {
        throw new AppError(
          400,
          'CANCELLATION_REASON_REQUIRED',
          'A cancellation reason is required',
        );
      }
      return applyTransition(actor, booking, status, 'PARTNER', reason, expectedVersion);
    },
  };
}
