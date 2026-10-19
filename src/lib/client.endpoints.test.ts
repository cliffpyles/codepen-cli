import { describe, expect, it, vi } from 'vitest';
import { callOf, fakeFetch, jsonResponse, pen, TEST_KEY, TEST_URL } from '../../test/helpers.js';
import { CodePenClient, isBuildSettled, normalizePenPath } from './client.js';
import type { Build, WriteResult } from '../types.js';

const V2 = `${TEST_URL}/v2`;

function client(fetch: typeof globalThis.fetch, sleep = vi.fn(() => Promise.resolve())) {
  return new CodePenClient({ apiKey: TEST_KEY, baseUrl: TEST_URL, fetch, sleep });
}

function build(overrides: Partial<Build> = {}): Build {
  return { id: 'v1', status: 'Success', ...overrides };
}

const writeResult: WriteResult = { pen: pen() as never, version: { id: 'v1' }, build: build() };

function bodyOf(fetch: ReturnType<typeof fakeFetch>, index = 0): unknown {
  const { init } = callOf(fetch, index);
  return JSON.parse(init?.body as string);
}

describe('normalizePenPath', () => {
  it('adds a leading slash and strips ./ prefixes', () => {
    expect(normalizePenPath('index.html')).toBe('/index.html');
    expect(normalizePenPath('/src/app.js')).toBe('/src/app.js');
    expect(normalizePenPath('./src/app.js')).toBe('/src/app.js');
    expect(normalizePenPath('  //a.css ')).toBe('/a.css');
  });
});

describe('isBuildSettled', () => {
  it('is false while queued/running or canceled with a follow-up', () => {
    expect(isBuildSettled(build({ status: 'Queued' }))).toBe(false);
    expect(isBuildSettled(build({ status: 'Running' }))).toBe(false);
    expect(isBuildSettled(build({ status: 'Canceled', next_id: 'v2' }))).toBe(false);
  });
  it('is true for success, failure, and canceled with no follow-up', () => {
    expect(isBuildSettled(build({ status: 'Success' }))).toBe(true);
    expect(isBuildSettled(build({ status: 'Failed' }))).toBe(true);
    expect(isBuildSettled(build({ status: 'Canceled', next_id: null }))).toBe(true);
  });
});

describe('pens', () => {
  it('creates with files and wait, dropping undefined fields', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 201, body: { ...pen(), build: build() } }));
    await client(fetch).createPen(
      { title: 'T', files: [{ path: 'index.html', content: '<p>' }], description: undefined },
      { wait: 10 },
    );
    expect(callOf(fetch).url).toBe(`${V2}/pens`);
    expect(callOf(fetch).init?.method).toBe('POST');
    expect(bodyOf(fetch)).toEqual({
      title: 'T',
      files: [{ path: 'index.html', content: '<p>' }],
      wait: 10,
    });
  });

  it('creates multipart when a file is binary, keeping text files in the pen part', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 201, body: { ...pen(), build: build() } }));
    await client(fetch).createPen(
      {
        title: 'T',
        description: undefined,
        files: [
          { path: 'index.html', content: '<p>' },
          { path: 'img/logo.png', data: new Uint8Array([0, 1]) },
        ],
      },
      { wait: 0 },
    );
    const { url, init, headers } = callOf(fetch);
    expect(url).toBe(`${V2}/pens?wait=0`);
    expect(init?.method).toBe('POST');
    expect(headers['Content-Type']).toBeUndefined();
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(form.get('pen') as string)).toEqual({
      title: 'T',
      files: [{ path: 'index.html', content: '<p>' }],
    });
    const part = form.get('/img/logo.png') as File;
    expect(part.name).toBe('logo.png');
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(new Uint8Array([0, 1]));
    expect(form.has('wait')).toBe(false);
  });

  it('updates, deletes, forks and changes settings', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: pen() }),
      jsonResponse({ status: 204 }),
      jsonResponse({ status: 201, body: pen({ id: 'fork' }) }),
      jsonResponse({ body: { tab_size: 4 } }),
    );
    const c = client(fetch);
    await c.updatePen('a b', { title: 'New', tags: ['x'] });
    await c.deletePen('abc');
    await c.forkPen('abc', { title: 'Copy' }, { wait: 0 });
    await c.updatePenSettings('abc', { tab_size: 4, indent_with: 'tabs' });

    expect(callOf(fetch, 0)).toMatchObject({ url: `${V2}/pens/a%20b`, init: { method: 'PATCH' } });
    expect(bodyOf(fetch, 0)).toEqual({ title: 'New', tags: ['x'] });
    expect(callOf(fetch, 1)).toMatchObject({ url: `${V2}/pens/abc`, init: { method: 'DELETE' } });
    expect(callOf(fetch, 1).init?.body).toBeUndefined();
    expect(callOf(fetch, 2).url).toBe(`${V2}/pens/abc/fork`);
    expect(bodyOf(fetch, 2)).toEqual({ title: 'Copy', wait: 0 });
    expect(callOf(fetch, 3).url).toBe(`${V2}/pens/abc/settings`);
    expect(bodyOf(fetch, 3)).toEqual({ tab_size: 4, indent_with: 'tabs' });
  });

  it('passes list filters through', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }));
    await client(fetch).listPens({
      deployed: true,
      forks: 'Forked',
      editor: 'V2',
      sort: 'updated',
    });
    expect(callOf(fetch).url).toBe(`${V2}/pens?deployed=true&forks=Forked&editor=V2&sort=updated`);
  });
});

describe('pen files', () => {
  it('lists and gets files with encoded nested paths', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: [] }),
      jsonResponse({ body: { id: 'f', path: '/a' } }),
    );
    const c = client(fetch);
    await c.listFiles('p1');
    await c.getFile('p1', 'src/my app.js');
    expect(callOf(fetch, 0).url).toBe(`${V2}/pens/p1/files`);
    expect(callOf(fetch, 1).url).toBe(`${V2}/pens/p1/files/src/my%20app.js`);
  });

  it('writes a text file with wait and expected version', async () => {
    const fetch = fakeFetch(jsonResponse({ body: writeResult }));
    const result = await client(fetch).putFile('p1', 'index.html', '<h1>', {
      wait: 5,
      expected_version_id: 'v0',
    });
    expect(result.build.status).toBe('Success');
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/files/index.html`,
      init: { method: 'PUT' },
    });
    expect(bodyOf(fetch)).toEqual({ content: '<h1>', wait: 5, expected_version_id: 'v0' });
  });

  it('writes a binary file as multipart without a JSON content type', async () => {
    const fetch = fakeFetch(jsonResponse({ body: writeResult }));
    await client(fetch).putBinaryFile('p1', 'img/logo.png', new Uint8Array([1, 2, 3]), {
      wait: 0,
      expected_version_id: 'v0',
    });
    const { url, init, headers } = callOf(fetch);
    expect(url).toBe(`${V2}/pens/p1/files/img/logo.png`);
    expect(headers['Content-Type']).toBeUndefined();
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get('file') as File).name).toBe('logo.png');
    expect(form.get('wait')).toBe('0');
    expect(form.get('expected_version_id')).toBe('v0');
  });

  it('applies bulk changes and deletes with query options', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: writeResult }),
      jsonResponse({ body: writeResult }),
    );
    const c = client(fetch);
    await c.putFiles('p1', [{ path: 'a.css', delete: true }], { expected_version_id: 'v0' });
    await c.deleteFile('p1', '/old.js', { wait: 0, expected_version_id: 'v0' });
    expect(callOf(fetch, 0).url).toBe(`${V2}/pens/p1/files`);
    expect(bodyOf(fetch, 0)).toEqual({
      files: [{ path: 'a.css', delete: true }],
      expected_version_id: 'v0',
    });
    expect(callOf(fetch, 1)).toMatchObject({
      url: `${V2}/pens/p1/files/old.js?wait=0&expected_version_id=v0`,
      init: { method: 'DELETE' },
    });
  });

  it('applies bulk changes with binary uploads as multipart', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: writeResult }),
      jsonResponse({ body: writeResult }),
    );
    const c = client(fetch);
    await c.putFiles(
      'p1',
      [{ path: 'index.html', content: '<img>' }],
      { wait: 5, expected_version_id: 'v0' },
      [{ path: './img/logo.png', data: new Uint8Array([0, 1]) }],
    );
    await c.putFiles('p1', [], {}, [{ path: 'a.bin', data: new Uint8Array([0]) }]);
    const first = callOf(fetch, 0);
    expect(first.url).toBe(`${V2}/pens/p1/files?wait=5`);
    expect(first.init?.method).toBe('PUT');
    expect(first.headers['Content-Type']).toBeUndefined();
    const form = first.init?.body as FormData;
    expect(JSON.parse(form.get('changes') as string)).toEqual({
      files: [{ path: 'index.html', content: '<img>' }],
    });
    expect(form.get('expected_version_id')).toBe('v0');
    expect((form.get('/img/logo.png') as File).name).toBe('logo.png');
    const second = callOf(fetch, 1).init?.body as FormData;
    expect(second.has('changes')).toBe(false);
    expect(second.has('expected_version_id')).toBe(false);
    expect(callOf(fetch, 1).url).toBe(`${V2}/pens/p1/files`);
  });
});

describe('versions, builds, deployments', () => {
  it('hits the version, build, restore and deployment endpoints', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: [] }),
      jsonResponse({ body: { id: 'v1' } }),
      jsonResponse({ body: build() }),
      jsonResponse({ body: pen() }),
      jsonResponse({ body: { id: 'd', version_id: 'v1' } }),
      jsonResponse({ body: { id: 'd', version_id: 'v2' } }),
      jsonResponse({ status: 204 }),
    );
    const c = client(fetch);
    await c.listVersions('p1', { page: 2 });
    await c.getVersion('v1');
    await c.getBuild('v1');
    await c.restoreVersion('p1', 'v0');
    await c.deploy('p1');
    await c.deploy('p1', 'v2');
    await c.undeploy('p1');

    expect(callOf(fetch, 0).url).toBe(`${V2}/pens/p1/versions?page=2`);
    expect(callOf(fetch, 1).url).toBe(`${V2}/versions/v1`);
    expect(callOf(fetch, 2).url).toBe(`${V2}/builds/v1`);
    expect(callOf(fetch, 3)).toMatchObject({
      url: `${V2}/pens/p1/versions/v0/restore`,
      init: { method: 'POST' },
    });
    expect(callOf(fetch, 4)).toMatchObject({
      url: `${V2}/pens/p1/deployment`,
      init: { method: 'PUT' },
    });
    expect(bodyOf(fetch, 4)).toEqual({});
    expect(bodyOf(fetch, 5)).toEqual({ version_id: 'v2' });
    expect(callOf(fetch, 6).init?.method).toBe('DELETE');
  });

  it('waitForBuild polls until settled and follows next_id after a cancel', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: build({ id: 'v1', status: 'Running' }) }),
      jsonResponse({ body: build({ id: 'v1', status: 'Canceled', next_id: 'v2' }) }),
      jsonResponse({ body: build({ id: 'v2', status: 'Running' }) }),
      jsonResponse({ body: build({ id: 'v2', status: 'Success' }) }),
    );
    const sleep = vi.fn(() => Promise.resolve());
    const result = await client(fetch, sleep).waitForBuild(build({ id: 'v1', status: 'Queued' }), {
      intervalMs: 10,
    });
    expect(result).toEqual(build({ id: 'v2', status: 'Success' }));
    expect(sleep).toHaveBeenCalledTimes(4);
    expect(callOf(fetch, 2).url).toBe(`${V2}/builds/v2`);
  });

  it('waitForBuild returns immediately for a settled build and gives up on timeout', async () => {
    const settled = build({ status: 'Failed' });
    const fetch = fakeFetch(jsonResponse({ body: build({ status: 'Running' }) }));
    const c = client(fetch);
    expect(await c.waitForBuild(settled)).toBe(settled);
    expect(fetch).not.toHaveBeenCalled();

    const result = await c.waitForBuild(build({ status: 'Queued' }), {
      intervalMs: 10,
      timeoutMs: 10,
    });
    expect(result.status).toBe('Running');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('collaborators', () => {
  it('lists, invites, updates, removes and lists invites', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: [] }),
      jsonResponse({ status: 201, body: [] }),
      jsonResponse({ body: [] }),
      jsonResponse({ status: 204 }),
      jsonResponse({ body: [] }),
    );
    const c = client(fetch);
    await c.listCollaborators('p1');
    await c.inviteCollaborator('p1', 'a@b.co', 'Editor');
    await c.updateCollaborator('p1', 'some one', 'Viewer');
    await c.removeCollaborator('p1', 'someone');
    await c.listInvites('p1');
    expect(callOf(fetch, 0).url).toBe(`${V2}/pens/p1/collaborators`);
    expect(bodyOf(fetch, 1)).toEqual({ email_or_username: 'a@b.co', role: 'Editor' });
    expect(callOf(fetch, 2)).toMatchObject({
      url: `${V2}/pens/p1/collaborators/some%20one`,
      init: { method: 'PATCH' },
    });
    expect(bodyOf(fetch, 2)).toEqual({ role: 'Viewer' });
    expect(callOf(fetch, 3).init?.method).toBe('DELETE');
    expect(callOf(fetch, 4).url).toBe(`${V2}/pens/p1/invites`);
  });
});

describe('collections', () => {
  it('covers every collection endpoint', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: { id: 'c1' } }),
      jsonResponse({ status: 201, body: { id: 'c1' } }),
      jsonResponse({ body: { id: 'c1' } }),
      jsonResponse({ status: 204 }),
      jsonResponse({ body: [] }),
      jsonResponse({ body: { id: 'c1' } }),
      jsonResponse({ status: 204 }),
    );
    const c = client(fetch);
    await c.getCollection('c1');
    await c.createCollection({ title: 'T', access: 'Public' });
    await c.updateCollection('c1', { description: 'd' });
    await c.deleteCollection('c1');
    await c.listCollectionPens('c1', { per_page: 5 });
    await c.addPenToCollection('c1', 'p1');
    await c.removePenFromCollection('c1', 'p1');
    expect(callOf(fetch, 0).url).toBe(`${V2}/collections/c1`);
    expect(callOf(fetch, 1)).toMatchObject({ url: `${V2}/collections`, init: { method: 'POST' } });
    expect(bodyOf(fetch, 1)).toEqual({ title: 'T', access: 'Public' });
    expect(callOf(fetch, 2).init?.method).toBe('PATCH');
    expect(callOf(fetch, 3).init?.method).toBe('DELETE');
    expect(callOf(fetch, 4).url).toBe(`${V2}/collections/c1/pens?per_page=5`);
    expect(callOf(fetch, 5)).toMatchObject({
      url: `${V2}/collections/c1/pens/p1`,
      init: { method: 'PUT' },
    });
    expect(callOf(fetch, 6)).toMatchObject({
      url: `${V2}/collections/c1/pens/p1`,
      init: { method: 'DELETE' },
    });
  });
});

describe('assets', () => {
  it('gets and deletes', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: { id: 'a1', filename: 'x' } }),
      jsonResponse({ status: 204 }),
    );
    const c = client(fetch);
    await c.getAsset('a1');
    await c.deleteAsset('a1');
    expect(callOf(fetch, 0).url).toBe(`${V2}/assets/a1`);
    expect(callOf(fetch, 1).init?.method).toBe('DELETE');
  });

  it('creates text assets as JSON and binary assets as multipart', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 201, body: { id: 'a1', filename: 'notes.txt' } }),
      jsonResponse({ status: 201, body: { id: 'a2', filename: 'logo.png' } }),
    );
    const c = client(fetch);
    await c.createAsset('notes.txt', 'hello');
    await c.createAsset('logo.png', new Uint8Array([137, 80]));
    expect(bodyOf(fetch, 0)).toEqual({ filename: 'notes.txt', content: 'hello' });
    const form = callOf(fetch, 1).init?.body as FormData;
    expect((form.get('file') as File).name).toBe('logo.png');
    expect(form.get('filename')).toBe('logo.png');
  });

  it('updates by rename only, text content, or binary content', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: { id: 'a1', filename: 'new.txt' } }),
      jsonResponse({ body: { id: 'a1', filename: 'new.txt' } }),
      jsonResponse({ body: { id: 'a1', filename: 'b.bin' } }),
      jsonResponse({ body: { id: 'a1', filename: 'b.bin' } }),
    );
    const c = client(fetch);
    await c.updateAsset('a1', { filename: 'new.txt' });
    await c.updateAsset('a1', { data: 'text' });
    await c.updateAsset('a1', { filename: 'b.bin', data: new Uint8Array([1]) });
    await c.updateAsset('a1', { data: new Uint8Array([1]) });
    expect(bodyOf(fetch, 0)).toEqual({ filename: 'new.txt' });
    expect(bodyOf(fetch, 1)).toEqual({ content: 'text' });
    const named = callOf(fetch, 2).init?.body as FormData;
    expect(named.get('filename')).toBe('b.bin');
    expect((named.get('file') as File).name).toBe('b.bin');
    const unnamed = callOf(fetch, 3).init?.body as FormData;
    expect(unnamed.get('filename')).toBeNull();
    expect((unnamed.get('file') as File).name).toBe('file');
  });
});
