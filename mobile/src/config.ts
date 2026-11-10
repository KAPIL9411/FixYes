import Constants from 'expo-constants';

type Extra = {
  apiBaseUrl?: string;
  googleClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
  supportEmail?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const clean = (value: string | undefined): string => (value ?? '').trim();

export const API_BASE_URL = clean(process.env.EXPO_PUBLIC_API_BASE_URL ?? extra.apiBaseUrl);
export const GOOGLE_CLIENT_ID = clean(
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? extra.googleClientId,
);
export const GOOGLE_IOS_CLIENT_ID = clean(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? extra.googleIosClientId,
);
export const GOOGLE_ANDROID_CLIENT_ID = clean(
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? extra.googleAndroidClientId,
);
export const SUPPORT_EMAIL = clean(process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? extra.supportEmail);

/**
 * A release build may only talk to an HTTPS backend. Plain HTTP is accepted
 * for local development on a simulator or emulator.
 */
const isLocalHttp =
  API_BASE_URL.startsWith('http://localhost') ||
  API_BASE_URL.startsWith('http://127.0.0.1') ||
  API_BASE_URL.startsWith('http://10.0.2.2');

export const INSECURE_API_URL = Boolean(
  API_BASE_URL && !API_BASE_URL.startsWith('https://') && !(isLocalHttp && __DEV__),
);

export const IS_CONFIGURED = Boolean(API_BASE_URL && GOOGLE_CLIENT_ID && !INSECURE_API_URL);

export const CONFIG_ERROR = INSECURE_API_URL
  ? 'The production API must use HTTPS.'
  : !API_BASE_URL
    ? 'The Fixyes API URL is missing.'
    : !GOOGLE_CLIENT_ID
      ? 'The Google sign-in client ID is missing.'
      : null;
