import { describe, expect, it } from 'vitest';
import {
  addEntry,
  CHANGELOG_HEADER,
  describeChanges,
  describePath,
  fingerprint,
  newestFingerprint,
} from '../lib/changelog.js';
import type { JsonObject } from '../lib/spec.js';

const spec = (): JsonObject => ({
  openapi: '3.1.1',
  info: { title: 'A', version: '2' },
  paths: {
    '/v2/pens': {
      get: {
        summary: 'List Pens',
        parameters: [{ name: 'page', in: 'query' }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
  components: {
    schemas: {
      Pen: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' }, editor: { enum: ['V2', 'Classic'] } },
      },
      Old: { type: 'object' },
    },
  },
});

describe('describing a change to the spec', () => {
  it('says nothing for the same document', () => {
    expect(describeChanges(spec(), spec())).toEqual([]);
  });

  it('names added and removed operations, parameters and responses', () => {
    const after = spec();
    const paths = after.paths as JsonObject;
    const get = (paths['/v2/pens'] as JsonObject).get as JsonObject;
    get.parameters = [{ name: 'cursor', in: 'query' }];
    get.responses = { '200': { description: 'ok' }, '400': { description: 'bad' } };
    paths['/v2/trash'] = { get: { summary: 'List the trash', responses: {} } };
    expect(describeChanges(spec(), after)).toEqual([
      '- Added operation `GET /v2/trash`: List the trash',
      '- `GET /v2/pens`: added parameters `query cursor`',
      '- `GET /v2/pens`: removed parameters `query page`',
      '- `GET /v2/pens`: added responses `400`',
    ]);
    expect(describeChanges(after, spec())[0]).toBe('- Removed operation `GET /v2/trash`');
  });

  it('names schema, field, required and enum changes', () => {
    const after = spec();
    const schemas = (after.components as JsonObject).schemas as JsonObject;
    delete schemas.Old;
    schemas.Trash = { type: 'object' };
    const pen = schemas.Pen as JsonObject;
    pen.required = ['id', 'title'];
    pen.properties = {
      id: { type: 'string' },
      title: { type: 'string' },
      editor: { enum: ['V2'] },
    };
    expect(describeChanges(spec(), after)).toEqual([
      '- Added schemas `Trash`',
      '- Removed schemas `Old`',
      '- `Pen`: added fields `title`',
      '- `Pen`: now requires `title`',
      '- `Pen.editor`: removed values `Classic`',
    ]);
  });

  it('lists every other difference by location, capped', () => {
    const after = spec();
    (after.info as JsonObject).version = '3';
    const paths = after.paths as JsonObject;
    ((paths['/v2/pens'] as JsonObject).get as JsonObject).summary = 'All Pens';
    expect(describeChanges(spec(), after)).toEqual([
      '- Changed `info.version`',
      '- Changed `paths["/v2/pens"].get.summary`',
    ]);
    const many = spec();
    many.info = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`x${i}`, i]));
    const lines = describeChanges(spec(), many);
    expect(lines).toHaveLength(26);
    expect(lines.at(-1)).toBe('- …and 7 more');
  });

  it('writes readable locations', () => {
    expect(describePath(['paths', '/v2/pens', 'get'])).toBe('paths["/v2/pens"].get');
    expect(describePath(['components', 'schemas', 'Pen'])).toBe('components.schemas.Pen');
  });
});

describe('the changelog file', () => {
  it('starts with the header and puts the newest entry first', () => {
    const first = addEntry(undefined, '2026-10-30', ['- First copy saved.']);
    expect(first).toBe(`${CHANGELOG_HEADER}\n## 2026-10-30\n\n- First copy saved.\n`);
    const second = addEntry(first, '2026-11-21', ['- Changed `info.version`']);
    expect(second).toBe(
      `${CHANGELOG_HEADER}\n## 2026-11-21\n\n- Changed \`info.version\`\n\n## 2026-10-30\n\n- First copy saved.\n`,
    );
  });
});

describe('fingerprints', () => {
  it('records the copies an entry describes, and reads back only the newest', () => {
    const copies = fingerprint(['a', 'b']);
    expect(copies).toMatch(/^[0-9a-f]{64} [0-9a-f]{64}$/);
    const first = addEntry(undefined, '2026-10-30', ['- First copy saved.']);
    expect(newestFingerprint(first)).toBeUndefined();
    const second = addEntry(first, '2026-11-21', ['- Changed `info.version`'], copies);
    expect(second).toContain(`## 2026-11-21\n\n<!-- copies: ${copies} -->\n\n- Changed`);
    expect(newestFingerprint(second)).toBe(copies);
    expect(newestFingerprint(addEntry(second, '2026-12-01', ['- x']))).toBeUndefined();
  });

  it('changes when any byte of a copy does', () => {
    expect(fingerprint(['a', 'b'])).not.toBe(fingerprint(['a', 'b ']));
  });
});
