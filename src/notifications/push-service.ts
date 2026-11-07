import type { AuthUser } from '../auth/service';
import { AppError } from '../lib/errors';
import type { PlatformStore } from '../platform/store-contract';
import type { PushToken } from '../platform/types';

const EXPO_TOKEN_PATTERN =
  /^(ExponentPushToken|ApplePushServiceToken)\[[A-Za-z0-9._+:-]{1,200}\]$/;
export type DevicePlatform = 'ios' | 'android' | 'web';
export const MAX_PUSH_TOKENS_PER_USER = 10;

export interface RegisterPushTokenInput {
  expoPushToken: string;
  devicePlatform: DevicePlatform | null;
}

export interface PushService {
  register(actor: AuthUser, input: RegisterPushTokenInput): Promise<PushToken>;
  list(actor: AuthUser): Promise<PushToken[]>;
  deactivate(actor: AuthUser, pushTokenId: string): Promise<void>;
}

export interface PushServiceOptions {
  store: PlatformStore;
  pushEnabled: boolean;
}

export function createPushService({ store, pushEnabled }: PushServiceOptions): PushService {
  function requireEnabled(): void {
    if (!pushEnabled) {
      throw new AppError(
        503,
        'PUSH_NOT_CONFIGURED',
        'Push notifications are not configured in this environment',
      );
    }
  }

  return {
    async register(actor, input) {
      requireEnabled();
      const token = input.expoPushToken.trim();
      if (!EXPO_TOKEN_PATTERN.test(token)) {
        throw new AppError(400, 'INVALID_PUSH_TOKEN', 'expoPushToken is not a valid Expo push token');
      }
      const existing = await store.listPushTokens(actor.id);
      const owned = existing.filter((entry) => entry.active && entry.expoPushToken !== token);
      if (owned.length >= MAX_PUSH_TOKENS_PER_USER) {
        throw new AppError(
          409,
          'PUSH_TOKEN_LIMIT_REACHED',
          `A user may register at most ${MAX_PUSH_TOKENS_PER_USER} active push tokens`,
        );
      }
      return store.upsertPushToken({
        userId: actor.id,
        expoPushToken: token,
        devicePlatform: input.devicePlatform,
      });
    },

    async list(actor) {
      return store.listPushTokens(actor.id);
    },

    async deactivate(actor, pushTokenId) {
      const removed = await store.deactivatePushToken(pushTokenId, actor.id);
      if (!removed) throw new AppError(404, 'PUSH_TOKEN_NOT_FOUND', 'Push token not found');
    },
  };
}
