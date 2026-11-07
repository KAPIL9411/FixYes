export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DATABASE_URL: string;
  GOOGLE_CLIENT_IDS: string;
  APP_ORIGINS: string;
  ENVIRONMENT: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  EXPO_ACCESS_TOKEN: string;
  REALTIME_TICKET_SECRET: string;
  REALTIME_URL_BASE: string;
  BOOKING_ROOM: DurableObjectNamespace;
  AUTH_RATE_LIMITER?: RateLimiterBinding;
}

export function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isProduction(env: Pick<Env, 'ENVIRONMENT'>): boolean {
  return env.ENVIRONMENT === 'production';
}
