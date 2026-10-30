import { describe, expect, it, vi } from 'vitest';
import { fetchUpstream, parseUpstream, sameSpec, UPSTREAM_SPEC_URL } from '../lib/upstream.js';

const spec = 'openapi: 3.1.1\npaths:\n  /a: {}\ninfo:\n  title: A\n';

describe('pulling the official spec', () => {
  it('fetches from the published URL and returns its text unchanged', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(spec));
    await expect(fetchUpstream(fetchFn)).resolves.toBe(spec);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(UPSTREAM_SPEC_URL);
  });

  it('fails on an error status', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    await expect(fetchUpstream(fetchFn)).rejects.toThrow('503');
  });

  it('refuses something that is not an OpenAPI 3.1 document', () => {
    expect(() => parseUpstream('<html></html>')).toThrow('mapping');
    expect(() => parseUpstream('openapi: 3.0.3\npaths: {a: 1}')).toThrow('3.1');
    expect(() => parseUpstream('openapi: 3.1.1\npaths: {}')).toThrow('no paths');
  });

  it('compares by content, ignoring key order, formatting and comments', () => {
    const reordered = '# note\ninfo: {title: A}\npaths:\n  /a: {}\nopenapi: 3.1.1\n';
    expect(sameSpec(spec, reordered)).toBe(true);
    expect(sameSpec(spec, spec.replace('title: A', 'title: B'))).toBe(false);
  });
});
