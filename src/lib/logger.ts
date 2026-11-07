const SENSITIVE_KEY = /(authorization|token|secret|password|email|address|phone|nonce|idtoken|ip|useragent)/i;
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[redacted-depth]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactValue(item, depth + 1));
    return value.length > MAX_ARRAY_ITEMS ? [...items, '[truncated]'] : items;
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactValue(entry, depth + 1);
  }
  return output;
}

export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, fields: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    ...(redactValue(fields, 0) as Record<string, unknown>),
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}
