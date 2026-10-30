import { describe, expect, it } from 'vitest';
import { endpointCoverage, matchOperation } from '../endpoints/coverage.js';
import { loadSpec, operations } from '../lib/spec.js';

const ops = operations(loadSpec());
const api = 'https://api.example.test/v2';
const idOf = (method: string, path: string) =>
  matchOperation(ops, { method, url: `${api}${path}` })?.operation.operationId;

describe('endpoint coverage', () => {
  it('matches requests by method and path template, ignoring the query', () => {
    expect(idOf('GET', '/pens?per_page=3&tags=a,b')).toBe('pens');
    expect(idOf('POST', '/pens?wait=0')).toBe('penCreate');
    expect(idOf('GET', '/pens/abc123')).toBe('pen');
    expect(idOf('GET', '/pens/abc123/files')).toBe('penFiles');
    expect(idOf('PUT', '/pens/abc123/versions/v1/restore')).toBeUndefined();
    expect(idOf('POST', '/pens/abc123/versions/v1/restore')).toBe('penVersionRestore');
  });

  it('lets only the multi-segment file path span slashes', () => {
    expect(idOf('GET', '/pens/abc123/files/src/deep/app.js')).toBe('penFile');
    expect(idOf('GET', '/collections/c1/pens/p1/extra')).toBeUndefined();
  });

  it('reports operations no request reached and requests the spec does not know', () => {
    const coverage = endpointCoverage(ops, [
      { method: 'GET', url: `${api}/pens` },
      { method: 'GET', url: `${api}/pens` },
      { method: 'GET', url: `${api}/me` },
    ]);
    expect(coverage.covered).toBe(1);
    expect(coverage.uncovered).toHaveLength(ops.length - 1);
    expect(coverage.uncovered).toContain('GET /v2/pens/{id}');
    expect(coverage.unknown).toEqual([`GET ${api}/me`]);
  });
});
