import { describe, expect, it } from 'vitest';
import {
  assertCanAccessBooking,
  canAccessBooking,
  canAccessCustomerResource,
  canManagePartnerProfile,
  hasRole,
  requireRole,
  type PolicyUser,
} from '../src/auth/policy';

const customer: PolicyUser = { id: 'customer-1', roles: ['CUSTOMER'], accountDisabled: false };
const otherCustomer: PolicyUser = { id: 'customer-2', roles: ['CUSTOMER'], accountDisabled: false };
const partner: PolicyUser = { id: 'partner-1', roles: ['PARTNER'], accountDisabled: false };
const admin: PolicyUser = { id: 'admin-1', roles: ['ADMIN'], accountDisabled: false };
const disabled: PolicyUser = {
  id: 'customer-1',
  roles: ['CUSTOMER', 'ADMIN'],
  accountDisabled: true,
};

const booking = {
  customerUserId: 'customer-1',
  partnerUserId: null,
  offeredPartnerUserIds: ['partner-2'],
};

describe('authorization policy', () => {
  it('allows the owning customer and denies another customer', () => {
    expect(canAccessBooking(customer, booking)).toBe(true);
    expect(canAccessBooking(otherCustomer, booking)).toBe(false);
  });

  it('allows the assigned partner and an offered partner only', () => {
    expect(canAccessBooking(partner, booking)).toBe(false);
    expect(canAccessBooking({ ...partner, id: 'partner-2' }, booking)).toBe(true);
    expect(canAccessBooking(partner, { ...booking, partnerUserId: 'partner-1' })).toBe(true);
  });

  it('allows an admin for any booking', () => {
    expect(canAccessBooking(admin, booking)).toBe(true);
  });

  it('denies a disabled account even when it holds admin', () => {
    expect(canAccessBooking(disabled, booking)).toBe(false);
    expect(hasRole(disabled, 'ADMIN')).toBe(false);
    expect(canAccessCustomerResource(disabled, 'customer-1')).toBe(false);
  });

  it('enforces customer resource ownership', () => {
    expect(canAccessCustomerResource(customer, 'customer-1')).toBe(true);
    expect(canAccessCustomerResource(otherCustomer, 'customer-1')).toBe(false);
    expect(canAccessCustomerResource(admin, 'customer-1')).toBe(true);
  });

  it('enforces partner profile ownership', () => {
    expect(canManagePartnerProfile(partner, 'partner-1')).toBe(true);
    expect(canManagePartnerProfile(customer, 'partner-1')).toBe(false);
    expect(canManagePartnerProfile(admin, 'partner-1')).toBe(true);
  });

  it('throws a stable forbidden error on denied booking access', () => {
    expect(() => assertCanAccessBooking(otherCustomer, booking)).toThrowError(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
  });

  it('throws when the required role is missing', () => {
    expect(() => requireRole(customer, 'ADMIN')).toThrowError(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
    expect(() => requireRole(admin, 'ADMIN')).not.toThrow();
  });
});
