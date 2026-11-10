import { HttpApi, initSession } from './http';
import { SUPPORT_EMAIL, IS_CONFIGURED } from '../config';
import type { FixyesApi } from './types';

/**
 * The app has exactly one data source: the Fixyes Worker API. There is no
 * on-device sample database or fallback account.
 */
export const api: FixyesApi = new HttpApi();

export const isConfigured = IS_CONFIGURED;

export const prepareSession = async (): Promise<void> => {
  if (isConfigured) await initSession();
};

export { SUPPORT_EMAIL };
export type { FixyesApi } from './types';
