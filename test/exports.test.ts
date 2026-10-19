import { describe, expect, it } from 'vitest';
import * as api from '../src/index.js';

describe('public exports', () => {
  it('exposes the client, config, errors and program entry points', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'CodePenApiError',
        'CodePenClient',
        'ConfigError',
        'DEFAULT_BASE_URL',
        'configPath',
        'createProgram',
        'deleteStore',
        'exitCodeFor',
        'isValidApiKey',
        'keyKind',
        'maskApiKey',
        'parseLinkHeader',
        'readStore',
        'resolveConfig',
        'run',
        'writeStore',
      ].sort(),
    );
  });
});
