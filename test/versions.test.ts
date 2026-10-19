import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/program.js';
import { build, callOf, cliHarness, fakeFetch, jsonResponse, pen, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-versions-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const body = (fetch: ReturnType<typeof fakeFetch>, i = 0): unknown =>
  JSON.parse(callOf(fetch, i).init?.body as string);

describe('pens versions', () => {
  it('lists versions with paging', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        body: [
          {
            id: 'v2',
            created_at: '2026-10-02',
            build: build({ status: 'Success' }),
            deployed: true,
          },
          { id: 'v1', created_at: '2026-10-01', build: build({ status: 'Failed' }) },
        ],
        headers: { Link: `<${V2}/pens/p1/versions?page=2>; rel="next"` },
      }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'versions', 'list', 'p1', '--per-page', '2'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/pens/p1/versions?page=1&per_page=2`);
    expect(h.stdout()).toMatch(/^v2\s+2026-10-02\s+Success\s+yes$/m);
    expect(h.stdout()).toMatch(/^v1\s+2026-10-01\s+Failed$/m);
    expect(h.stderr()).toContain('--page 2');
  });

  it('shows one version as a record with file paths, or JSON', async () => {
    const version = {
      id: 'v1',
      pen_id: 'p1',
      deployed: false,
      build: build(),
      preview_url: 'https://prev',
      files: [
        { id: 'f', path: '/index.html' },
        { id: 'g', path: '/a.css' },
      ],
    };
    const fetch = fakeFetch(jsonResponse({ body: version }), jsonResponse({ body: version }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'versions', 'get', 'v1'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/versions/v1`);
    expect(h.stdout()).toMatch(/^build_status\s+Success$/m);
    expect(h.stdout()).toMatch(/^files\s+\/index\.html, \/a\.css$/m);
    expect(await run(['--json', 'pens', 'versions', 'get', 'v1'], h.io)).toBe(0);
    expect(JSON.parse(h.out[1] ?? '')).toEqual(version);
  });

  it('restores after confirmation and prints the pen', async () => {
    const fetch = fakeFetch(jsonResponse({ body: pen() }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'versions', 'restore', 'p1', 'v0'], h.io)).toBe(78);
    expect(fetch).not.toHaveBeenCalled();
    expect(await run(['pens', 'versions', 'restore', 'p1', 'v0', '-y'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/versions/v0/restore`,
      init: { method: 'POST' },
    });
    expect(h.stdout()).toMatch(/^id\s+abc123$/m);
  });
});

describe('pens builds get', () => {
  it('summarises a build and lists compiled files', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        body: build({ id: 'v1', status: 'Success', files: [{ id: 'c', path: '/index.html' }] }),
      }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'builds', 'get', 'v1'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/builds/v1`);
    expect(h.stdout()).toContain('Build v1: Success');
    expect(h.stdout()).toContain('/index.html');
  });

  it('polls with --follow, explains canceled builds, and fails on Failed', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: build({ id: 'v1', status: 'Running' }) }),
      jsonResponse({ body: build({ id: 'v1', status: 'Canceled', next_id: 'v2' }) }),
      jsonResponse({
        body: build({
          id: 'v2',
          status: 'Failed',
          errors: [{ type: 'Error', scope: 'Build', message: 'boom' }],
        }),
      }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'builds', 'get', 'v1', '--follow'], h.io)).toBe(78);
    expect(callOf(fetch, 2).url).toBe(`${V2}/builds/v2`);
    expect(h.stdout()).toContain('Build v2: Failed');
    expect(h.stdout()).toContain('Error: boom');
    expect(h.stderr()).toContain('Build failed');
  });

  it('describes canceled builds with patches and running builds without following', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        body: build({
          id: 'v1',
          status: 'Canceled',
          next_id: null,
          patches: [{ type: 'create', path: '/x.js' }],
        }),
      }),
      jsonResponse({ body: build({ id: 'v1', status: 'Canceled', next_id: 'v9' }) }),
      jsonResponse({ body: build({ id: 'v1', status: 'Running' }) }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'builds', 'get', 'v1'], h.io)).toBe(0);
    expect(h.out[0]).toContain('1 patch(es) must be applied');
    expect(h.out[0]).toContain('create /x.js');
    expect(await run(['pens', 'builds', 'get', 'v1'], h.io)).toBe(0);
    expect(h.out[1]).toContain('see build v9');
    expect(await run(['--json', 'pens', 'builds', 'get', 'v1'], h.io)).toBe(0);
    expect(JSON.parse(h.out[2] ?? '')).toMatchObject({ status: 'Running' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe('pens deploy / undeploy', () => {
  it('deploys the head or a version and prints the deployment', async () => {
    const deployment = {
      id: 'd1',
      version_id: 'v1',
      url: 'https://live',
      custom_domains: ['a.test'],
    };
    const fetch = fakeFetch(jsonResponse({ body: deployment }), jsonResponse({ body: deployment }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'deploy', 'p1'], h.io)).toBe(0);
    expect(await run(['--json', 'pens', 'deploy', 'p1', '--version-id', 'v1'], h.io)).toBe(0);
    expect(callOf(fetch, 0)).toMatchObject({
      url: `${V2}/pens/p1/deployment`,
      init: { method: 'PUT' },
    });
    expect(body(fetch, 0)).toEqual({});
    expect(body(fetch, 1)).toEqual({ version_id: 'v1' });
    expect(h.out[0]).toMatch(/^url\s+https:\/\/live$/m);
    expect(h.out[0]).toMatch(/^custom_domains\s+a\.test$/m);
    expect(JSON.parse(h.out[1] ?? '')).toEqual(deployment);
  });

  it('undeploys with confirmation', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 204 }), jsonResponse({ status: 204 }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'undeploy', 'p1'], h.io)).toBe(78);
    expect(await run(['pens', 'undeploy', 'p1', '--yes'], h.io)).toBe(0);
    expect(callOf(fetch, 0)).toMatchObject({
      url: `${V2}/pens/p1/deployment`,
      init: { method: 'DELETE' },
    });
    expect(h.stdout()).toContain('Deployment of Pen p1 removed');
    expect(await run(['--json', 'pens', 'undeploy', 'p1', '--yes'], h.io)).toBe(0);
    expect(JSON.parse(h.out[1] ?? '')).toEqual({ id: 'p1', deployed: false });
  });
});
