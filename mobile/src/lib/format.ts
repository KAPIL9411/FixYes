import type { BookingStatus } from '../api/types';

export const inr = (value: string | number | null | undefined): string => {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '₹—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const shortId = (id: string): string => `FX-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const timeOfDay = (date = new Date()): string => {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

export const formatDate = (iso: string): string => {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return `Today, ${date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export const dayLabel = (iso: string): string => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const minutesLabel = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
};

export const secondsLabel = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const isActiveStatus = (status: BookingStatus): boolean =>
  ![
    'COMPLETED',
    'CANCELLED_BY_CUSTOMER',
    'CANCELLED_BY_PARTNER',
    'CANCELLED_BY_ADMIN',
    'NO_PARTNER_AVAILABLE',
    'DISPUTED',
  ].includes(status);

export const STATUS_COPY: Record<BookingStatus, string> = {
  REQUESTED: 'Request received',
  DISPATCHING: 'Finding your partner',
  PARTNER_ASSIGNED: 'Partner assigned',
  PARTNER_ACCEPTED: 'Partner confirmed',
  ON_THE_WAY: 'Partner on the way',
  ARRIVED: 'Partner has arrived',
  IN_PROGRESS: 'Work in progress',
  COMPLETION_PENDING: 'Confirm completion',
  COMPLETED: 'Service completed',
  CANCELLED_BY_CUSTOMER: 'Cancelled by you',
  CANCELLED_BY_PARTNER: 'Cancelled by partner',
  CANCELLED_BY_ADMIN: 'Cancelled by support',
  NO_PARTNER_AVAILABLE: 'No partner available',
  DISPUTED: 'Under review',
};

export const STATUS_DETAIL: Record<BookingStatus, string> = {
  REQUESTED: 'We have your request and are preparing the job.',
  DISPATCHING: 'We are matching you with a verified partner nearby.',
  PARTNER_ASSIGNED: 'A verified partner has been assigned to your job.',
  PARTNER_ACCEPTED: 'Your partner has confirmed the visit.',
  ON_THE_WAY: 'Your partner is heading to your address.',
  ARRIVED: 'Your partner is at your doorstep.',
  IN_PROGRESS: 'The service is being carried out.',
  COMPLETION_PENDING: 'Please confirm the work is finished.',
  COMPLETED: 'All done. Thanks for using Fixyes.',
  CANCELLED_BY_CUSTOMER: 'This booking was cancelled by you.',
  CANCELLED_BY_PARTNER: 'This booking was cancelled by the partner.',
  CANCELLED_BY_ADMIN: 'Support cancelled this booking.',
  NO_PARTNER_AVAILABLE: 'No partner could take this job. Support will help.',
  DISPUTED: 'Support is reviewing this booking.',
};

export const TRACK_STEPS: BookingStatus[] = [
  'REQUESTED',
  'DISPATCHING',
  'PARTNER_ASSIGNED',
  'PARTNER_ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETION_PENDING',
  'COMPLETED',
];

export const stepIndex = (status: BookingStatus): number => {
  const index = TRACK_STEPS.indexOf(status);
  return index === -1 ? 0 : index;
};
