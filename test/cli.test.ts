import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/program.js';
import { VERSION } from '../src/version.js';
import { callOf, fakeFetch, jsonResponse, pen, TEST_KEY, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-cli-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Isolated IO: no real env, no real config file, no network. */
function io(fetch?: typeof globalThis.fetch, env: NodeJS.ProcessEnv = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      out: (s: string) => void out.push(s),
      err: (s: string) => void err.push(s),
      env: { CODEPEN_CONFIG_PATH: configFile, ...env },
      ...(fetch ? { fetch } : {}),
    },
  };
}

const base = ['--api-key', TEST_KEY, '--api-url', TEST_URL];

describe('codepen CLI', () => {
  it('prints help and exits 0', async () => {
    const { out, io: handles } = io();
    expect(await run(['--help'], handles)).toBe(0);
    expect(out.join('')).toContain('Usage: codepen');
    expect(out.join('')).toContain('pens');
  });

  it('prints the version', async () => {
    const { out, io: handles } = io();
    expect(await run(['--version'], handles)).toBe(0);
    expect(out.join('').trim()).toBe(VERSION);
  });

  it('exits 1 with usage output on an unknown command', async () => {
    const { err, io: handles } = io();
    expect(await run(['nope'], handles)).toBe(1);
    expect(err.join('')).toContain('unknown command');
  });

  it('exits 78 with guidance when no key is configured', async () => {
    const { err, io: handles } = io(fakeFetch());
    expect(await run(['pens', 'list'], handles)).toBe(78);
    expect(err.join('')).toContain('CODEPEN_API_KEY');
    expect(err.join('')).toContain('auth login');
  });

  it('reads the key from the environment when no flag is given', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }));
    const { io: handles } = io(fetch, { CODEPEN_API_KEY: TEST_KEY, CODEPEN_API_URL: TEST_URL });
    expect(await run(['pens', 'list'], handles)).toBe(0);
    expect(callOf(fetch).headers.Authorization).toBe(`Bearer ${TEST_KEY}`);
  });

  it('lists pens as a table and hints at the next page', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        body: [pen()],
        headers: { Link: `<${TEST_URL}/v2/pens?page=2>; rel="next"` },
      }),
    );
    const { out, err, io: handles } = io(fetch);
    expect(
      await run(
        [...base, 'pens', 'list', '--tag', 'css', '--tag', 'svg', '--per-page', '1'],
        handles,
      ),
    ).toBe(0);
    expect(out.join('\n')).toContain('ID      TITLE      ACCESS  UPDATED');
    expect(out.join('\n')).toContain('abc123  Hello Pen  Public  2026-10-01T00:00:00Z');
    expect(err.join('')).toContain('--page 2');
    expect(callOf(fetch).url).toBe(`${TEST_URL}/v2/pens?tags=css%2Csvg&page=1&per_page=1`);
  });

  it('lists pens as JSON with --json and no pagination hint', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        body: [pen()],
        headers: { Link: `<${TEST_URL}/v2/pens?page=2>; rel="next"` },
      }),
    );
    const { out, err, io: handles } = io(fetch);
    expect(await run([...base, '--json', 'pens', 'list'], handles)).toBe(0);
    expect(JSON.parse(out.join(''))).toEqual([pen()]);
    expect(err).toHaveLength(0);
  });

  it('gets a single pen', async () => {
    const fetch = fakeFetch(jsonResponse({ body: pen({ id: 'zzz' }) }));
    const { out, io: handles } = io(fetch);
    expect(await run([...base, 'pens', 'get', 'zzz'], handles)).toBe(0);
    expect(out.join('')).toContain('zzz');
    expect(callOf(fetch).url).toBe(`${TEST_URL}/v2/pens/zzz`);
  });

  it('maps API errors to exit codes and prints the message', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 404, body: { message: 'Pen not found', code: 'NOT_FOUND' } }),
    );
    const { err, io: handles } = io(fetch);
    expect(await run([...base, 'pens', 'get', 'missing'], handles)).toBe(66);
    expect(err.join('')).toContain('Pen not found');
  });

  it('includes the underlying cause when fetch itself fails', async () => {
    const fetch = (() =>
      Promise.reject(
        new TypeError('fetch failed', { cause: new Error('ECONNREFUSED 127.0.0.1:9') }),
      )) as unknown as typeof globalThis.fetch;
    const { err, io: handles } = io(fetch);
    expect(await run([...base, 'pens', 'list'], handles)).toBe(1);
    expect(err.join('')).toContain('fetch failed: ECONNREFUSED 127.0.0.1:9');
  });

  it('prints non-Error throwables as strings', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- testing a non-Error throwable on purpose
    const fetch = (() => Promise.reject('boom')) as unknown as typeof globalThis.fetch;
    const { err, io: handles } = io(fetch);
    expect(await run([...base, 'pens', 'list'], handles)).toBe(1);
    expect(err.join('')).toContain('boom');
  });
});
