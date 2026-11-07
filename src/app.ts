import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { AuthService } from './auth/service';
import type { RateLimiterBinding } from './env';
import { AppError } from './lib/errors';
import { createRequireAuth, requireRole } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { requestContext } from './middleware/request-context';
import { createAddressRoutes } from './routes/addresses';
import { createAdminRoutes } from './routes/admin';
import { createAuthRoutes } from './routes/auth';
import { createBookingRoutes } from './routes/bookings';
import { createCatalogueRoutes } from './routes/catalogue';
import { createHealthRoutes } from './routes/health';
import { createMeRoutes } from './routes/me';
import { createMediaRoutes } from './routes/media';
import { createPartnerBookingRoutes } from './routes/partner-bookings';
import { createPartnerDispatchRoutes } from './routes/partner-dispatch';
import { createPartnerRoutes } from './routes/partner';
import { createPushRoutes } from './routes/push';
import { createRealtimeRoutes, type RealtimeRouteDependencies } from './routes/realtime';
import type { BookingNotifier } from './notifications/notification-service';
import type { PushService } from './notifications/push-service';
import type { AddressService, BookingService } from './platform/booking-services';
import type { DispatchService } from './platform/dispatch-services';
import type {
  AuditService,
  CatalogueService,
  MediaService,
  PartnerService,
} from './platform/services';
import type { AppEnv } from './types';

const MAX_JSON_BODY_BYTES = 64 * 1024;

export interface PlatformServices {
  catalogueService: CatalogueService;
  partnerService: PartnerService;
  auditService: AuditService;
  mediaService: MediaService;
  addressService: AddressService;
  bookingService: BookingService;
  dispatchService?: DispatchService;
  notifier?: BookingNotifier;
}

export interface AppDependencies {
  authService: AuthService;
  checkDatabase: () => Promise<boolean>;
  rateLimiter?: RateLimiterBinding;
  platform?: PlatformServices;
  realtime?: RealtimeRouteDependencies;
  pushService?: PushService;
}

export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const requireAuth = createRequireAuth((token) => deps.authService.authenticate(token));

  app.use('*', requestContext());
  app.use('*', secureHeaders());
  app.use('*', corsMiddleware());
  app.use('/v1/*', bodyLimit({ maxSize: MAX_JSON_BODY_BYTES }));
  app.onError(errorHandler);

  const notifier = deps.platform?.notifier;
  if (notifier) {
    app.use('*', async (c, next) => {
      c.set('notifier', notifier);
      await next();
    });
  }

  app.route('/v1', createHealthRoutes({ checkDatabase: deps.checkDatabase }));
  app.route(
    '/v1/auth',
    createAuthRoutes({ authService: deps.authService, rateLimiter: deps.rateLimiter }),
  );

  if (deps.platform) {
    app.route('/v1', createCatalogueRoutes(deps.platform.catalogueService));

    app.use('/v1/partner/*', requireAuth);
    app.route('/v1/partner', createPartnerRoutes(deps.platform.partnerService));
    app.route('/v1/partner/bookings', createPartnerBookingRoutes(deps.platform.bookingService));
    if (deps.platform.dispatchService) {
      app.route(
        '/v1/partner',
        createPartnerDispatchRoutes(deps.platform.dispatchService),
      );
    }

    app.use('/v1/addresses', requireAuth);
    app.use('/v1/addresses/*', requireAuth);
    app.route('/v1/addresses', createAddressRoutes(deps.platform.addressService));

    app.use('/v1/bookings', requireAuth);
    app.use('/v1/bookings/*', requireAuth);
    app.route(
      '/v1/bookings',
      createBookingRoutes(deps.platform.bookingService, deps.platform.dispatchService),
    );

    if (deps.realtime) {
      app.route('/v1', createRealtimeRoutes(deps.realtime));
    }

    if (deps.pushService) {
      app.use('/v1/push-tokens', requireAuth);
      app.use('/v1/push-tokens/*', requireAuth);
      app.route('/v1/push-tokens', createPushRoutes(deps.pushService));
    }

    app.use('/v1/media/*', requireAuth);
    app.route('/v1/media', createMediaRoutes(deps.platform.mediaService));

    app.use('/v1/admin/*', requireAuth, requireRole('ADMIN'));
    app.route(
      '/v1/admin',
      createAdminRoutes({
        catalogueService: deps.platform.catalogueService,
        partnerService: deps.platform.partnerService,
        auditService: deps.platform.auditService,
        dispatchService: deps.platform.dispatchService,
      }),
    );
  }

  app.use('/v1/me', requireAuth);
  app.route('/v1', createMeRoutes());

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: c.get('requestId') ?? 'unknown',
        },
      },
      404,
    ),
  );

  return app;
}

export function unavailableAuthService(): AuthService {
  const unavailable = async (): Promise<never> => {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Authentication is not configured');
  };
  return {
    issueNonce: unavailable,
    loginWithGoogle: unavailable,
    authenticate: async () => null,
    rotate: unavailable,
    logout: async () => undefined,
  };
}
