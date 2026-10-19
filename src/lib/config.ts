import { ConfigError } from './errors.js';
import { configPath, readStore } from './store.js';

export const DEFAULT_BASE_URL = 'https://api.codepen.io';
export const API_KEY_ENV = 'CODEPEN_API_KEY';
export const API_URL_ENV = 'CODEPEN_API_URL';

export type KeySource = 'flag' | 'env' | 'file';

export interface Config {
  apiKey: string;
  baseUrl: string;
  /** Where the key came from, for `auth status`. */
  source: KeySource;
  /** The config file consulted (whether or not it supplied the key). */
  configPath: string;
}

export interface ConfigOverrides {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
}

const KEY_PATTERN = /^cp_(user|team)_[A-Za-z0-9_-]+$/;

export function isValidApiKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** Show enough of a key to recognise it without exposing it: cp_user_ab…wxyz */
export function maskApiKey(key: string): string {
  const prefix = /^cp_(user|team)_/.exec(key)?.[0] ?? '';
  const rest = key.slice(prefix.length);
  if (rest.length <= 6) return `${prefix}${'•'.repeat(rest.length)}`;
  return `${prefix}${rest.slice(0, 2)}…${rest.slice(-4)}`;
}

export function keyKind(key: string): 'personal' | 'team' | 'unknown' {
  if (key.startsWith('cp_user_')) return 'personal';
  if (key.startsWith('cp_team_')) return 'team';
  return 'unknown';
}

export function missingKeyMessage(path: string): string {
  return (
    `No API key found. Run \`codepen auth login\`, set ${API_KEY_ENV}, or pass --api-key. ` +
    `(Config file: ${path}. Generate a key at https://codepen.io/settings/api)`
  );
}

/**
 * Resolve configuration. Precedence for the key: --api-key flag > $CODEPEN_API_KEY > config file.
 * Throws ConfigError when no key is available so the CLI can print guidance.
 */
export function resolveConfig(
  overrides: ConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const path = configPath(env);
  let apiKey: string | undefined;
  let source: KeySource;

  if (overrides.apiKey) {
    apiKey = overrides.apiKey;
    source = 'flag';
  } else if (env[API_KEY_ENV]) {
    apiKey = env[API_KEY_ENV];
    source = 'env';
  } else {
    apiKey = readStore(path).api_key;
    source = 'file';
  }

  if (!apiKey) throw new ConfigError(missingKeyMessage(path));
  if (!isValidApiKey(apiKey)) {
    throw new ConfigError(
      `API key from ${describeSource(source, path)} looks malformed. Keys start with cp_user_ or cp_team_.`,
    );
  }
  const baseUrl = (overrides.baseUrl ?? env[API_URL_ENV] ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { apiKey, baseUrl, source, configPath: path };
}

export function describeSource(source: KeySource, path: string): string {
  switch (source) {
    case 'flag':
      return '--api-key flag';
    case 'env':
      return `$${API_KEY_ENV}`;
    case 'file':
      return path;
  }
}
