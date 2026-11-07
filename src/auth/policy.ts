import { AppError } from '../lib/errors';
import type { AppRole } from '../db/schema';

export interface PolicyUser {
  id: string;
  roles: AppRole[];
  accountDisabled: boolean;
}

export interface BookingAccessSubject {
  customerUserId: string;
  partnerUserId: string | null;
  offeredPartnerUserIds?: string[];
}

export function hasRole(user: PolicyUser, role: AppRole): boolean {
  return !user.accountDisabled && user.roles.includes(role);
}

export function requireRole(user: PolicyUser, role: AppRole): void {
  if (!hasRole(user, role)) throw new AppError(403, 'FORBIDDEN', 'Insufficient role');
}

export function canAccessBooking(user: PolicyUser, booking: BookingAccessSubject): boolean {
  if (user.accountDisabled) return false;
  if (user.roles.includes('ADMIN')) return true;
  if (booking.customerUserId === user.id) return true;
  if (booking.partnerUserId === user.id) return true;
  return booking.offeredPartnerUserIds?.includes(user.id) ?? false;
}

export function assertCanAccessBooking(user: PolicyUser, booking: BookingAccessSubject): void {
  if (!canAccessBooking(user, booking)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this booking');
  }
}

export function canAccessCustomerResource(user: PolicyUser, ownerUserId: string): boolean {
  if (user.accountDisabled) return false;
  return user.roles.includes('ADMIN') || user.id === ownerUserId;
}

export function canManagePartnerProfile(user: PolicyUser, partnerUserId: string): boolean {
  if (user.accountDisabled) return false;
  return user.roles.includes('ADMIN') || user.id === partnerUserId;
}
