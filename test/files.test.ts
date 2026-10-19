import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { looksBinary, parseChanges } from '../src/commands/files.js';
import { run } from '../src/program.js';
import { build, callOf, cliHarness, fakeFetch, jsonResponse, pen, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-files-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const body = (fetch: ReturnType<typeof fakeFetch>, i = 0): unknown =>
  JSON.parse(callOf(fetch, i).init?.body as string);
const writeResult = (status: 'Success' | 'Failed' | 'Running' = 'Success') => ({
  pen: pen(),
  version: { id: 'v2' },
  build: build({ id: 'v2', status }),
});
const textFile = {
  id: 'f1',
  path: '/index.html',
  is_binary: false,
  content: '<h1>Hi</h1>',
  url: 'https://cdn/x',
};
const binFile = {
  id: 'f2',
  path: '/logo.png',
  is_binary: true,
  content: null,
  url: 'https://cdn/logo.png',
};

describe('looksBinary', () => {
  it('detects NUL bytes within the first 8 KiB only', () => {
    expect(looksBinary(new Uint8Array([104, 105]))).toBe(false);
    expect(looksBinary(new Uint8Array([104, 0, 105]))).toBe(true);
    const late = new Uint8Array(9000).fill(65);
    late[8500] = 0;
    expect(looksBinary(late)).toBe(false);
  });
});

describe('parseChanges', () => {
  it('accepts arrays and {files}, normalising known fields', () => {
    expect(parseChanges('[{"path":"a","content":"x","extra":1}]', 's')).toEqual([
      { path: 'a', content: 'x' },
    ]);
    expect(parseChanges('{"files":[{"id":"i","path":"b"},{"id":"i","delete":true}]}', 's')).toEqual(
      [
        { id: 'i', path: 'b' },
        { id: 'i', delete: true },
      ],
    );
  });
  it('rejects invalid JSON, shapes, and incomplete changes', () => {
    expect(() => parseChanges('nope', 's')).toThrow(/not valid JSON/);
    expect(() => parseChanges('{"x":1}', 's')).toThrow(/array of changes/);
    expect(() => parseChanges('[1]', 's')).toThrow(/change 0 is not an object/);
    expect(() => parseChanges('[{"content":"x"}]', 's')).toThrow(/needs a "path" or "id"/);
    expect(() => parseChanges('[{"path":"a"}]', 's')).toThrow(/must set "content"/);
  });
});

describe('pens files list', () => {
  it('prints a table and JSON', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: [textFile, binFile] }),
      jsonResponse({ body: [] }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'files', 'list', 'p1'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/pens/p1/files`);
    expect(h.stdout()).toMatch(/^PATH\s+ID\s+BINARY\s+HASH$/m);
    expect(h.stdout()).toMatch(/^\/logo\.png\s+f2\s+yes$/m);
    expect(await run(['--json', 'pens', 'files', 'list', 'p1'], h.io)).toBe(0);
    expect(h.out[1]).toBe('[]');
  });
});

describe('pens files get', () => {
  it('prints text content, or saves it with --output', async () => {
    const fetch = fakeFetch(jsonResponse({ body: textFile }), jsonResponse({ body: textFile }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'files', 'get', 'p1', 'index.html'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/pens/p1/files/index.html`);
    expect(h.stdout()).toBe('<h1>Hi</h1>');

    const out = join(dir, 'saved.html');
    expect(await run(['pens', 'files', 'get', 'p1', 'index.html', '-o', out], h.io)).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('<h1>Hi</h1>');
    expect(h.stderr()).toContain(`Saved /index.html to ${out}`);
  });

  it('emits the file object with --json', async () => {
    const fetch = fakeFetch(jsonResponse({ body: textFile }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['--json', 'pens', 'files', 'get', 'p1', 'index.html'], h.io)).toBe(0);
    expect(JSON.parse(h.stdout())).toEqual(textFile);
  });

  it('downloads binary files from their URL into --output and refuses to print them', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const fetch = fakeFetch(
      jsonResponse({ body: binFile }),
      new Response(bytes, { status: 200 }),
      jsonResponse({ body: binFile }),
    );
    const h = cliHarness(configFile, { fetch });
    const out = join(dir, 'logo.png');
    expect(await run(['pens', 'files', 'get', 'p1', 'logo.png', '--output', out], h.io)).toBe(0);
    expect(callOf(fetch, 1).url).toBe('https://cdn/logo.png');
    expect(new Uint8Array(readFileSync(out))).toEqual(bytes);
    expect(h.stderr()).toContain('Saved 4 bytes');

    expect(await run(['pens', 'files', 'get', 'p1', 'logo.png'], h.io)).toBe(78);
    expect(h.stderr()).toContain('pass --output');
  });

  it('reports failed downloads and missing URLs', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: binFile }),
      new Response(null, { status: 404 }),
      jsonResponse({ body: { ...binFile, url: null } }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'files', 'get', 'p1', 'logo.png', '-o', join(dir, 'x')], h.io)).toBe(
      78,
    );
    expect(h.stderr()).toContain('HTTP 404');
    expect(await run(['pens', 'files', 'get', 'p1', 'logo.png', '-o', join(dir, 'x')], h.io)).toBe(
      78,
    );
    expect(h.stderr()).toContain('no download URL');
  });

  it('wraps local write failures', async () => {
    const fetch = fakeFetch(jsonResponse({ body: textFile }));
    const h = cliHarness(configFile, { fetch });
    expect(
      await run(
        ['pens', 'files', 'get', 'p1', 'index.html', '-o', join(dir, 'missing', 'x')],
        h.io,
      ),
    ).toBe(78);
    expect(h.stderr()).toContain('Could not write');
  });
});

describe('pens files put', () => {
  it('uploads a local text file as JSON, defaulting the local path to the pen path', async () => {
    writeFileSync(join(dir, 'index.html'), '<p>x</p>');
    const fetch = fakeFetch(jsonResponse({ body: writeResult() }));
    const h = cliHarness(configFile, { fetch });
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      expect(
        await run(['pens', 'files', 'put', 'p1', '/index.html', '--expected-version', 'v1'], h.io),
      ).toBe(0);
    } finally {
      process.chdir(cwd);
    }
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/files/index.html`,
      init: { method: 'PUT' },
    });
    expect(body(fetch)).toEqual({ content: '<p>x</p>', expected_version_id: 'v1' });
    expect(h.stdout()).toBe('Wrote /index.html. Version v2.');
    expect(h.stderr()).toContain('Build v2: Success');
  });

  it('uploads --from, --content and --stdin sources', async () => {
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    const fetch = fakeFetch(
      jsonResponse({ body: writeResult() }),
      jsonResponse({ body: writeResult() }),
      jsonResponse({ body: writeResult() }),
    );
    const h = cliHarness(configFile, { fetch, readStdin: () => Promise.resolve('from stdin') });
    expect(
      await run(['pens', 'files', 'put', 'p1', 'src/app.js', '--from', join(dir, 'app.js')], h.io),
    ).toBe(0);
    expect(
      await run(['pens', 'files', 'put', 'p1', 'a.css', '--content', 'b{}', '--wait', '0'], h.io),
    ).toBe(0);
    expect(await run(['pens', 'files', 'put', 'p1', 'n.md', '--stdin'], h.io)).toBe(0);
    expect(body(fetch, 0)).toEqual({ content: 'console.log(1)' });
    expect(body(fetch, 1)).toEqual({ content: 'b{}', wait: 0 });
    expect(body(fetch, 2)).toEqual({ content: 'from stdin' });
  });

  it('sends binary files as multipart, by detection or --binary', async () => {
    writeFileSync(join(dir, 'img.png'), Buffer.from([137, 0, 78]));
    writeFileSync(join(dir, 'plain.txt'), 'text');
    const fetch = fakeFetch(
      jsonResponse({ body: writeResult() }),
      jsonResponse({ body: writeResult() }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(
      await run(['pens', 'files', 'put', 'p1', 'img.png', '--from', join(dir, 'img.png')], h.io),
    ).toBe(0);
    expect(
      await run(
        ['pens', 'files', 'put', 'p1', 'plain.txt', '--from', join(dir, 'plain.txt'), '--binary'],
        h.io,
      ),
    ).toBe(0);
    expect(callOf(fetch, 0).init?.body).toBeInstanceOf(FormData);
    expect(callOf(fetch, 1).init?.body).toBeInstanceOf(FormData);
  });

  it('rejects conflicting sources and a missing local file', async () => {
    const h = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'files', 'put', 'p1', 'a', '--content', 'x', '--stdin'], h.io)).toBe(
      78,
    );
    expect(h.stderr()).toContain('only one of');
    const h2 = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'files', 'put', 'p1', 'a', '--from', join(dir, 'nope')], h2.io)).toBe(
      78,
    );
    expect(h2.stderr()).toContain('Could not read');
  });

  it('polls an unfinished build, prints JSON, and fails on a failed build', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: writeResult('Running') }),
      jsonResponse({ body: build({ id: 'v2', status: 'Failed' }) }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(
      await run(['--json', 'pens', 'files', 'put', 'p1', 'a.css', '--content', 'x'], h.io),
    ).toBe(78);
    expect(callOf(fetch, 1).url).toBe(`${V2}/builds/v2`);
    expect(JSON.parse(h.stdout())).toMatchObject({
      version: { id: 'v2' },
      build: { status: 'Failed' },
    });
    expect(h.stderr()).toContain('build failed');
  });
});

describe('pens files apply', () => {
  it('reads changes from a file or stdin and applies them in one request', async () => {
    const changes = join(dir, 'changes.json');
    writeFileSync(
      changes,
      JSON.stringify([
        { path: 'a', content: 'x' },
        { path: 'b', delete: true },
      ]),
    );
    const fetch = fakeFetch(
      jsonResponse({ body: writeResult() }),
      jsonResponse({ body: writeResult() }),
    );
    const h = cliHarness(configFile, {
      fetch,
      readStdin: () => Promise.resolve('[{"id":"i","path":"moved"}]'),
    });
    expect(
      await run(['pens', 'files', 'apply', 'p1', changes, '--expected-version', 'v1'], h.io),
    ).toBe(0);
    expect(await run(['pens', 'files', 'apply', 'p1', '-'], h.io)).toBe(0);
    expect(callOf(fetch, 0)).toMatchObject({ url: `${V2}/pens/p1/files`, init: { method: 'PUT' } });
    expect(body(fetch, 0)).toEqual({
      files: [
        { path: 'a', content: 'x' },
        { path: 'b', delete: true },
      ],
      expected_version_id: 'v1',
    });
    expect(body(fetch, 1)).toEqual({ files: [{ id: 'i', path: 'moved' }] });
    expect(h.out[0]).toBe('Applied 2 change(s). Version v2.');
  });

  it('rejects an empty change list', async () => {
    const h = cliHarness(configFile, {
      fetch: fakeFetch(),
      readStdin: () => Promise.resolve('[]'),
    });
    expect(await run(['pens', 'files', 'apply', 'p1', '-'], h.io)).toBe(78);
    expect(h.stderr()).toContain('No changes');
  });
});

describe('pens files delete', () => {
  it('requires confirmation and sends options as query params', async () => {
    const fetch = fakeFetch(jsonResponse({ body: writeResult() }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'files', 'delete', 'p1', 'old.js'], h.io)).toBe(78);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await run(['pens', 'files', 'delete', 'p1', 'old.js', '--yes', '--wait', '0'], h.io),
    ).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/files/old.js?wait=0`,
      init: { method: 'DELETE' },
    });
    expect(h.out[0]).toBe('Deleted /old.js. Version v2.');
  });
});
