import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError } from './errors.js';
import { configPath, deleteStore, readStore, writeStore } from './store.js';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-store-'));
  path = join(dir, 'nested', 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('configPath', () => {
  const home = '/home/me';
  it('prefers CODEPEN_CONFIG_PATH', () => {
    expect(
      configPath({ CODEPEN_CONFIG_PATH: '/x/c.json', XDG_CONFIG_HOME: '/xdg' }, 'linux', home),
    ).toBe('/x/c.json');
  });
  it('uses XDG_CONFIG_HOME when set', () => {
    expect(configPath({ XDG_CONFIG_HOME: '/xdg' }, 'darwin', home)).toBe(
      '/xdg/codepen/config.json',
    );
  });
  it('uses APPDATA on Windows', () => {
    expect(configPath({ APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'win32', home)).toBe(
      join('C:\\Users\\me\\AppData\\Roaming', 'codepen', 'config.json'),
    );
  });
  it('falls back to ~/.config', () => {
    expect(configPath({}, 'darwin', home)).toBe('/home/me/.config/codepen/config.json');
    expect(configPath({}, 'win32', home)).toBe(join(home, '.config', 'codepen', 'config.json'));
  });
});

describe('readStore', () => {
  it('returns an empty config when the file is missing', () => {
    expect(readStore(path)).toEqual({});
  });
  it('reads api_key and ignores unknown or mistyped fields', () => {
    writeStore(path, {});
    writeFileSync(
      path,
      JSON.stringify({ api_key: 'cp_user_x', other: 1, nested: { api_key: 'no' } }),
    );
    expect(readStore(path)).toEqual({ api_key: 'cp_user_x' });
    writeFileSync(path, JSON.stringify({ api_key: 42 }));
    expect(readStore(path)).toEqual({});
  });
  it('throws ConfigError on invalid JSON or a non-object', () => {
    writeStore(path, {});
    writeFileSync(path, '{not json');
    expect(() => readStore(path)).toThrow(ConfigError);
    expect(() => readStore(path)).toThrow(/not valid JSON/);
    writeFileSync(path, '[1,2]');
    expect(() => readStore(path)).toThrow(/JSON object/);
  });
  it('throws ConfigError when the path is unreadable', () => {
    // A directory exists at the path, so readFileSync fails with EISDIR.
    writeStore(join(path, 'child.json'), {});
    expect(() => readStore(path)).toThrow(/Could not read/);
  });
});

describe('writeStore', () => {
  it('creates parent directories and writes pretty JSON with 0600 permissions', () => {
    writeStore(path, { api_key: 'cp_user_abc' });
    expect(readFileSync(path, 'utf8')).toBe('{\n  "api_key": "cp_user_abc"\n}\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'nested')).mode & 0o777).toBe(0o700);
  });
  it('tightens permissions on an existing world-readable file', () => {
    writeStore(path, {});
    writeFileSync(path, '{}', { mode: 0o644 });
    writeStore(path, { api_key: 'cp_user_abc' });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
  it('wraps filesystem failures in ConfigError', () => {
    writeFileSync(join(dir, 'file'), '');
    expect(() => {
      writeStore(join(dir, 'file', 'config.json'), {});
    }).toThrow(/Could not write/);
  });
});

describe('deleteStore', () => {
  it('returns false when nothing exists and true after removing', () => {
    expect(deleteStore(path)).toBe(false);
    writeStore(path, { api_key: 'cp_user_abc' });
    expect(deleteStore(path)).toBe(true);
    expect(readStore(path)).toEqual({});
  });
  it('wraps failures in ConfigError', () => {
    writeStore(join(path, 'child.json'), {});
    expect(() => deleteStore(path)).toThrow(/Could not delete/);
  });
});
