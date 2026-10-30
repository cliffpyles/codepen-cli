import { describe, expect, it } from 'vitest';
import {
  createValidator,
  exampleCases,
  isObject,
  loadSpec,
  operationName,
  operations,
  resolvePointer,
} from '../lib/spec.js';
import type { Json, JsonObject, Operation } from '../lib/spec.js';
import { UPSTREAM_FILE_URL } from '../lib/upstream.js';

const doc = loadSpec();
const upstream = loadSpec(UPSTREAM_FILE_URL);
const validateUpstream = createValidator(upstream);

function surface(spec: JsonObject): Record<string, unknown> {
  return Object.fromEntries(
    operations(spec).map((op: Operation) => [
      operationName(op),
      {
        parameters: op.parameters.map((p) => `${String(p.in)} ${String(p.name)}`),
        responses: Object.keys(op.operation.responses as JsonObject),
        body: Object.keys(
          (isObject(op.operation.requestBody) &&
            (op.operation.requestBody.content as JsonObject)) ||
            {},
        ),
      },
    ]),
  );
}

describe('the spec built on upstream', () => {
  it('has the same operations, parameters, statuses and body types as upstream', () => {
    expect(surface(doc)).toEqual(surface(upstream));
  });

  it('keeps upstream prose', () => {
    expect(doc.info).toEqual(upstream.info);
  });

  // Our overlays may only narrow, so what is valid in our spec must be valid upstream too.
  const cases = exampleCases(doc).flatMap((c) => {
    const media = c.name.replace(/\/examples?(\/[^/]+)?$/, '');
    const node = resolvePointer(upstream, media);
    return isObject(node) && node.schema !== undefined
      ? [{ name: c.name, schema: node.schema as Json, value: c.value }]
      : [];
  });

  it('has examples to compare', () => {
    expect(cases.length).toBeGreaterThan(40);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s is also valid upstream', (_, c) => {
    expect(validateUpstream(c.schema, c.value)).toEqual([]);
  });
});
