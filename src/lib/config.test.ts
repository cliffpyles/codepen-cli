import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, isValidApiKey, resolveConfig } from './config.js';
import { ConfigError } from './errors.js';

describe('isValidApiKey', () => {
  it.each(['cp_user_abc', 'cp_team_ABC-123_x'])('accepts %s', (key) => {
    expect(isValidApiKey(key)).toBe(true);
  });
  it.each(['', 'abc', 'cp_user_', 'cp_other_abc', 'cp_user_with space'])('rejects %j', (key) => {
    expect(isValidApiKey(key)).toBe(false);
  });
});

describe('resolveConfig', () => {
  it('reads the key and default URL from the environment', () => {
    const config = resolveConfig({}, { CODEPEN_API_KEY: 'cp_user_env' });
    expect(config).toEqual({ apiKey: 'cp_user_env', baseUrl: DEFAULT_BASE_URL });
  });

  it('prefers explicit overrides over the environment', () => {
    const config = resolveConfig(
      { apiKey: 'cp_team_flag', baseUrl: 'https://proxy.test/' },
      { CODEPEN_API_KEY: 'cp_user_env', CODEPEN_API_URL: 'https://env.test' },
    );
    expect(config).toEqual({ apiKey: 'cp_team_flag', baseUrl: 'https://proxy.test' });
  });

  it('uses CODEPEN_API_URL when no flag is given', () => {
    const config = resolveConfig(
      {},
      { CODEPEN_API_KEY: 'cp_user_env', CODEPEN_API_URL: 'https://env.test' },
    );
    expect(config.baseUrl).toBe('https://env.test');
  });

  it('throws a ConfigError with guidance when the key is missing', () => {
    expect(() => resolveConfig({}, {})).toThrow(ConfigError);
    expect(() => resolveConfig({}, {})).toThrow(/CODEPEN_API_KEY/);
    expect(() => resolveConfig({}, {})).toThrow(/settings\/api/);
  });

  it('throws a ConfigError when the key is malformed', () => {
    expect(() => resolveConfig({ apiKey: 'nope' }, {})).toThrow(/malformed/);
  });
});
