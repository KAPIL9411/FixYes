import { createApp, unavailableAuthService, type AppDependencies } from './app';
import { createAuthRepository } from './auth/repository';
import { createAuthService } from './auth/service';
import { verifyGoogleIdToken } from './auth/google-token';
import { checkDatabase } from './db/health';
import { parseList, type Env } from './env';
import { createBookingNotifier, createNotificationService } from './notifications/notification-service';
import { createExpoPushSender, type ExpoPushSender } from './notifications/expo-push';
import { createPushService } from './notifications/push-service';
import { createPlatformStore } from './platform/store';
import { createAddressService, createBookingService } from './platform/booking-services';
import { createDispatchService } from './platform/dispatch-services';
import {
  createAuditService,
  createCatalogueService,
  createMediaService,
  createPartnerService,
} from './platform/services';
import {
  createDurableObjectGateway,
  createDurableObjectUpgrader,
  noopRealtimeGateway,
  unavailableUpgrader,
  type RealtimeGateway,
  type RealtimeUpgrader,
} from './realtime/gateway';
import { createRealtimeService } from './realtime/realtime-service';
import type { RealtimeRouteDependencies } from './routes/realtime';

export { BookingRoom } from './durable-objects/booking-room';

function realtimeSecret(env: Env): string | null {
  const secret = env.REALTIME_TICKET_SECRET?.trim();
  return secret && env.BOOKING_ROOM ? secret : null;
}

function realtimeGateway(env: Env, secret: string | null): RealtimeGateway {
  return secret ? createDurableObjectGateway(env.BOOKING_ROOM, secret) : noopRealtimeGateway();
}

function upgrader(env: Env, secret: string | null): RealtimeUpgrader {
  return secret ? createDurableObjectUpgrader(env.BOOKING_ROOM) : unavailableUpgrader();
}

function expoSender(env: Env): ExpoPushSender | null {
  return env.EXPO_ACCESS_TOKEN?.trim() ? createExpoPushSender({ EXPO_ACCESS_TOKEN: env.EXPO_ACCESS_TOKEN }) : null;
}

function dependencies(env: Env): AppDependencies {
  const authService = env.DATABASE_URL
    ? createAuthService({
        repository: createAuthRepository(env.DATABASE_URL),
        verifyGoogleToken: verifyGoogleIdToken,
        audiences: parseList(env.GOOGLE_CLIENT_IDS),
      })
    : unavailableAuthService();

  if (!env.DATABASE_URL) {
    return {
      authService,
      checkDatabase: () => checkDatabase(env.DATABASE_URL),
      rateLimiter: env.AUTH_RATE_LIMITER,
    };
  }

  const store = createPlatformStore(env.DATABASE_URL);
  const secret = realtimeSecret(env);
  const push = expoSender(env);
  const notificationService = createNotificationService({
    store,
    realtime: realtimeGateway(env, secret),
    push,
  });

  const realtime: RealtimeRouteDependencies = {
    realtimeService: secret ? createRealtimeService({ store, secret }) : null,
    upgrader: upgrader(env, secret),
  };

  return {
    authService,
    checkDatabase: () => checkDatabase(env.DATABASE_URL),
    rateLimiter: env.AUTH_RATE_LIMITER,
    realtime,
    pushService: createPushService({ store, pushEnabled: push !== null }),
    platform: {
      catalogueService: createCatalogueService(store),
      partnerService: createPartnerService(store),
      auditService: createAuditService(store),
      mediaService: createMediaService({
        store,
        config: {
          cloudName: env.CLOUDINARY_CLOUD_NAME,
          apiKey: env.CLOUDINARY_API_KEY,
          apiSecret: env.CLOUDINARY_API_SECRET,
        },
      }),
      addressService: createAddressService(store),
      bookingService: createBookingService(store),
      dispatchService: createDispatchService({ store }),
      notifier: createBookingNotifier(notificationService),
    },
  };
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return createApp(dependencies(env)).fetch(request, env, ctx);
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    if (!env.DATABASE_URL) return;
    const store = createPlatformStore(env.DATABASE_URL);
    const dispatchService = createDispatchService({ store });
    const notificationService = createNotificationService({
      store,
      realtime: realtimeGateway(env, realtimeSecret(env)),
      push: expoSender(env),
    });

    ctx.waitUntil(
      (async () => {
        await dispatchService.expireOffers(new Date());
        await notificationService.drainDue();
        await notificationService.retryDueDeliveries();
        await notificationService.reconcileReceipts();
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
