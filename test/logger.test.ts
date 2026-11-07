import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../src/lib/logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('structured logging', () => {
  it('redacts sensitive keys at any depth', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    log('info', {
      requestId: 'req-1',
      path: '/v1/auth/google',
      token: 'secret-token',
      email: 'customer@example.com',
      address: '12 Main Street',
      nested: { authorization: 'Bearer abc', nonce: 'abc', status: 200 },
    });

    const line = spy.mock.calls[0]?.[0];
    expect(typeof line).toBe('string');
    const parsed = JSON.parse(line as string) as Record<string, unknown>;

    expect(parsed.requestId).toBe('req-1');
    expect(parsed.path).toBe('/v1/auth/google');
    expect(parsed.token).toBe('[redacted]');
    expect(parsed.email).toBe('[redacted]');
    expect(parsed.address).toBe('[redacted]');
    expect(parsed.nested).toEqual({
      authorization: '[redacted]',
      nonce: '[redacted]',
      status: 200,
    });
  });
});
