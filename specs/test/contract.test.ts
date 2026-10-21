import { describe, expect, it } from 'vitest';
import {
  expandPath,
  expectedResponse,
  findOperation,
  responseProblems,
} from '../contract/contract.js';
import { createValidator, loadSpec } from '../lib/spec.js';

const doc = loadSpec();
const validate = createValidator(doc);

describe('contract helpers', () => {
  it('fill a path template, keeping slashes only in a multi-segment parameter', () => {
    const op = findOperation(doc, 'getPenFile');
    expect(expandPath(op, { id: 'a b', path: '/src/my app.js' })).toBe(
      '/pens/a%20b/files/src/my%20app.js',
    );
  });

  it('refuse a template with a missing value', () => {
    expect(() => expandPath(findOperation(doc, 'getPen'), {})).toThrow('{id}');
  });

  it('read the schema and required Link header of a list', () => {
    const expected = expectedResponse(doc, findOperation(doc, 'listPens'), 200);
    expect(expected.requiredHeaders).toEqual(['Link']);
  });

  it('report a wrong status, a missing header and a body that breaks the schema', () => {
    const expected = expectedResponse(doc, findOperation(doc, 'listPens'), 200);
    const live = (status: number, headers: Record<string, string>, body: unknown) => ({
      status,
      headers: new Headers(headers),
      body: body as never,
    });
    expect(responseProblems(expected, 200, live(404, {}, []), validate)).toEqual([
      'answered 404, expected 200',
    ]);
    expect(
      responseProblems(expected, 200, live(200, { link: '<x>; rel="first"' }, []), validate),
    ).toEqual([]);
    expect(responseProblems(expected, 200, live(200, {}, [{ id: 1 }]), validate)).toContain(
      'missing required header Link',
    );
    expect(
      responseProblems(expected, 200, live(200, { link: 'x' }, [{ id: 1 }]), validate).length,
    ).toBeGreaterThan(0);
  });

  it('cover only operations that exist in the spec', () => {
    for (const id of [
      'listPens',
      'getPen',
      'listPenFiles',
      'getPenFile',
      'listPenVersions',
      'getVersion',
      'getBuild',
      'listPenCollaborators',
      'listPenInvites',
      'listCollections',
      'getCollection',
      'listCollectionPens',
      'listAssets',
      'getAsset',
    ]) {
      expect(() => findOperation(doc, id)).not.toThrow();
    }
  });
});
