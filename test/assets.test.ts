import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toPayload, validateFilename } from '../src/commands/assets.js';
import { run } from '../src/program.js';
import { callOf, cliHarness, fakeFetch, jsonResponse, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-assets-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const body = (fetch: ReturnType<typeof fakeFetch>, i = 0): unknown =>
  JSON.parse(callOf(fetch, i).init?.body as string);
const textAsset = {
  id: 'a1',
  filename: 'notes.txt',
  is_binary: false,
  url: 'https://cdn/notes.txt',
  content: 'hello',
};
const binAsset = {
  id: 'a2',
  filename: 'logo.png',
  is_binary: true,
  url: 'https://cdn/logo.png',
  content: null,
};

describe('helpers', () => {
  it('validates filenames', () => {
    expect(validateFilename('a.png')).toBe('a.png');
    expect(() => validateFilename('')).toThrow(/Invalid asset filename/);
    expect(() => validateFilename('dir/a.png')).toThrow(/Invalid asset filename/);
    expect(() => validateFilename('dir\\a.png')).toThrow(/Invalid asset filename/);
  });
  it('chooses text or bytes', () => {
    expect(toPayload(new Uint8Array([104, 105]), false)).toBe('hi');
    expect(toPayload(new Uint8Array([104, 0]), false)).toBeInstanceOf(Uint8Array);
    expect(toPayload(new Uint8Array([104, 105]), true)).toBeInstanceOf(Uint8Array);
  });
});

describe('assets', () => {
  it('lists', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [textAsset, binAsset] }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['assets', 'list', '--per-page', '50'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/assets?page=1&per_page=50`);
    expect(h.stdout()).toMatch(/^a2\s+logo\.png\s+yes\s+https:\/\/cdn\/logo\.png$/m);
  });

  it('gets as a record or JSON', async () => {
    const fetch = fakeFetch(jsonResponse({ body: textAsset }), jsonResponse({ body: textAsset }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['assets', 'get', 'a1'], h.io)).toBe(0);
    expect(h.out[0]).toMatch(/^filename\s+notes\.txt$/m);
    expect(h.out[0]).not.toContain('hello');
    expect(await run(['--json', 'assets', 'get', 'a1'], h.io)).toBe(0);
    expect(JSON.parse(h.out[1] ?? '')).toEqual(textAsset);
  });

  it('saves text content directly and downloads binaries with --output', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetch = fakeFetch(
      jsonResponse({ body: textAsset }),
      jsonResponse({ body: binAsset }),
      new Response(bytes, { status: 200 }),
    );
    const h = cliHarness(configFile, { fetch });
    const t = join(dir, 'n.txt');
    const b = join(dir, 'l.png');
    expect(await run(['assets', 'get', 'a1', '-o', t], h.io)).toBe(0);
    expect(readFileSync(t, 'utf8')).toBe('hello');
    expect(await run(['assets', 'get', 'a2', '--output', b], h.io)).toBe(0);
    expect(callOf(fetch, 2).url).toBe('https://cdn/logo.png');
    expect(new Uint8Array(readFileSync(b))).toEqual(bytes);
    expect(h.stderr()).toContain('Saved logo.png (3 bytes)');
  });

  it('reports download and write failures', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: { ...binAsset, url: null } }),
      jsonResponse({ body: binAsset }),
      new Response(null, { status: 500 }),
      jsonResponse({ body: textAsset }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['assets', 'get', 'a2', '-o', join(dir, 'x')], h.io)).toBe(78);
    expect(h.err[0]).toContain('no download URL');
    expect(await run(['assets', 'get', 'a2', '-o', join(dir, 'x')], h.io)).toBe(78);
    expect(h.err[1]).toContain('HTTP 500');
    expect(await run(['assets', 'get', 'a1', '-o', join(dir, 'missing', 'x')], h.io)).toBe(78);
    expect(h.err[2]).toContain('Could not write');
  });

  it('uploads text as JSON and binaries as multipart, with an optional filename', async () => {
    writeFileSync(join(dir, 'notes.txt'), 'hello');
    writeFileSync(join(dir, 'img.png'), Buffer.from([137, 0, 78]));
    const fetch = fakeFetch(
      jsonResponse({ status: 201, body: textAsset }),
      jsonResponse({ status: 201, body: binAsset }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['assets', 'upload', join(dir, 'notes.txt')], h.io)).toBe(0);
    expect(callOf(fetch, 0)).toMatchObject({ url: `${V2}/assets`, init: { method: 'POST' } });
    expect(body(fetch, 0)).toEqual({ filename: 'notes.txt', content: 'hello' });
    expect(
      await run(['assets', 'upload', join(dir, 'img.png'), '--filename', 'logo.png'], h.io),
    ).toBe(0);
    const form = callOf(fetch, 1).init?.body as FormData;
    expect(form.get('filename')).toBe('logo.png');
    expect((form.get('file') as File).name).toBe('logo.png');
    expect(h.out[1]).toMatch(/^id\s+a2$/m);
  });

  it('rejects bad filenames and unreadable files on upload', async () => {
    const h = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['assets', 'upload', join(dir, 'a.txt'), '--filename', 'x/y'], h.io)).toBe(78);
    expect(h.err[0]).toContain('Invalid asset filename');
    expect(await run(['assets', 'upload', join(dir, 'missing.txt')], h.io)).toBe(78);
    expect(h.err[1]).toContain('Could not read');
  });

  it('updates by rename, by content, or both', async () => {
    writeFileSync(join(dir, 'new.txt'), 'replaced');
    const fetch = fakeFetch(
      jsonResponse({ body: textAsset }),
      jsonResponse({ body: textAsset }),
      jsonResponse({ body: textAsset }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['assets', 'update', 'a1'], h.io)).toBe(78);
    expect(h.stderr()).toContain('Nothing to update');
    expect(await run(['assets', 'update', 'a1', '--filename', 'renamed.txt'], h.io)).toBe(0);
    expect(body(fetch, 0)).toEqual({ filename: 'renamed.txt' });
    expect(await run(['assets', 'update', 'a1', '--from', join(dir, 'new.txt')], h.io)).toBe(0);
    expect(body(fetch, 1)).toEqual({ content: 'replaced' });
    expect(
      await run(
        [
          'assets',
          'update',
          'a1',
          '--filename',
          'b.bin',
          '--from',
          join(dir, 'new.txt'),
          '--binary',
        ],
        h.io,
      ),
    ).toBe(0);
    const form = callOf(fetch, 2).init?.body as FormData;
    expect(form.get('filename')).toBe('b.bin');
    expect(callOf(fetch, 2)).toMatchObject({ url: `${V2}/assets/a1`, init: { method: 'PATCH' } });
  });

  it('deletes with confirmation', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 204 }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['assets', 'delete', 'a1'], h.io)).toBe(78);
    expect(fetch).not.toHaveBeenCalled();
    expect(await run(['assets', 'delete', 'a1', '--yes'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({ url: `${V2}/assets/a1`, init: { method: 'DELETE' } });
    expect(h.stdout()).toContain('Deleted Asset a1.');
  });
});
