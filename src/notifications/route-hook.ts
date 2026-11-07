import type { Context } from 'hono';
import type { AppEnv } from '../types';

/** Post-commit realtime/push trigger for a booking mutation response. */
export function notifyBooking(c: Context<AppEnv>, bookingId: string): void {
  const notifier = c.get('notifier');
  if (!notifier) return;
  try {
    notifier.notify(bookingId, c.executionCtx);
  } catch {
    // Non-Workers runtimes expose no ExecutionContext; the cron drain still fans out.
  }
}
