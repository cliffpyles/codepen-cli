import { describe, expect, it } from 'vitest';
import { CodePenApiError, ConfigError, exitCodeFor } from './errors.js';

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
