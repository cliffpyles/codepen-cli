import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ConfigError } from './errors.js';

export const CONFIG_PATH_ENV = 'CODEPEN_CONFIG_PATH';

export interface StoredConfig {
  api_key?: string;
}

/**
 * Where the CLI keeps its config file.
 * Precedence: $CODEPEN_CONFIG_PATH > $XDG_CONFIG_HOME/codepen/config.json
 * > %APPDATA%\codepen\config.json (Windows) > ~/.config/codepen/config.json
 */
export function configPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  const explicit = env[CONFIG_PATH_ENV];
  if (explicit) return explicit;
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, 'codepen', 'config.json');
  if (platform === 'win32' && env.APPDATA) return join(env.APPDATA, 'codepen', 'config.json');
  return join(home, '.config', 'codepen', 'config.json');
}

/** Read the config file. A missing file is an empty config; a corrupt one is a ConfigError. */
export function readStore(path: string): StoredConfig {
  if (!existsSync(path)) return {};
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new ConfigError(`Could not read ${path}: ${describe(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(`Config file ${path} is not valid JSON. Fix or delete it.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`Config file ${path} must contain a JSON object.`);
  }
  const record = parsed as Record<string, unknown>;
  const store: StoredConfig = {};
  if (typeof record.api_key === 'string') store.api_key = record.api_key;
  return store;
}

/** Write the config file with owner-only permissions (0600, directory 0700). */
export function writeStore(path: string, store: StoredConfig): void {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    // writeFileSync only applies mode on creation; enforce it for existing files too.
    chmodSync(path, 0o600);
  } catch (error) {
    throw new ConfigError(`Could not write ${path}: ${describe(error)}`);
  }
}

/** Remove the config file. Returns false when there was nothing to remove. */
export function deleteStore(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    rmSync(path);
  } catch (error) {
    throw new ConfigError(`Could not delete ${path}: ${describe(error)}`);
  }
  return true;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
