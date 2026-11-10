import type {
  Address,
  AddressInput,
  AuthUser,
  BookingEvent,
  BookingStatus,
  BookingSummary,
  Category,
  City,
  FixyesApi,
  PartnerAvailability,
  PartnerOffer,
  PartnerProfile,
  RealtimeTicket,
  ServiceItem,
  Zone,
} from './types';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ApiError } from '../lib/errors';
import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'fixyes.token';

const baseUrl = (): string => {
  if (!API_BASE_URL) throw new ApiError(500, 'API_NOT_CONFIGURED', 'EXPO_PUBLIC_API_BASE_URL is not set.');
  const trimmed = API_BASE_URL.replace(/\/$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
};

const webStore = (): Storage | null => {
  if (Platform.OS !== 'web') return null;
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
};

const readStoredToken = async (): Promise<string | null> => {
  try {
    const web = webStore();
    if (web) return web.getItem(TOKEN_KEY);
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
};

const persistToken = async (token: string | null): Promise<void> => {
  try {
    const web = webStore();
    if (web) {
      if (token) web.setItem(TOKEN_KEY, token);
      else web.removeItem(TOKEN_KEY);
      return;
    }
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Storage failures must not break the request that already succeeded.
  }
};

let tokenCache: string | null = null;
let tokenReady = false;

export const initSession = async (): Promise<void> => {
  if (tokenReady) return;
  tokenCache = await readStoredToken();
  tokenReady = true;
};

const readToken = (): string | null => tokenCache;

const writeToken = (token: string | null) => {
  tokenCache = token;
  tokenReady = true;
  void persistToken(token);
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  /** Internal guard so a refresh request cannot trigger another refresh. */
  retryAuth?: boolean;
}

interface ErrorPayload {
  error?: { code?: string; message?: string } | string;
  message?: string;
}

export class HttpApi implements FixyesApi {
  private refreshPromise: Promise<boolean> | null = null;

  private refreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    if (!readToken()) return Promise.resolve(false);

    this.refreshPromise = (async () => {
      try {
        const result = await this.request<{ token: string }>('/auth/refresh', {
          method: 'POST',
          retryAuth: false,
        });
        writeToken(result.token);
        return true;
      } catch {
        writeToken(null);
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const token = readToken();
    if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(`${baseUrl()}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Network unavailable. Check your connection and try again.');
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      if (
        response.status === 401 &&
        options.auth !== false &&
        options.retryAuth !== false &&
        readToken()
      ) {
        const refreshed = await this.refreshSession();
        if (refreshed) return this.request<T>(path, { ...options, retryAuth: false });
      }

      const error = (payload ?? {}) as ErrorPayload;
      const nested = typeof error.error === 'object' ? error.error : null;
      const message =
        nested?.message ??
        (typeof error.error === 'string' ? error.error : undefined) ??
        error.message ??
        'Request failed. Please try again.';
      const code = nested?.code ?? `HTTP_${response.status}`;
      if (response.status === 401 && options.auth !== false) writeToken(null);
      throw new ApiError(response.status, code, message);
    }

    return payload as T;
  }

  async getSessionUser(): Promise<AuthUser | null> {
    if (!readToken()) return null;
    try {
      const { user } = await this.request<{ user: AuthUser }>('/me');
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }

  async beginGoogleSignIn(): Promise<string> {
    const { nonce } = await this.request<{ nonce: string }>('/auth/nonce', {
      method: 'POST',
      auth: false,
    });
    return nonce;
  }

  async signInWithGoogle(credential: string, nonce: string): Promise<AuthUser> {
    const result = await this.request<{ token: string; expiresAt: string; user: AuthUser }>(
      '/auth/google',
      { method: 'POST', auth: false, body: { idToken: credential, nonce } },
    );
    writeToken(result.token);
    return result.user;
  }

  async signOut(): Promise<void> {
    try {
      await this.request<void>('/auth/logout', { method: 'POST' });
    } catch {
      // Logging out locally is enough if the network is down.
    } finally {
      writeToken(null);
    }
  }

  async getCities(): Promise<City[]> {
    const { cities } = await this.request<{ cities: City[] }>('/service-cities');
    return cities;
  }

  async getZones(cityId: string): Promise<Zone[]> {
    const { zones } = await this.request<{ zones: Zone[] }>(
      `/service-zones?cityId=${encodeURIComponent(cityId)}`,
    );
    return zones;
  }

  async getCategories(): Promise<Category[]> {
    const { categories } = await this.request<{ categories: Category[] }>('/service-categories');
    return categories;
  }

  async getItems(categoryId?: string): Promise<ServiceItem[]> {
    const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
    const { items } = await this.request<{ items: ServiceItem[] }>(`/service-items${query}`);
    return items;
  }

  async listAddresses(): Promise<Address[]> {
    const { addresses } = await this.request<{ addresses: Address[] }>('/addresses');
    return addresses;
  }

  async createAddress(input: AddressInput): Promise<Address> {
    const { address } = await this.request<{ address: Address }>('/addresses', {
      method: 'POST',
      body: input,
    });
    return address;
  }

  async updateAddress(id: string, input: Partial<AddressInput>): Promise<Address> {
    const { address } = await this.request<{ address: Address }>(`/addresses/${id}`, {
      method: 'PATCH',
      body: input,
    });
    return address;
  }

  async deleteAddress(id: string): Promise<void> {
    await this.request<void>(`/addresses/${id}`, { method: 'DELETE' });
  }

  async listBookings(): Promise<BookingSummary[]> {
    const { bookings } = await this.request<{ bookings: BookingSummary[] }>('/bookings?limit=50');
    return bookings;
  }

  async getBooking(id: string): Promise<BookingSummary> {
    const { booking } = await this.request<{ booking: BookingSummary }>(`/bookings/${id}`);
    return booking;
  }

  async getBookingEvents(id: string, afterSequence = 0): Promise<BookingEvent[]> {
    const { events } = await this.request<{ events: BookingEvent[] }>(
      `/bookings/${id}/events?afterSequence=${afterSequence}`,
    );
    return events;
  }

  async createBooking(
    input: { serviceItemId: string; addressId: string; scheduledAt?: string },
    idempotencyKey: string,
  ): Promise<BookingSummary> {
    const { booking } = await this.request<{ booking: BookingSummary }>('/bookings', {
      method: 'POST',
      body: input,
      idempotencyKey,
    });
    return booking;
  }

  async cancelBooking(id: string, reason?: string, expectedVersion?: number): Promise<BookingSummary> {
    const { booking } = await this.request<{ booking: BookingSummary }>(`/bookings/${id}/cancel`, {
      method: 'POST',
      body: {
        ...(reason ? { reason } : {}),
        ...(expectedVersion ? { expectedVersion } : {}),
      },
    });
    return booking;
  }

  async completeBooking(id: string, expectedVersion?: number): Promise<BookingSummary> {
    const { booking } = await this.request<{ booking: BookingSummary }>(`/bookings/${id}/complete`, {
      method: 'POST',
      body: expectedVersion ? { expectedVersion } : {},
    });
    return booking;
  }

  async getPartnerProfile(): Promise<PartnerProfile | null> {
    try {
      const { profile } = await this.request<{ profile: PartnerProfile }>('/partner/profile');
      return profile;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.code === 'PARTNER_NOT_FOUND')) {
        return null;
      }
      throw error;
    }
  }

  async onboardPartner(input: {
    serviceCityId: string;
    bio?: string;
    skills: string[];
  }): Promise<PartnerProfile> {
    const { profile } = await this.request<{ profile: PartnerProfile }>('/partner/onboarding', {
      method: 'POST',
      body: input,
    });
    return profile;
  }

  async getAvailability(): Promise<PartnerAvailability> {
    const { availability } = await this.request<{ availability: PartnerAvailability }>(
      '/partner/availability',
    );
    return availability;
  }

  async setAvailability(input: { isOnline: boolean }): Promise<PartnerAvailability> {
    const { availability } = await this.request<{ availability: PartnerAvailability }>(
      '/partner/availability',
      { method: 'PATCH', body: input },
    );
    return availability;
  }

  async getPartnerZones(): Promise<string[]> {
    const { zoneIds } = await this.request<{ zoneIds: string[] }>('/partner/service-zones');
    return zoneIds;
  }

  async setPartnerZones(ids: string[]): Promise<string[]> {
    const { zoneIds } = await this.request<{ zoneIds: string[] }>('/partner/service-zones', {
      method: 'PUT',
      body: { zoneIds: ids },
    });
    return zoneIds;
  }

  async listOffers(): Promise<PartnerOffer[]> {
    const { offers } = await this.request<{ offers: PartnerOffer[] }>('/partner/offers');
    return offers;
  }

  async acceptOffer(id: string): Promise<BookingSummary> {
    const { booking } = await this.request<{ booking: BookingSummary }>(
      `/partner/offers/${id}/accept`,
      { method: 'POST' },
    );
    return booking;
  }

  async rejectOffer(id: string): Promise<void> {
    await this.request<{ booking: BookingSummary }>(`/partner/offers/${id}/reject`, {
      method: 'POST',
    });
  }

  async listPartnerJobs(): Promise<BookingSummary[]> {
    const { bookings } = await this.request<{ bookings: BookingSummary[] }>(
      '/partner/bookings?limit=50',
    );
    return bookings;
  }

  async setPartnerJobStatus(
    id: string,
    status: BookingStatus,
    reason?: string,
  ): Promise<BookingSummary> {
    const { booking } = await this.request<{ booking: BookingSummary }>(
      `/partner/bookings/${id}/status`,
      {
        method: 'POST',
        body: { status, ...(reason ? { reason } : {}) },
      },
    );
    return booking;
  }

  async getRealtimeTicket(id: string): Promise<RealtimeTicket | null> {
    try {
      const { realtime } = await this.request<{ realtime: RealtimeTicket }>(
        `/bookings/${id}/realtime-ticket`,
        { method: 'POST' },
      );
      return realtime;
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) return null;
      throw error;
    }
  }
}

