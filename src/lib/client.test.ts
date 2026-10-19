import { describe, expect, it } from 'vitest';
import { callOf, fakeFetch, jsonResponse, pen, TEST_KEY, TEST_URL } from '../../test/helpers.js';
import { CodePenClient, parseLinkHeader } from './client.js';
import { CodePenApiError } from './errors.js';

function client(fetch: typeof globalThis.fetch) {
  return new CodePenClient({ apiKey: TEST_KEY, baseUrl: `${TEST_URL}/`, fetch });
}

describe('parseLinkHeader', () => {
  it('returns an empty object for a missing header', () => {
    expect(parseLinkHeader(null)).toEqual({});
  });

  it('extracts page numbers per rel', () => {
    const header =
      `<${TEST_URL}/v2/pens?page=3&per_page=10>; rel="next", ` +
      `<${TEST_URL}/v2/pens?page=1>; rel="prev", <${TEST_URL}/v2/pens?page=9>; rel="last"`;
    expect(parseLinkHeader(header)).toEqual({ next: 3, prev: 1, last: 9 });
  });

  it('ignores malformed parts and unknown rels', () => {
    expect(parseLinkHeader(`garbage, <${TEST_URL}/v2/pens?page=2>; rel="alternate"`)).toEqual({});
    expect(parseLinkHeader(`<${TEST_URL}/v2/pens>; rel="next"`)).toEqual({});
  });
});

describe('CodePenClient', () => {
  it('builds URLs under /v2, dropping undefined values and comma-joining arrays', () => {
    const url = client(fakeFetch()).buildUrl('pens', {
      page: 2,
      tags: ['a', 'b'],
      access: undefined,
      x: true,
    });
    expect(url).toBe(`${TEST_URL}/v2/pens?page=2&tags=a%2Cb&x=true`);
  });

  it('sends the bearer key and parses JSON', async () => {
    const fetch = fakeFetch(jsonResponse({ body: pen() }));
    const result = await client(fetch).getPen('abc 123');

    expect(result.title).toBe('Hello Pen');
    expect(fetch).toHaveBeenCalledTimes(1);
    const { url, init, headers } = callOf(fetch);
    expect(url).toBe(`${TEST_URL}/v2/pens/abc%20123`);
    expect(init?.method).toBe('GET');
    expect(headers.Authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(init?.body).toBeUndefined();
  });

  it('serialises JSON bodies with a content type', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 201, body: pen() }));
    await client(fetch).request('POST', '/pens', { body: { title: 'New' } });
    const { init, headers } = callOf(fetch);
    expect(init?.body).toBe('{"title":"New"}');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('returns undefined data for 204 responses', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 204 }));
    const { data } = await client(fetch).request('DELETE', '/pens/x');
    expect(data).toBeUndefined();
  });

  it('lists with pagination links', async () => {
    const fetch = fakeFetch(
      jsonResponse({
        body: [pen(), pen({ id: 'def456' })],
        headers: { Link: `<${TEST_URL}/v2/pens?page=2>; rel="next"` },
      }),
    );
    const page = await client(fetch).listPens({ per_page: 2, tags: ['css'] });
    expect(page.items).toHaveLength(2);
    expect(page.links).toEqual({ next: 2 });
    expect(callOf(fetch).url).toBe(`${TEST_URL}/v2/pens?per_page=2&tags=css`);
  });

  it('exposes collection and asset listings', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [] }), jsonResponse({ body: [] }));
    const c = client(fetch);
    await c.listCollections({ access: 'Public' });
    await c.listAssets();
    expect(callOf(fetch, 0).url).toBe(`${TEST_URL}/v2/collections?access=Public`);
    expect(callOf(fetch, 1).url).toBe(`${TEST_URL}/v2/assets`);
  });

  it('throws CodePenApiError with the API code on failure', async () => {
    const fetch = fakeFetch(
      jsonResponse({ status: 401, body: { message: 'Bad key', code: 'UNAUTHENTICATED' } }),
    );
    const err = await client(fetch)
      .getPen('x')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodePenApiError);
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHENTICATED', message: 'Bad key' });
  });

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    const fetch = fakeFetch(
      new Response('<html>oops</html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    const err = await client(fetch)
      .getPen('x')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: 'UNKNOWN', message: 'HTTP 502 Bad Gateway' });
  });
});
