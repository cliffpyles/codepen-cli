import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeMisses, parseEdits } from '../src/commands/files.js';
import { run } from '../src/program.js';
import { build, callOf, cliHarness, fakeFetch, jsonResponse, pen, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-edits-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const body = (fetch: ReturnType<typeof fakeFetch>, i = 0): unknown =>
  JSON.parse(callOf(fetch, i).init?.body as string);
const result = (
  overrides: Record<string, unknown> = {},
  status: 'Success' | 'Failed' = 'Success',
) => ({
  pen: pen(),
  version: { id: 'v2', ...overrides },
  build: build({ id: 'v2', status }),
});

describe('parseEdits', () => {
  it('accepts arrays and {edits}, keeping known fields', () => {
    const edit = { path: 'a', old: 'x', new: 'y', replace_all: true, junk: 1 };
    const expected = [{ path: 'a', old: 'x', new: 'y', replace_all: true }];
    expect(parseEdits(JSON.stringify([edit]), 'f')).toEqual(expected);
    expect(parseEdits(JSON.stringify({ edits: [edit] }), 'f')).toEqual(expected);
    expect(parseEdits('[{"id":"f1","old":"x","new":""}]', 'f')).toEqual([
      { id: 'f1', old: 'x', new: '' },
    ]);
  });

  it('rejects invalid JSON, shapes and incomplete edits', () => {
    expect(() => parseEdits('{', 'f')).toThrow('not valid JSON');
    expect(() => parseEdits('{}', 'f')).toThrow('"edits" array');
    expect(() => parseEdits('[1]', 'f')).toThrow('edit 0 is not an object');
    expect(() => parseEdits('[{"old":"x","new":"y"}]', 'f')).toThrow('exactly one of');
    expect(() => parseEdits('[{"id":"1","path":"a","old":"x","new":"y"}]', 'f')).toThrow(
      'exactly one of',
    );
    expect(() => parseEdits('[{"path":"a","old":"","new":"y"}]', 'f')).toThrow('non-empty');
    expect(() => parseEdits('[{"path":"a","old":"x"}]', 'f')).toThrow('non-empty');
  });
});

describe('describeMisses', () => {
  it('prints one line per miss, with whatever hints the API gave', () => {
    expect(
      describeMisses({
        misses: [
          { index: 0, path: '/a', reason: 'NotFound', nearest: 'b' },
          { index: 1, path: '/c', reason: 'Ambiguous' },
          'odd',
        ],
      }),
    ).toEqual([
      '  edit 0 (/a): NotFound {"nearest":"b"}',
      '  edit 1 (/c): Ambiguous',
      '  edit undefined (undefined): undefined',
    ]);
  });

  it('is empty without misses', () => {
    expect(describeMisses(undefined)).toEqual([]);
    expect(describeMisses({ other: 1 })).toEqual([]);
  });
});

describe('pens files edit', () => {
  it('makes one hunk from flags, with write options', async () => {
    const fetch = fakeFetch(jsonResponse({ body: result() }));
    const h = cliHarness(configFile, { fetch });
    const argv = ['pens', 'files', 'edit', 'p1', '--path', 'a.css', '--old', 'red', '--new', ''];
    expect(await run([...argv, '--replace-all', '--label', 'blue', '--wait', '0'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/files`,
      init: { method: 'PATCH' },
    });
    expect(body(fetch)).toEqual({
      edits: [{ path: 'a.css', old: 'red', new: '', replace_all: true }],
      label: 'blue',
      wait: 0,
    });
    expect(h.stdout()).toBe('Applied 1 edit(s). Version v2.');
  });

  it('reads hunks from a JSON file or stdin', async () => {
    const file = join(dir, 'edits.json');
    writeFileSync(file, '[{"path":"a","old":"x","new":"y"}]');
    const fetch = fakeFetch(jsonResponse({ body: result() }), jsonResponse({ body: result() }));
    const h = cliHarness(configFile, {
      fetch,
      readStdin: () => Promise.resolve('{"edits":[{"id":"f1","old":"x","new":"y"}]}'),
    });
    expect(await run(['pens', 'files', 'edit', 'p1', file], h.io)).toBe(0);
    expect(await run(['pens', 'files', 'edit', 'p1', '-'], h.io)).toBe(0);
    expect(body(fetch, 0)).toEqual({ edits: [{ path: 'a', old: 'x', new: 'y' }] });
    expect(body(fetch, 1)).toEqual({ edits: [{ id: 'f1', old: 'x', new: 'y' }] });
  });

  it('refuses a mix of sources, incomplete flags and an empty list', async () => {
    const file = join(dir, 'empty.json');
    writeFileSync(file, '[]');
    const fetch = fakeFetch();
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'files', 'edit', 'p1', file, '--path', 'a'], h.io)).toBe(78);
    expect(h.stderr()).toContain('not both');
    expect(await run(['pens', 'files', 'edit', 'p1', '--path', 'a', '--old', 'x'], h.io)).toBe(78);
    expect(h.stderr()).toContain('--path, --old and --new');
    expect(await run(['pens', 'files', 'edit', 'p1', file], h.io)).toBe(78);
    expect(h.stderr()).toContain('No edits');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists every miss when a hunk cannot be applied', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        status: 400,
        body: {
          message: 'edits could not be applied',
          code: 'BAD_USER_INPUT',
          field: 'edits',
          details: { misses: [{ index: 0, path: '/a', reason: 'NotFound' }] },
        },
      }),
    );
    const h = cliHarness(configFile, { fetch });
    const argv = ['pens', 'files', 'edit', 'p1', '--path', 'a', '--old', 'x', '--new', 'y'];
    expect(await run(argv, h.io)).toBe(64);
    expect(h.stderr()).toContain('  edit 0 (/a): NotFound');
    expect(h.stderr()).toContain('edits could not be applied');
  });

  it('passes other failures through untouched', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 500, body: { message: 'x', code: 'INTERNAL' } }),
    );
    const h = cliHarness(configFile, { fetch });
    const argv = ['pens', 'files', 'edit', 'p1', '--path', 'a', '--old', 'x', '--new', 'y'];
    expect(await run(argv, h.io)).toBe(1);
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await run(argv, h.io)).toBe(1);
    expect(h.stderr()).toContain('offline');
  });
});

describe('--dry-run', () => {
  const argv = ['pens', 'files', 'put', 'p1', 'a.txt', '--content', 'x', '--dry-run'];

  it('sends dry_run and says nothing was saved', async () => {
    const fetch = fakeFetch(jsonResponse({ body: result({ saved: false }) }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(argv, h.io)).toBe(0);
    expect(body(fetch)).toEqual({ content: 'x', dry_run: true });
    expect(h.stdout()).toBe('Dry run, nothing saved. Wrote /a.txt. Unsaved version v2.');
  });

  it('reports a failed build as a dry-run failure', async () => {
    const fetch = fakeFetch(jsonResponse({ body: result({ saved: false }, 'Failed') }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(argv, h.io)).toBe(78);
    expect(h.stderr()).toContain('Dry run: the build failed.');
    expect(h.stderr()).not.toContain('Files saved');
  });

  it('exits as a temporary failure when the build times out', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 504, body: { message: 'too slow', code: 'BUILD_TIMEOUT' } }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(argv, h.io)).toBe(75);
  });

  it('is offered on apply and delete but not on create', async () => {
    const fetch = fakeFetch(jsonResponse({ body: result({ saved: false }) }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'files', 'delete', 'p1', 'a.txt', '-y', '--dry-run'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/pens/p1/files/a.txt?dry_run=true`);
    const h2 = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'create', '--dry-run'], h2.io)).toBe(1);
  });
});

describe('pens list filters', () => {
  it('sends dates in RFC 3339 and the other new filters', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }));
    const h = cliHarness(configFile, { fetch });
    const argv = ['pens', 'list', '--created-since', '2026-01-02', '--untitled', 'true'];
    expect(await run([...argv, '--sort', 'title'], h.io)).toBe(0);
    const params = new URL(callOf(fetch).url).searchParams;
    expect(params.get('created_since')).toBe('2026-01-02T00:00:00.000Z');
    expect(params.get('untitled')).toBe('true');
    expect(params.get('sort')).toBe('title');
  });

  it('rejects a bad date', async () => {
    const h = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'list', '--updated-until', 'soon'], h.io)).toBe(78);
    expect(h.stderr()).toContain('--updated-until must be a date or time');
  });

  it('pages a --block list by cursor, without a page number', async () => {
    const link = `<${V2}/pens?block=sass-1&cursor=next1>; rel="next"`;
    const fetch = fakeFetch(jsonResponse({ body: [], headers: { link } }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'list', '--block', 'sass-1', '--cursor', 'c1'], h.io)).toBe(0);
    const params = new URL(callOf(fetch).url).searchParams;
    expect(params.get('block')).toBe('sass-1');
    expect(params.get('cursor')).toBe('c1');
    expect(params.has('page')).toBe(false);
    expect(h.stderr()).toContain('More results: --cursor next1');
  });

  it('refuses --cursor without --block', async () => {
    const fetch = fakeFetch();
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'list', '--cursor', 'c1'], h.io)).toBe(78);
    expect(fetch).not.toHaveBeenCalled();
  });
});
