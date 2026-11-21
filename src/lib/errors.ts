import type { ApiErrorBody, ApiErrorCode } from '../types.js';

export class CodePenApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'UNKNOWN';
  readonly field: string | undefined;
  readonly details: Record<string, unknown> | undefined;
  /** On RATE_LIMITED: seconds until the counter resets, the allowance, and when it resets. */
  readonly retryAfterSeconds: number | undefined;
  readonly limit: number | undefined;
  readonly resetAt: string | undefined;

  constructor(status: number, body: Partial<ApiErrorBody> | undefined, fallback: string) {
    super(body?.message ?? fallback);
    this.name = 'CodePenApiError';
    this.status = status;
    this.code = body?.code ?? 'UNKNOWN';
    this.field = body?.field;
    this.details = body?.details;
    this.retryAfterSeconds = body?.retry_after_seconds;
    this.limit = body?.limit;
    this.resetAt = body?.reset_at ?? undefined;
  }
}

/** A wait in seconds as the largest two units, such as `14h 24m` or `45s`. */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const units: [string, number][] = [
    ['d', 86_400],
    ['h', 3_600],
    ['m', 60],
    ['s', 1],
  ];
  const parts: string[] = [];
  let rest = s;
  for (const [unit, size] of units) {
    const n = Math.floor(rest / size);
    if (n > 0 || (unit === 's' && parts.length === 0)) parts.push(`${n}${unit}`);
    rest -= n * size;
    if (parts.length === 2) break;
  }
  return parts.join(' ');
}

/** When a rate-limited request can be retried, from the fields the API sends; undefined otherwise. */
export function retryHint(error: CodePenApiError): string | undefined {
  if (error.code !== 'RATE_LIMITED') return undefined;
  const wait =
    error.retryAfterSeconds === undefined ? '' : ` in ${formatWait(error.retryAfterSeconds)}`;
  const at = error.resetAt ? ` (at ${error.resetAt})` : '';
  if (!wait && !at) return undefined;
  const allowance = error.limit === undefined ? '' : ` The limit is ${error.limit}.`;
  return `Try again${wait}${at}.${allowance}`;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Exit codes follow sysexits.h where a sensible mapping exists. */
export function exitCodeFor(error: unknown): number {
  if (error instanceof ConfigError) return 78; // EX_CONFIG
  if (error instanceof CodePenApiError) {
    switch (error.code) {
      case 'UNAUTHENTICATED':
        return 77; // EX_NOPERM
      case 'BAD_USER_INPUT':
        return 64; // EX_USAGE
      case 'NOT_FOUND':
        return 66; // EX_NOINPUT
      case 'RATE_LIMITED':
      case 'BUILD_TIMEOUT':
        return 75; // EX_TEMPFAIL
      default:
        return 1;
    }
  }
  return 1;
}
