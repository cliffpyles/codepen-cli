import { describe, expect, it } from 'vitest';
import { applyOverlay, buildSpec, closeSchemas, flattenAllOf, targetKeys } from '../lib/merge.js';
import type { JsonObject } from '../lib/spec.js';

const doc = (): JsonObject => ({
  paths: { '/v2/pens': { get: { summary: 'List' } } },
  components: {
    schemas: {
      Base: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      Used: { type: 'object', properties: { a: { type: 'string' } } },
      Whole: {
        description: 'Combined',
        allOf: [
          { $ref: '#/components/schemas/Base' },
          { type: 'object', required: ['b'], properties: { b: { type: 'string' } } },
        ],
      },
      AlsoUsed: { allOf: [{ $ref: '#/components/schemas/Used' }, { required: ['a'] }] },
      Open: { type: 'object', properties: {}, additionalProperties: true },
    },
  },
  x: { $ref: '#/components/schemas/Used' },
});
const schemas = (d: JsonObject) => (d.components as JsonObject).schemas as JsonObject;

describe('overlay targets', () => {
  it('walk dotted and bracketed keys', () => {
    expect(targetKeys("$.paths['/v2/pens'].get.responses['200']")).toEqual([
      'paths',
      '/v2/pens',
      'get',
      'responses',
      '200',
    ]);
  });

  it('refuse wildcards and filters', () => {
    expect(() => targetKeys('$.paths.*.get')).toThrow('Unsupported');
    expect(() => targetKeys('$..schema')).toThrow('Unsupported');
  });
});

describe('applying an overlay', () => {
  it('merges objects recursively, replacing values and adding new keys', () => {
    const d = doc();
    applyOverlay(d, [
      { target: "$.paths['/v2/pens'].get", update: { summary: 'All', tags: ['Pens'] } },
    ]);
    expect((d.paths as JsonObject)['/v2/pens']).toEqual({
      get: { summary: 'All', tags: ['Pens'] },
    });
  });

  it('removes a node and appends to a targeted array', () => {
    const d = doc();
    applyOverlay(d, [
      { target: '$.components.schemas.Open', remove: true },
      { target: '$.components.schemas.Base.required', update: 'x' },
    ]);
    expect(schemas(d).Open).toBeUndefined();
    expect((schemas(d).Base as JsonObject).required).toEqual(['id', 'x']);
  });

  it('fails when a target no longer exists, so upstream changes cannot be silently missed', () => {
    expect(() =>
      applyOverlay(doc(), [{ target: '$.components.schemas.Gone', update: { a: 1 } }]),
    ).toThrow('matches nothing');
    expect(() => applyOverlay(doc(), [{ target: '$.nope.deeper', remove: true }])).toThrow(
      'matches nothing',
    );
  });

  it('refuses to merge two arrays and an action that does nothing', () => {
    expect(() =>
      applyOverlay(doc(), [{ target: '$.components.schemas.Base', update: { required: ['y'] } }]),
    ).toThrow('two arrays');
    expect(() => applyOverlay(doc(), [{ target: '$.components.schemas.Base' }])).toThrow(
      'does nothing',
    );
  });
});

describe('flattening and closing', () => {
  it('turns allOf into one object and drops parts nothing else refers to', () => {
    const d = doc();
    flattenAllOf(d);
    expect(schemas(d).Whole).toEqual({
      type: 'object',
      description: 'Combined',
      required: ['id', 'b'],
      properties: { id: { type: 'string' }, b: { type: 'string' } },
    });
    expect(schemas(d).Base).toBeUndefined();
    expect(schemas(d).Used).toBeDefined();
    expect((schemas(d).AlsoUsed as JsonObject).required).toEqual(['a']);
  });

  it('refuses an allOf part it cannot flatten faithfully', () => {
    const d = doc();
    (schemas(d).Base as JsonObject).oneOf = [];
    expect(() => flattenAllOf(d)).toThrow('Cannot flatten Whole: oneOf');
  });

  it('closes objects but keeps an explicit additionalProperties', () => {
    const d = doc();
    closeSchemas(d);
    expect((schemas(d).Base as JsonObject).additionalProperties).toBe(false);
    expect((schemas(d).Open as JsonObject).additionalProperties).toBe(true);
  });

  it('never changes the upstream document it is given', () => {
    const upstream = doc();
    const before = structuredClone(upstream);
    const built = buildSpec(upstream, [
      [{ target: '$.components.schemas.Used', update: { description: 'x' } }],
    ]);
    expect(upstream).toEqual(before);
    expect((schemas(built).Used as JsonObject).description).toBe('x');
  });
});
