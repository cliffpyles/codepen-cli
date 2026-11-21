import { describe, expect, it } from 'vitest';
import { CodePenApiError, ConfigError, exitCodeFor, formatWait, retryHint } from './errors.js';

describe('CodePenApiError', () => {
  it('uses the API message and code when present', () => {
    const err = new CodePenApiError(
      404,
      { message: 'Pen not found', code: 'NOT_FOUND' },
      'fallback',
    );
    expect(err.message).toBe('Pen not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.name).toBe('CodePenApiError');
  });

  it('falls back when the body is missing', () => {
    const err = new CodePenApiError(502, undefined, 'HTTP 502 Bad Gateway');
    expect(err.message).toBe('HTTP 502 Bad Gateway');
    expect(err.code).toBe('UNKNOWN');
  });
});

describe('rate limits', () => {
  const limited = (body: Record<string, unknown>) =>
    new CodePenApiError(
      429,
      { message: 'daily limit reached', code: 'RATE_LIMITED', ...body },
      'x',
    );

  it('keeps the recovery fields the API sends', () => {
    const err = limited({ retry_after_seconds: 51840, limit: 5, reset_at: '2026-10-28T09:00:00Z' });
    expect(err.retryAfterSeconds).toBe(51840);
    expect(err.limit).toBe(5);
    expect(err.resetAt).toBe('2026-10-28T09:00:00Z');
    expect(limited({ reset_at: null }).resetAt).toBeUndefined();
  });

  it('says when to retry, with whatever fields are known', () => {
    expect(
      retryHint(
        limited({ retry_after_seconds: 51840, limit: 5, reset_at: '2026-10-28T09:00:00Z' }),
      ),
    ).toBe('Try again in 14h 24m (at 2026-10-28T09:00:00Z). The limit is 5.');
    expect(retryHint(limited({ retry_after_seconds: 45 }))).toBe('Try again in 45s.');
    expect(retryHint(limited({ reset_at: '2026-10-28T09:00:00Z' }))).toBe(
      'Try again (at 2026-10-28T09:00:00Z).',
    );
  });

  it('says nothing without recovery fields, or for other errors', () => {
    expect(retryHint(limited({}))).toBeUndefined();
    expect(retryHint(limited({ limit: 5 }))).toBeUndefined();
    expect(
      retryHint(new CodePenApiError(404, { message: 'x', code: 'NOT_FOUND' }, 'x')),
    ).toBeUndefined();
  });

  it('formats waits as the two largest units', () => {
    expect(formatWait(0)).toBe('0s');
    expect(formatWait(59.2)).toBe('1m');
    expect(formatWait(3600)).toBe('1h');
    expect(formatWait(90061)).toBe('1d 1h');
    expect(formatWait(125)).toBe('2m 5s');
  });
});

describe('exitCodeFor', () => {
  it.each([
    ['UNAUTHENTICATED', 77],
    ['BAD_USER_INPUT', 64],
    ['NOT_FOUND', 66],
    ['RATE_LIMITED', 75],
    ['FORBIDDEN', 1],
    ['CONFLICT', 1],
    ['INTERNAL', 1],
  ] as const)('maps %s to %i', (code, expected) => {
    expect(exitCodeFor(new CodePenApiError(400, { message: 'x', code }, 'x'))).toBe(expected);
  });

  it('maps ConfigError to 78 and unknown errors to 1', () => {
    expect(exitCodeFor(new ConfigError('x'))).toBe(78);
    expect(exitCodeFor(new Error('x'))).toBe(1);
    expect(exitCodeFor('string')).toBe(1);
  });
});
