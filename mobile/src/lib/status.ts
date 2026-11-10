import type { BookingStatus } from '../api/types';

type Tone = 'violet' | 'amber' | 'success' | 'danger' | 'neutral' | 'dark';

export const statusTone = (status: BookingStatus): Tone => {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'COMPLETION_PENDING':
      return 'amber';
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_PARTNER':
    case 'CANCELLED_BY_ADMIN':
    case 'NO_PARTNER_AVAILABLE':
    case 'DISPUTED':
      return 'danger';
    case 'IN_PROGRESS':
    case 'ARRIVED':
    case 'ON_THE_WAY':
    case 'PARTNER_ACCEPTED':
    case 'PARTNER_ASSIGNED':
      return 'violet';
    default:
      return 'neutral';
  }
};

export const isCancelled = (status: BookingStatus): boolean =>
  status.startsWith('CANCELLED') || status === 'NO_PARTNER_AVAILABLE' || status === 'DISPUTED';
