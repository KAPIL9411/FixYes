import type { Env } from './env';
import type { AuthContext } from './auth/service';
import type { BookingNotifier } from './notifications/notification-service';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    auth: AuthContext;
    notifier?: BookingNotifier;
  };
};
