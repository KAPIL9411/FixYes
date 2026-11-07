import type { Env } from '../../src/env';

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: '',
    GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com',
    APP_ORIGINS: 'http://localhost:8081',
    ENVIRONMENT: 'test',
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    EXPO_ACCESS_TOKEN: '',
    REALTIME_TICKET_SECRET: '',
    REALTIME_URL_BASE: '',
    BOOKING_ROOM: {} as DurableObjectNamespace,
    ...overrides,
  };
}
