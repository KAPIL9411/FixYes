const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_RECEIPT_IDS_PER_REQUEST = 1_000;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default';
  ttl?: number;
}

export interface ExpoOutcome {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

export interface ExpoTicket extends ExpoOutcome {
  id?: string;
}

/** A failure that is worth retrying: transport error, rate limit or 5xx. */
export class ExpoPushTransientError extends Error {}

export interface ExpoPushSender {
  send(messages: ExpoPushMessage[]): Promise<ExpoTicket[]>;
  getReceipts(ticketIds: string[]): Promise<Map<string, ExpoOutcome>>;
}

export interface ExpoPushConfig {
  EXPO_ACCESS_TOKEN: string;
}

function isDeviceNotRegistered(outcome: ExpoOutcome): boolean {
  return outcome.details?.error === 'DeviceNotRegistered';
}

export { isDeviceNotRegistered };

function headers(config: ExpoPushConfig): Record<string, string> {
  const entries: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    'accept-encoding': 'gzip, deflate',
  };
  if (config.EXPO_ACCESS_TOKEN) entries.authorization = `Bearer ${config.EXPO_ACCESS_TOKEN}`;
  return entries;
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export function createExpoPushSender(
  config: ExpoPushConfig,
  fetchImpl: typeof fetch = fetch,
): ExpoPushSender {
  async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: headers(config),
        body: JSON.stringify(body),
      });
    } catch {
      throw new ExpoPushTransientError('Expo push request failed');
    }

    if (response.status === 429 || response.status >= 500) {
      throw new ExpoPushTransientError(`Expo push returned ${response.status}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new ExpoPushTransientError('Expo push returned an unreadable response');
    }

    if (!response.ok || Array.isArray(parsed.errors)) {
      throw new ExpoPushTransientError('Expo push rejected the request');
    }
    return parsed;
  }

  return {
    async send(messages) {
      if (messages.length === 0) return [];
      const tickets: ExpoTicket[] = [];
      for (const group of chunk(messages, MAX_MESSAGES_PER_REQUEST)) {
        const parsed = await post(SEND_URL, group);
        const data = Array.isArray(parsed.data) ? parsed.data : [];
        for (const entry of data) {
          tickets.push((entry ?? { status: 'error' }) as ExpoTicket);
        }
        if (data.length !== group.length) {
          throw new ExpoPushTransientError('Expo push ticket count mismatch');
        }
      }
      return tickets;
    },

    async getReceipts(ticketIds) {
      const receipts = new Map<string, ExpoOutcome>();
      for (const group of chunk(ticketIds, MAX_RECEIPT_IDS_PER_REQUEST)) {
        if (group.length === 0) continue;
        const parsed = await post(RECEIPTS_URL, { ids: group });
        const data = (parsed.data ?? {}) as Record<string, ExpoOutcome>;
        for (const [ticketId, outcome] of Object.entries(data)) {
          receipts.set(ticketId, outcome);
        }
      }
      return receipts;
    },
  };
}
