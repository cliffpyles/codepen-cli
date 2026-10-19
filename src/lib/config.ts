import { ConfigError } from './errors.js';

export const DEFAULT_BASE_URL = 'https://api.codepen.io';
export const API_KEY_ENV = 'CODEPEN_API_KEY';
export const API_URL_ENV = 'CODEPEN_API_URL';

export interface Config {
  apiKey: string;
  baseUrl: string;
}

export interface ConfigOverrides {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
}

const KEY_PATTERN = /^cp_(user|team)_[A-Za-z0-9_-]+$/;

export function isValidApiKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Resolve configuration. Precedence: explicit overrides (flags) > environment.
 * Throws ConfigError when no key is available so the CLI can print guidance.
 */
export function resolveConfig(
  overrides: ConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const apiKey = overrides.apiKey ?? env[API_KEY_ENV];
  if (!apiKey) {
    throw new ConfigError(
      `No API key found. Set ${API_KEY_ENV} or pass --api-key. ` +
        'Generate a key at https://codepen.io/settings/api',
    );
  }
  if (!isValidApiKey(apiKey)) {
    throw new ConfigError('API key looks malformed. Keys start with cp_user_ or cp_team_.');
  }
  const baseUrl = (overrides.baseUrl ?? env[API_URL_ENV] ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { apiKey, baseUrl };
}
