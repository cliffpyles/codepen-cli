import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BASE_URL,
  describeSource,
  isValidApiKey,
  keyKind,
  maskApiKey,
  resolveConfig,
} from './config.js';
import { ConfigError } from './errors.js';
import { writeStore } from './store.js';

let dir: string;
let file: string;
let base: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-config-'));
  file = join(dir, 'config.json');
  base = { CODEPEN_CONFIG_PATH: file };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('isValidApiKey', () => {
  it.each(['cp_user_abc', 'cp_team_ABC-123_x'])('accepts %s', (key) => {
    expect(isValidApiKey(key)).toBe(true);
  });
  it.each(['', 'abc', 'cp_user_', 'cp_other_abc', 'cp_user_with space'])('rejects %j', (key) => {
    expect(isValidApiKey(key)).toBe(false);
  });
});

describe('maskApiKey / keyKind', () => {
  it('keeps the prefix, two leading and four trailing characters', () => {
    expect(maskApiKey('cp_user_abcdefghijkl')).toBe('cp_user_ab…ijkl');
    expect(maskApiKey('cp_team_abcdefghijkl')).toBe('cp_team_ab…ijkl');
  });
  it('fully masks short or unprefixed keys', () => {
    expect(maskApiKey('cp_user_abc')).toBe('cp_user_•••');
    expect(maskApiKey('short')).toBe('•••••');
  });
  it('classifies keys', () => {
    expect(keyKind('cp_user_x')).toBe('personal');
    expect(keyKind('cp_team_x')).toBe('team');
    expect(keyKind('x')).toBe('unknown');
  });
});

describe('resolveConfig', () => {
  it('reads the key from the environment with the default URL', () => {
    const config = resolveConfig({}, { ...base, CODEPEN_API_KEY: 'cp_user_env' });
    expect(config).toEqual({
      apiKey: 'cp_user_env',
      baseUrl: DEFAULT_BASE_URL,
      source: 'env',
      configPath: file,
    });
  });

  it('prefers the flag over the environment and the file', () => {
    writeStore(file, { api_key: 'cp_user_file' });
    const config = resolveConfig(
      { apiKey: 'cp_team_flag', baseUrl: 'https://proxy.test/' },
      { ...base, CODEPEN_API_KEY: 'cp_user_env', CODEPEN_API_URL: 'https://env.test' },
    );
    expect(config).toMatchObject({
      apiKey: 'cp_team_flag',
      baseUrl: 'https://proxy.test',
      source: 'flag',
    });
  });

  it('prefers the environment over the file', () => {
    writeStore(file, { api_key: 'cp_user_file' });
    const config = resolveConfig({}, { ...base, CODEPEN_API_KEY: 'cp_user_env' });
    expect(config).toMatchObject({ apiKey: 'cp_user_env', source: 'env' });
  });

  it('falls back to the config file', () => {
    writeStore(file, { api_key: 'cp_user_file' });
    expect(resolveConfig({}, base)).toMatchObject({ apiKey: 'cp_user_file', source: 'file' });
  });

  it('treats an empty env value as unset', () => {
    writeStore(file, { api_key: 'cp_user_file' });
    expect(resolveConfig({ apiKey: '' }, { ...base, CODEPEN_API_KEY: '' })).toMatchObject({
      source: 'file',
    });
  });

  it('uses CODEPEN_API_URL when no flag is given', () => {
    const config = resolveConfig(
      {},
      { ...base, CODEPEN_API_KEY: 'cp_user_env', CODEPEN_API_URL: 'https://env.test' },
    );
    expect(config.baseUrl).toBe('https://env.test');
  });

  it('throws a ConfigError naming every option when the key is missing', () => {
    expect(() => resolveConfig({}, base)).toThrow(ConfigError);
    expect(() => resolveConfig({}, base)).toThrow(/auth login/);
    expect(() => resolveConfig({}, base)).toThrow(/CODEPEN_API_KEY/);
    expect(() => resolveConfig({}, base)).toThrow(file);
  });

  it('throws a ConfigError naming the source when the key is malformed', () => {
    expect(() => resolveConfig({ apiKey: 'nope' }, base)).toThrow(/--api-key flag.*malformed/);
    writeStore(file, { api_key: 'bad' });
    expect(() => resolveConfig({}, base)).toThrow(new RegExp(`${file}.*malformed`));
  });
});

describe('describeSource', () => {
  it('describes each source', () => {
    expect(describeSource('flag', '/p')).toBe('--api-key flag');
    expect(describeSource('env', '/p')).toBe('$CODEPEN_API_KEY');
    expect(describeSource('file', '/p')).toBe('/p');
  });
});
