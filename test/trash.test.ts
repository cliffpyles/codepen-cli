import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/program.js';
import { callOf, cliHarness, fakeFetch, jsonResponse, pen, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-trash-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const item = {
  id: 't1',
  type: 'Pen',
  item_id: 'p1',
  title: 'Old Pen',
  deleted_at: '2026-10-01T00:00:00Z',
  expires_at: '2026-10-04T00:00:00Z',
};

describe('trash list', () => {
  it('prints the id the restore commands take, with paging', async () => {
    const link = `<${V2}/trash?page=2>; rel="next"`;
    const fetch = fakeFetch(jsonResponse({ body: [item], headers: { link } }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['trash', 'list', '--sort', 'updated'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/trash?page=1&per_page=30&sort=updated`);
    expect(h.stdout()).toMatch(
      /^Pen\s+p1\s+Old Pen\s+2026-10-01T00:00:00Z\s+2026-10-04T00:00:00Z$/m,
    );
    expect(h.stderr()).toContain('More results: --page 2');
  });

  it('says so when empty, and prints JSON', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }), jsonResponse({ body: [item] }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['trash', 'list'], h.io)).toBe(0);
    expect(h.out[0]).toBe('The trash is empty.');
    expect(await run(['--json', 'trash', 'list'], h.io)).toBe(0);
    expect(JSON.parse(h.out[1] ?? '')).toEqual([item]);
  });
});

describe('trash purge', () => {
  it('refuses without confirmation when not interactive', async () => {
    const fetch = fakeFetch();
    const h = cliHarness(configFile, { fetch });
    expect(await run(['trash', 'purge', 'p1'], h.io)).toBe(78);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks plainly that it cannot be undone, and stops on no', async () => {
    const fetch = fakeFetch();
    const confirm = vi.fn(() => Promise.resolve(false));
    const h = cliHarness(configFile, { fetch, confirm, isInteractive: () => true });
    await run(['trash', 'purge', 'p1'], h.io);
    expect(confirm).toHaveBeenCalledWith('Permanently delete Pen p1? This cannot be undone.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('purges with --yes as text or JSON', async () => {
    const fetch = fakeFetch(jsonResponse({ body: item }), jsonResponse({ body: item }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['trash', 'purge', 'p1', '--yes'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/trash/pens/p1`,
      init: { method: 'DELETE' },
    });
    expect(h.out[0]).toBe('Permanently deleted Pen p1 (Old Pen).');
    expect(await run(['--json', 'trash', 'purge', 'p1', '--yes'], h.io)).toBe(0);
    expect(JSON.parse(h.out[1] ?? '')).toEqual(item);
  });
});

describe('restoring from the trash', () => {
  it('restores a Pen and prints it', async () => {
    const fetch = fakeFetch(jsonResponse({ body: pen({ id: 'p1' }) }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['--json', 'pens', 'restore', 'p1'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/restore`,
      init: { method: 'POST' },
    });
    expect(JSON.parse(h.stdout())).toMatchObject({ id: 'p1' });
  });

  it('restores a Collection and prints it', async () => {
    const fetch = fakeFetch(jsonResponse({ body: { id: 'c1', title: 'C', access: 'Public' } }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['collections', 'restore', 'c1'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/collections/c1/restore`,
      init: { method: 'POST' },
    });
    expect(h.stdout()).toMatch(/title\s+C/);
  });

  it('reports an expired item as not found', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 404, body: { message: 'not in the trash', code: 'NOT_FOUND' } }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'restore', 'p1'], h.io)).toBe(66);
  });
});
