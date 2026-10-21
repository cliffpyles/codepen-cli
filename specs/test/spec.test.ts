import { describe, expect, it } from 'vitest';
import {
  createValidator,
  duplicateOperationIds,
  exampleCases,
  loadSpec,
  metaSchemaProblems,
  operationName,
  operationProblems,
  operations,
  unresolvedRefs,
  unusedComponents,
} from '../lib/spec.js';

const doc = loadSpec();
const ops = operations(doc);

describe('the document', () => {
  it('is valid against the OpenAPI 3.2 meta-schema', () => {
    expect(metaSchemaProblems(doc)).toEqual([]);
  });

  it('resolves every $ref', () => {
    expect(unresolvedRefs(doc)).toEqual([]);
  });

  it('uses every component', () => {
    expect(unusedComponents(doc)).toEqual([]);
  });
});

describe('operations', () => {
  it('have unique operationIds', () => {
    expect(duplicateOperationIds(ops)).toEqual([]);
  });

  it.each(ops.map((op) => [operationName(op), op] as const))(
    '%s has an operationId, declared tags and matching path parameters',
    (_, op) => {
      expect(operationProblems(doc, op)).toEqual([]);
    },
  );
});

describe('examples', () => {
  const validate = createValidator(doc);

  it.each(exampleCases(doc).map((c) => [c.name, c] as const))('%s matches its schema', (_, c) => {
    expect(validate(c.schema, c.value)).toEqual([]);
  });
});
