import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/program.js';
import { build, callOf, cliHarness, fakeFetch, jsonResponse, pen, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-pens-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const body = (fetch: ReturnType<typeof fakeFetch>, i = 0): unknown =>
  JSON.parse(callOf(fetch, i).init?.body as string);

describe('pens list', () => {
  it('passes every filter and paging option through', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }));
    const h = cliHarness(configFile, { fetch });
    const code = await run(
      [
        'pens',
        'list',
        '--access',
        'private,public',
        '--tag',
        'a,b',
        '--tag',
        'c',
        '--search',
        'x',
        '--deployed',
        'true',
        '--template',
        'no',
        '--forks',
        'forked',
        '--editor',
        'v2',
        '--sort',
        'Updated',
        '--direction',
        'ASC',
        '--page',
        '2',
        '--per-page',
        '5',
      ],
      h.io,
    );
    expect(code).toBe(0);
    const url = new URL(callOf(fetch).url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      access: 'private,public',
      tags: 'a,b,c',
      search_term: 'x',
      deployed: 'true',
      template: 'false',
      forks: 'Forked',
      editor: 'V2',
      sort: 'updated',
      direction: 'asc',
      page: '2',
      per_page: '5',
    });
    expect(h.stdout()).toBe('No Pens found.');
  });

  it('rejects bad enum, boolean and integer values with exit 78', async () => {
    for (const args of [
      ['--forks', 'maybe'],
      ['--deployed', 'perhaps'],
      ['--page', '0'],
      ['--per-page', '1.5'],
      ['--sort', 'title'],
    ]) {
      const h = cliHarness(configFile, { fetch: fakeFetch() });
      expect(await run(['pens', 'list', ...args], h.io)).toBe(78);
      expect(h.stderr()).toMatch(/must be|Expected a positive integer/);
    }
  });
});

describe('pens get', () => {
  it('prints a key/value record with flattened urls', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        body: pen({
          tags: ['x', 'y'],
          urls: { editor: 'https://e', preview: 'https://p' },
          saved_version: { id: 'v9' },
          deployment: { id: 'd', version_id: 'v9', url: 'https://d' },
        }),
      }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'get', 'abc123'], h.io)).toBe(0);
    const text = h.stdout();
    expect(text).toContain('id                abc123');
    expect(text).toContain('tags              x, y');
    expect(text).toContain('editor_url        https://e');
    expect(text).toContain('saved_version_id  v9');
    expect(text).toContain('deployment_url    https://d');
    expect(text).not.toContain('urls ');
  });
});

describe('pens create', () => {
  it('reads local files, sends them with metadata, follows the build and prints the pen', async () => {
    writeFileSync(join(dir, 'index.html'), '<h1>Hi</h1>');
    writeFileSync(join(dir, 'main.css'), 'h1{}');
    const fetch = fakeFetch(
      jsonResponse({ status: 201, body: { ...pen(), build: build({ status: 'Running' }) } }),
      jsonResponse({ body: build({ status: 'Success' }) }),
    );
    const h = cliHarness(configFile, { fetch });
    const code = await run(
      [
        'pens',
        'create',
        '--title',
        'T',
        '--description',
        'D',
        '--tag',
        'a',
        '--access',
        'private',
        '--password',
        'secret123',
        '--template',
        'true',
        '--wait',
        '0',
        '--file',
        join(dir, 'index.html'),
        '--file',
        `${join(dir, 'main.css')}=css/style.css`,
      ],
      h.io,
    );
    expect(code).toBe(0);
    expect(callOf(fetch, 0)).toMatchObject({ url: `${V2}/pens`, init: { method: 'POST' } });
    expect(body(fetch, 0)).toEqual({
      title: 'T',
      description: 'D',
      tags: ['a'],
      access: 'Private',
      password: 'secret123',
      template: true,
      wait: 0,
      files: [
        { path: 'index.html', content: '<h1>Hi</h1>' },
        { path: 'css/style.css', content: 'h1{}' },
      ],
    });
    expect(callOf(fetch, 1).url).toBe(`${V2}/builds/v1`);
    expect(h.stdout()).toMatch(/^title\s+Hello Pen$/m);
    expect(h.stderr()).toContain('Build v1: Success');
  });

  it('does not poll with --no-follow and emits build in JSON', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 201, body: { ...pen(), build: build({ status: 'Queued' }) } }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['--json', 'pens', 'create', '--title', 'T', '--no-follow'], h.io)).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(h.stdout())).toMatchObject({ id: 'abc123', build: { status: 'Queued' } });
    expect(h.stderr()).toBe('');
  });

  it('exits non-zero and lists errors when the build fails', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        status: 201,
        body: {
          ...pen(),
          build: build({
            status: 'Failed',
            errors: [
              { type: 'Error', scope: 'File', path: '/a.scss', message: 'Undefined variable' },
            ],
          }),
        },
      }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'create', '--title', 'T'], h.io)).toBe(78);
    expect(h.stderr()).toContain('Build v1: Failed');
    expect(h.stderr()).toContain('Error /a.scss: Undefined variable');
    expect(h.stderr()).toContain('build failed');
    expect(h.stdout()).toContain('abc123');
  });

  it('rejects an unreadable --file, a malformed spec, and an out-of-range --wait', async () => {
    const h1 = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'create', '--file', join(dir, 'nope.html')], h1.io)).toBe(78);
    expect(h1.stderr()).toContain('Could not read');

    const h2 = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'create', '--file', '=remote.html'], h2.io)).toBe(78);
    expect(h2.stderr()).toContain('Invalid --file');

    const h3 = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'create', '--wait', '90'], h3.io)).toBe(78);
    expect(h3.stderr()).toContain('--wait must be');
  });
});

describe('pens update', () => {
  it('sends only the provided fields', async () => {
    const fetch = fakeFetch(jsonResponse({ body: pen({ title: 'New' }) }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'update', 'abc123', '--title', 'New', '--tag', 'x, y'], h.io)).toBe(
      0,
    );
    expect(callOf(fetch)).toMatchObject({ url: `${V2}/pens/abc123`, init: { method: 'PATCH' } });
    expect(body(fetch)).toEqual({ title: 'New', tags: ['x', 'y'] });
    expect(h.stdout()).toMatch(/^title\s+New$/m);
  });

  it('refuses an empty update', async () => {
    const h = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'update', 'abc123'], h.io)).toBe(78);
    expect(h.stderr()).toContain('Nothing to update');
  });
});

describe('pens delete', () => {
  it('refuses without --yes when not interactive', async () => {
    const fetch = fakeFetch();
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'delete', 'abc123'], h.io)).toBe(78);
    expect(h.stderr()).toContain('--yes');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prompts when interactive and aborts on no', async () => {
    const fetch = fakeFetch();
    const confirm = vi.fn(() => Promise.resolve(false));
    const h = cliHarness(configFile, { fetch, confirm, isInteractive: () => true });
    expect(await run(['pens', 'delete', 'abc123'], h.io)).toBe(78);
    expect(confirm).toHaveBeenCalledWith('Move Pen abc123 to the trash?');
    expect(h.stderr()).toContain('Aborted');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deletes after a yes answer, or with --yes', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 204 }), jsonResponse({ status: 204 }));
    const h = cliHarness(configFile, {
      fetch,
      confirm: () => Promise.resolve(true),
      isInteractive: () => true,
    });
    expect(await run(['pens', 'delete', 'abc123'], h.io)).toBe(0);
    expect(h.stdout()).toContain('Moved Pen abc123 to the trash');
    expect(await run(['--json', 'pens', 'delete', 'abc123', '--yes'], h.io)).toBe(0);
    expect(callOf(fetch, 1)).toMatchObject({
      url: `${V2}/pens/abc123`,
      init: { method: 'DELETE' },
    });
    expect(JSON.parse(h.out[1] ?? '')).toEqual({ id: 'abc123', deleted: true });
  });
});

describe('pens fork', () => {
  it('forks with overrides and reports the build', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        status: 201,
        body: { ...pen({ id: 'copy' }), build: build({ status: 'Success' }) },
      }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'fork', 'abc123', '--title', 'Copy', '--wait', '5'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/pens/abc123/fork`);
    expect(body(fetch)).toEqual({ title: 'Copy', wait: 5 });
    expect(h.stdout()).toMatch(/^id\s+copy$/m);
    expect(h.stderr()).toContain('Build v1: Success');
  });

  it('fails when the forked build fails', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        status: 201,
        body: { ...pen({ id: 'copy' }), build: build({ status: 'Failed' }) },
      }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'fork', 'abc123'], h.io)).toBe(78);
    expect(h.stderr()).toContain('forked, but the build failed');
  });
});

describe('pens settings', () => {
  it('sends the mapped settings and prints the result', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: { auto_deploy: true, indent_with: 'tabs', tab_size: 4 } }),
    );
    const h = cliHarness(configFile, { fetch });
    const code = await run(
      [
        'pens',
        'settings',
        'abc123',
        '--auto-deploy',
        'true',
        '--auto-run',
        'false',
        '--auto-save',
        'yes',
        '--indent-with',
        'TABS',
        '--tab-size',
        '4',
      ],
      h.io,
    );
    expect(code).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/abc123/settings`,
      init: { method: 'PATCH' },
    });
    expect(body(fetch)).toEqual({
      auto_deploy: true,
      auto_run: false,
      auto_save: true,
      indent_with: 'tabs',
      tab_size: 4,
    });
    expect(h.stdout()).toMatch(/^tab_size\s+4$/m);
  });

  it('rejects no flags and a bad tab size', async () => {
    const h = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'settings', 'abc123'], h.io)).toBe(78);
    expect(h.stderr()).toContain('Nothing to update');
    const h2 = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'settings', 'abc123', '--tab-size', '9'], h2.io)).toBe(78);
    expect(h2.stderr()).toContain('--tab-size must be');
  });
});
