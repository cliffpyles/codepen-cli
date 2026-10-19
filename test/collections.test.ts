import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/program.js';
import { callOf, cliHarness, fakeFetch, jsonResponse, pen, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-collections-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const body = (fetch: ReturnType<typeof fakeFetch>, i = 0): unknown =>
  JSON.parse(callOf(fetch, i).init?.body as string);
const col = {
  id: 'c1',
  title: 'Favorites',
  description: 'd',
  access: 'Public',
  updated_at: '2026-10-19',
};

describe('collections', () => {
  it('lists with filters and paging', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [col] }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['collections', 'list', '--access', 'Private', '--page', '3'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/collections?access=Private&page=3&per_page=30`);
    expect(h.stdout()).toMatch(/^c1\s+Favorites\s+Public\s+2026-10-19$/m);
  });

  it('sorts by created, updated or popularity and rejects other fields', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }));
    const h = cliHarness(configFile, { fetch });
    expect(
      await run(['collections', 'list', '--sort', 'Popularity', '--direction', 'asc'], h.io),
    ).toBe(0);
    expect(callOf(fetch).url).toBe(
      `${V2}/collections?page=1&per_page=30&sort=popularity&direction=asc`,
    );
    const bad = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['collections', 'list', '--sort', 'title'], bad.io)).toBe(78);
    expect(bad.stderr()).toContain('--sort must be one of: created, updated, popularity');
  });

  it('gets one as a record or JSON', async () => {
    const fetch = fakeFetch(jsonResponse({ body: col }), jsonResponse({ body: col }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['collections', 'get', 'c1'], h.io)).toBe(0);
    expect(h.out[0]).toMatch(/^title\s+Favorites$/m);
    expect(await run(['--json', 'collections', 'get', 'c1'], h.io)).toBe(0);
    expect(JSON.parse(h.out[1] ?? '')).toEqual(col);
  });

  it('creates with a required title and optional fields', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 201, body: col }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['collections', 'create'], h.io)).toBe(78);
    expect(h.stderr()).toContain('--title is required');
    expect(
      await run(['collections', 'create', '--title', 'Favorites', '--access', 'public'], h.io),
    ).toBe(0);
    expect(callOf(fetch)).toMatchObject({ url: `${V2}/collections`, init: { method: 'POST' } });
    expect(body(fetch)).toEqual({ title: 'Favorites', access: 'Public' });
  });

  it('updates only given fields and refuses empty updates', async () => {
    const fetch = fakeFetch(jsonResponse({ body: col }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['collections', 'update', 'c1'], h.io)).toBe(78);
    expect(h.stderr()).toContain('Nothing to update');
    expect(await run(['collections', 'update', 'c1', '--description', 'new'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({ url: `${V2}/collections/c1`, init: { method: 'PATCH' } });
    expect(body(fetch)).toEqual({ description: 'new' });
  });

  it('deletes with confirmation', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 204 }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['collections', 'delete', 'c1'], h.io)).toBe(78);
    expect(await run(['--json', 'collections', 'delete', 'c1', '--yes'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/collections/c1`,
      init: { method: 'DELETE' },
    });
    expect(JSON.parse(h.stdout())).toEqual({ id: 'c1', deleted: true });
  });

  it('lists pens in a collection', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [pen()] }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['collections', 'pens', 'c1', '--per-page', '2'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/collections/c1/pens?page=1&per_page=2`);
    expect(h.stdout()).toMatch(/^abc123\s+Hello Pen/m);
  });

  it('adds and removes pens', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: col }),
      jsonResponse({ status: 204 }),
      jsonResponse({ body: col }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['collections', 'add', 'c1', 'p1'], h.io)).toBe(0);
    expect(callOf(fetch, 0)).toMatchObject({
      url: `${V2}/collections/c1/pens/p1`,
      init: { method: 'PUT' },
    });
    expect(h.out[0]).toBe('Added Pen p1 to Collection c1 (Favorites).');
    expect(await run(['collections', 'remove', 'c1', 'p1'], h.io)).toBe(0);
    expect(callOf(fetch, 1)).toMatchObject({
      url: `${V2}/collections/c1/pens/p1`,
      init: { method: 'DELETE' },
    });
    expect(h.out[1]).toBe('Removed Pen p1 from Collection c1.');
    expect(await run(['--json', 'collections', 'add', 'c1', 'p1'], h.io)).toBe(0);
    expect(JSON.parse(h.out[2] ?? '')).toEqual(col);
  });
});
