import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgramIO } from '../src/program.js';
import { run } from '../src/program.js';
import { readStore, writeStore } from '../src/lib/store.js';
import { callOf, fakeFetch, jsonResponse, pen, TEST_KEY, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-auth-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Harness {
  out: string[];
  err: string[];
  io: ProgramIO;
}

function harness(overrides: Partial<ProgramIO> = {}, env: NodeJS.ProcessEnv = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      out: (s) => void out.push(s),
      err: (s) => void err.push(s),
      env: { CODEPEN_CONFIG_PATH: configFile, CODEPEN_API_URL: TEST_URL, ...env },
      isInteractive: () => true,
      promptSecret: () => Promise.reject(new Error('promptSecret not expected')),
      readStdin: () => Promise.reject(new Error('readStdin not expected')),
      ...overrides,
    },
  };
}

describe('auth login', () => {
  it('prompts without echo when interactive and stores the key with 0600', async () => {
    const promptSecret = vi.fn(() => Promise.resolve(`  ${TEST_KEY}\n`));
    const h = harness({ promptSecret });
    expect(await run(['auth', 'login'], h.io)).toBe(0);

    expect(promptSecret).toHaveBeenCalledWith('API key: ');
    expect(h.err.join('')).toContain('settings/api');
    expect(h.out.join('')).toContain(`Saved personal key cp_user_te…_123 to ${configFile}`);
    expect(h.out.join('')).not.toContain(TEST_KEY);
    expect(readStore(configFile)).toEqual({ api_key: TEST_KEY });
    expect(statSync(configFile).mode & 0o777).toBe(0o600);
  });

  it('reads from stdin with --with-token', async () => {
    const readStdin = vi.fn(() => Promise.resolve(`cp_team_abcdefgh\n`));
    const h = harness({ readStdin });
    expect(await run(['auth', 'login', '--with-token'], h.io)).toBe(0);
    expect(h.out.join('')).toContain('Saved team key cp_team_ab…efgh');
    expect(readStore(configFile).api_key).toBe('cp_team_abcdefgh');
  });

  it('reads from stdin automatically when not interactive', async () => {
    const readStdin = vi.fn(() => Promise.resolve(TEST_KEY));
    const h = harness({ readStdin, isInteractive: () => false });
    expect(await run(['auth', 'login'], h.io)).toBe(0);
    expect(readStdin).toHaveBeenCalledOnce();
  });

  it('preserves other stored fields and warns when the env var will shadow the file', async () => {
    writeStore(configFile, { api_key: 'cp_user_old' });
    const h = harness(
      { readStdin: () => Promise.resolve(TEST_KEY) },
      { CODEPEN_API_KEY: 'cp_user_env' },
    );
    expect(await run(['auth', 'login', '--with-token'], h.io)).toBe(0);
    expect(readStore(configFile).api_key).toBe(TEST_KEY);
    expect(h.err.join('')).toContain('CODEPEN_API_KEY is set and takes precedence');
  });

  it('rejects an empty or malformed key with exit 78 and writes nothing', async () => {
    const empty = harness({ readStdin: () => Promise.resolve('   \n') });
    expect(await run(['auth', 'login', '--with-token'], empty.io)).toBe(78);
    expect(empty.err.join('')).toContain('No API key entered');

    const bad = harness({ readStdin: () => Promise.resolve('hunter2') });
    expect(await run(['auth', 'login', '--with-token'], bad.io)).toBe(78);
    expect(bad.err.join('')).toContain('cp_user_ or cp_team_');
    expect(() => readFileSync(configFile)).toThrow();
  });
});

describe('auth status', () => {
  it('reports the stored key and verifies it with one request', async () => {
    writeStore(configFile, { api_key: TEST_KEY });
    const fetch = fakeFetch(jsonResponse({ body: [pen()] }));
    const h = harness({ fetch });
    expect(await run(['auth', 'status'], h.io)).toBe(0);

    const text = h.out.join('\n');
    expect(text).toContain('Key:      cp_user_te…_123 (personal)');
    expect(text).toContain(`Source:   ${configFile}`);
    expect(text).toContain(`API URL:  ${TEST_URL}`);
    expect(text).toContain('Verified: yes');
    expect(text).not.toContain(TEST_KEY);
    expect(callOf(fetch).url).toBe(`${TEST_URL}/v2/pens?per_page=1`);
  });

  it('names the env var as the source and skips the request with --no-verify', async () => {
    const fetch = fakeFetch();
    const h = harness({ fetch }, { CODEPEN_API_KEY: TEST_KEY });
    expect(await run(['auth', 'status', '--no-verify'], h.io)).toBe(0);
    expect(h.out.join('\n')).toContain('Source:   $CODEPEN_API_KEY');
    expect(h.out.join('\n')).toContain('Verified: skipped');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('emits JSON with --json', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }));
    const h = harness({ fetch });
    expect(await run(['--json', '--api-key', TEST_KEY, 'auth', 'status'], h.io)).toBe(0);
    expect(JSON.parse(h.out.join(''))).toEqual({
      key: 'cp_user_te…_123',
      kind: 'personal',
      source: 'flag',
      config_path: configFile,
      api_url: TEST_URL,
      authenticated: true,
    });
  });

  it('fails with exit 78 and the API error when the key is rejected', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 401, body: { message: 'Invalid key', code: 'UNAUTHENTICATED' } }),
    );
    const h = harness({ fetch }, { CODEPEN_API_KEY: TEST_KEY });
    expect(await run(['auth', 'status'], h.io)).toBe(78);
    expect(h.out.join('\n')).toContain('Verified: no (Invalid key)');
    expect(h.err.join('')).toContain('rejected');
  });

  it('includes the error code in JSON when verification fails', async () => {
    const fetch = fakeFetch(new Response(null, { status: 500, statusText: 'Server Error' }));
    const h = harness({ fetch }, { CODEPEN_API_KEY: TEST_KEY });
    expect(await run(['--json', 'auth', 'status'], h.io)).toBe(78);
    expect(JSON.parse(h.out.join(''))).toMatchObject({
      authenticated: false,
      error_code: 'UNKNOWN',
      error: 'HTTP 500 Server Error',
    });
  });

  it('explains how to log in when no key is configured', async () => {
    const h = harness();
    expect(await run(['auth', 'status'], h.io)).toBe(78);
    expect(h.err.join('')).toContain('Not logged in');
    expect(h.err.join('')).toContain('auth login');

    const json = harness();
    expect(await run(['--json', 'auth', 'status'], json.io)).toBe(78);
    expect(JSON.parse(json.out.join(''))).toMatchObject({
      authenticated: false,
      config_path: configFile,
    });
  });
});

describe('auth logout', () => {
  it('removes the config file', async () => {
    writeStore(configFile, { api_key: TEST_KEY });
    const h = harness();
    expect(await run(['auth', 'logout'], h.io)).toBe(0);
    expect(h.out.join('')).toContain(`Removed ${configFile}`);
    expect(readStore(configFile)).toEqual({});
  });

  it('is a no-op when nothing is stored and warns about a lingering env var', async () => {
    const h = harness({}, { CODEPEN_API_KEY: TEST_KEY });
    expect(await run(['auth', 'logout'], h.io)).toBe(0);
    expect(h.out.join('')).toContain('Nothing to remove');
    expect(h.err.join('')).toContain('still set');
  });
});
