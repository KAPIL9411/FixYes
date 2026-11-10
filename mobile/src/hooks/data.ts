import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { isActiveStatus } from '../lib/format';

export const qk = {
  categories: ['categories'] as const,
  items: (categoryId?: string) => ['items', categoryId ?? 'all'] as const,
  bookings: ['bookings'] as const,
  booking: (id: string) => ['booking', id] as const,
  events: (id: string) => ['booking-events', id] as const,
  addresses: ['addresses'] as const,
  partner: ['partner-profile'] as const,
  availability: ['partner-availability'] as const,
  offers: ['partner-offers'] as const,
  partnerJobs: ['partner-jobs'] as const,
  zones: (cityId?: string) => ['zones', cityId ?? 'none'] as const,
  partnerZones: ['partner-zones'] as const,
};

export const useCities = () =>
  useQuery({ queryKey: ['cities'], queryFn: () => api.getCities(), staleTime: 60_000 });

export const useCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: () => api.getCategories(), staleTime: 60_000 });

export const useItems = (categoryId?: string) =>
  useQuery({
    queryKey: qk.items(categoryId),
    queryFn: () => api.getItems(categoryId),
    staleTime: 60_000,
  });

export const useBookings = () =>
  useQuery({
    queryKey: qk.bookings,
    queryFn: () => api.listBookings(),
    refetchInterval: 8_000,
  });

export const useBooking = (id: string) =>
  useQuery({
    queryKey: qk.booking(id),
    queryFn: () => api.getBooking(id),
    refetchInterval: 5_000,
    enabled: Boolean(id),
  });

export const useBookingEvents = (id: string) =>
  useQuery({
    queryKey: qk.events(id),
    queryFn: () => api.getBookingEvents(id),
    refetchInterval: 6_000,
    enabled: Boolean(id),
  });

export const useAddresses = () =>
  useQuery({ queryKey: qk.addresses, queryFn: () => api.listAddresses() });

export const usePartnerProfile = () =>
  useQuery({
    queryKey: qk.partner,
    queryFn: () => api.getPartnerProfile(),
    refetchInterval: 4_000,
  });

export const useAvailability = () =>
  useQuery({
    queryKey: qk.availability,
    queryFn: () => api.getAvailability(),
    refetchInterval: 6_000,
  });

export const useOffers = (enabled = true) =>
  useQuery({
    queryKey: qk.offers,
    queryFn: () => api.listOffers(),
    refetchInterval: 2_500,
    enabled,
  });

export const usePartnerJobs = () =>
  useQuery({
    queryKey: qk.partnerJobs,
    queryFn: () => api.listPartnerJobs(),
    refetchInterval: 8_000,
  });

export const useZones = (cityId?: string) =>
  useQuery({
    queryKey: qk.zones(cityId),
    queryFn: () => api.getZones(cityId as string),
    enabled: Boolean(cityId),
    staleTime: 60_000,
  });

export const usePartnerZones = () =>
  useQuery({ queryKey: qk.partnerZones, queryFn: () => api.getPartnerZones() });

export const splitBookings = <T extends { status: Parameters<typeof isActiveStatus>[0] }>(bookings: T[]) => ({
  active: bookings.filter((booking) => isActiveStatus(booking.status)),
  past: bookings.filter((booking) => !isActiveStatus(booking.status)),
});
