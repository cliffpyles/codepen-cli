import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/program.js';
import { callOf, cliHarness, fakeFetch, jsonResponse, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-domains-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const domain = {
  id: 'd1',
  host: 'www.example.com',
  status: 'Pending',
  dns: [{ type: 'CNAME', name: 'www', value: 'custom.codepen.app' }],
  cname_record: 'None',
  a_record: 'None',
  created_at: '2026-10-19T00:00:00Z',
};

describe('pens domains', () => {
  it('lists as a table with the DNS records to create, or as JSON', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [domain] }), jsonResponse({ body: [] }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'domains', 'list', 'p1'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/pens/p1/domains`);
    expect(h.out[0]).toMatch(
      /^www\.example\.com\s+Pending\s+None\s+None\s+CNAME www custom\.codepen\.app$/m,
    );
    expect(await run(['pens', 'domains', 'list', 'p1'], h.io)).toBe(0);
    expect(h.out[1]).toBe('No custom domains.');
  });

  it('adds a domain and shows every domain', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 201, body: [domain] }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['--json', 'pens', 'domains', 'add', 'p1', 'www.example.com'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/domains`,
      init: { method: 'POST' },
    });
    expect(JSON.parse(callOf(fetch).init?.body as string)).toEqual({ host: 'www.example.com' });
    expect(JSON.parse(h.stdout())).toEqual([domain]);
  });

  it('removes a domain only after confirmation', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'domains', 'remove', 'p1', 'www.example.com'], h.io)).toBe(78);
    expect(fetch).not.toHaveBeenCalled();
    expect(await run(['pens', 'domains', 'remove', 'p1', 'www.example.com', '-y'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/domains/www.example.com`,
      init: { method: 'DELETE' },
    });
  });

  it('reports an API failure with its exit code', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 404, body: { message: 'no such Pen', code: 'NOT_FOUND' } }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'domains', 'list', 'nope'], h.io)).toBe(66);
    expect(h.stderr()).toContain('no such Pen');
  });
});
