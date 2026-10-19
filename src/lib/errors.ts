import type { ApiErrorBody, ApiErrorCode } from '../types.js';

export class CodePenApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'UNKNOWN';

  constructor(status: number, body: Partial<ApiErrorBody> | undefined, fallback: string) {
    super(body?.message ?? fallback);
    this.name = 'CodePenApiError';
    this.status = status;
    this.code = body?.code ?? 'UNKNOWN';
  }
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
        return 75; // EX_TEMPFAIL
      default:
        return 1;
    }
  }
  return 1;
}
