/** Loading, walking and validating specs/codepen-api-v2.yaml. Every check returns a list of problems; empty means it passed. */

import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { parse } from 'yaml';

export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

export const SPEC_URL = new URL('../codepen-api-v2.yaml', import.meta.url);
export const META_SCHEMA_URL = new URL('../vendor/oas-3.2-schema-2025-09-17.json', import.meta.url);

/** The spec's own `x-codepen-*` keywords, allowed inside schemas. Any other unknown keyword is an error. */
export const EXTENSION_KEYWORDS = [
  'x-codepen-undocumented',
  'x-codepen-changelog',
  'x-codepen-unverified',
  'x-codepen-multi-segment',
];

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
const SPEC_ID = 'urn:codepen:api-v2';
const SCHEMAS = '#/components/schemas/';

// ajv-formats is CommonJS; under NodeNext its default export is the module object.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

export function loadSpec(url: URL = SPEC_URL): JsonObject {
  return parse(readFileSync(url, 'utf8'), { maxAliasCount: -1 }) as JsonObject;
}

export function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolves a local reference such as `#/components/schemas/Pen`. Undefined when it does not resolve. */
export function resolvePointer(doc: Json, ref: string): Json | undefined {
  if (!ref.startsWith('#/')) return undefined;
  let node: Json | undefined = doc;
  for (const raw of ref.slice(2).split('/')) {
    const key = decodeURIComponent(raw).replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(node)) node = node[Number(key)];
    else if (isObject(node)) node = node[key];
    else return undefined;
  }
  return node;
}

/** Every object in the document, depth first, with its JSON pointer. */
export function* walk(node: Json, pointer = '#'): Generator<[string, JsonObject]> {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) yield* walk(item, `${pointer}/${i}`);
  } else if (isObject(node)) {
    yield [pointer, node];
    for (const [key, value] of Object.entries(node)) {
      yield* walk(value, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
    }
  }
}

function deref(doc: JsonObject, node: Json | undefined): Json | undefined {
  return isObject(node) && typeof node.$ref === 'string' ? resolvePointer(doc, node.$ref) : node;
}

function refsIn(doc: JsonObject): string[] {
  return [...walk(doc)].flatMap(([, node]) => (typeof node.$ref === 'string' ? [node.$ref] : []));
}

export function metaSchemaProblems(doc: JsonObject): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  // A media type or range such as `application/json` or `image/*`; ajv-formats has no format for it.
  ajv.addFormat('media-range', /^[\w.+-]+\/(?:[\w.+-]+|\*)(?:\s*;.*)?$|^\*\/\*$/);
  // Ajv resolves `$dynamicRef: "#meta"` against the wrong dynamic scope. With no extending dialect,
  // the only `meta` anchor is `#/$defs/schema`, so a plain `$ref` there checks exactly the same thing.
  const metaSchema = readFileSync(META_SCHEMA_URL, 'utf8').replaceAll(
    '"$dynamicRef": "#meta"',
    '"$ref": "#/$defs/schema"',
  );
  const validate = ajv.compile(JSON.parse(metaSchema) as object);
  if (validate(doc)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`);
}

export function unresolvedRefs(doc: JsonObject): string[] {
  return [...new Set(refsIn(doc))].filter((ref) => resolvePointer(doc, ref) === undefined);
}

export function unusedComponents(doc: JsonObject): string[] {
  const used = new Set(refsIn(doc));
  const securityNames = [...walk(doc)].flatMap(([pointer, node]) =>
    pointer.endsWith('/security') || pointer.match(/\/security\/\d+$/) ? Object.keys(node) : [],
  );
  const components = isObject(doc.components) ? doc.components : {};
  return Object.entries(components).flatMap(([type, group]) =>
    Object.keys(isObject(group) ? group : {})
      .map((name) => `#/components/${type}/${name}`)
      .filter((pointer) =>
        type === 'securitySchemes'
          ? !securityNames.includes(pointer.split('/').at(-1) ?? '')
          : !used.has(pointer),
      ),
  );
}

export interface Operation {
  method: string;
  path: string;
  operation: JsonObject;
  parameters: JsonObject[];
}

export function operations(doc: JsonObject): Operation[] {
  const paths = isObject(doc.paths) ? doc.paths : {};
  return Object.entries(paths).flatMap(([path, item]) => {
    if (!isObject(item)) return [];
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    return HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      if (!isObject(operation)) return [];
      const own = Array.isArray(operation.parameters) ? operation.parameters : [];
      const parameters = [...shared, ...own].map((p) => deref(doc, p)).filter(isObject);
      return [{ method, path, operation, parameters }];
    });
  });
}

export function operationName({ method, path }: Operation): string {
  return `${method.toUpperCase()} ${path}`;
}

export function duplicateOperationIds(ops: Operation[]): string[] {
  const ids = ops.map((op) => op.operation.operationId);
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))].map(String);
}

/** A missing operationId or tag, a tag not declared at the top level, or path parameters that do not match the template. */
export function operationProblems(doc: JsonObject, op: Operation): string[] {
  const problems: string[] = [];
  const declaredTags = (Array.isArray(doc.tags) ? doc.tags : [])
    .filter(isObject)
    .map((t) => t.name);
  const tags = Array.isArray(op.operation.tags) ? op.operation.tags : [];
  if (typeof op.operation.operationId !== 'string') problems.push('no operationId');
  if (tags.length === 0) problems.push('no tags');
  for (const tag of tags)
    if (!declaredTags.includes(tag)) problems.push(`undeclared tag ${String(tag)}`);

  const inTemplate = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '').sort();
  const pathParams = op.parameters.filter((p) => p.in === 'path');
  const declared = pathParams.map((p) => String(p.name)).sort();
  if (inTemplate.join() !== declared.join()) {
    problems.push(
      `path parameters [${declared.join(', ')}] do not match the template [${inTemplate.join(', ')}]`,
    );
  }
  for (const p of pathParams)
    if (p.required !== true) problems.push(`path parameter ${String(p.name)} is not required`);
  return problems;
}

export interface ExampleCase {
  /** Where the example is written, as a JSON pointer. */
  name: string;
  schema: Json;
  value: Json;
}

/**
 * Every example paired with the schema it must satisfy: the `example`/`examples` of each media type,
 * parameter and header, and the `examples` list of every schema under components.
 */
export function exampleCases(doc: JsonObject): ExampleCase[] {
  const cases: ExampleCase[] = [];
  for (const [pointer, node] of walk(doc)) {
    if (pointer.startsWith('#/components/schemas/')) {
      if (Array.isArray(node.examples) && !pointer.endsWith('/properties')) {
        const schema = { $ref: pointer };
        node.examples.forEach((value, i) =>
          cases.push({ name: `${pointer}/examples/${i}`, schema, value }),
        );
      }
      continue;
    }
    if (node.schema === undefined) continue;
    if ('example' in node)
      cases.push({ name: `${pointer}/example`, schema: node.schema, value: node.example });
    if (isObject(node.examples)) {
      for (const [key, example] of Object.entries(node.examples)) {
        const resolved = deref(doc, example);
        if (isObject(resolved) && 'value' in resolved) {
          cases.push({
            name: `${pointer}/examples/${key}`,
            schema: node.schema,
            value: resolved.value,
          });
        }
      }
    }
  }
  return cases;
}

function absoluteRefs(node: Json): Json {
  if (Array.isArray(node)) return node.map(absoluteRefs);
  if (!isObject(node)) return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === '$ref' && typeof value === 'string' && value.startsWith(SCHEMAS)
        ? `${SPEC_ID}#/$defs/${value.slice(SCHEMAS.length)}`
        : absoluteRefs(value),
    ]),
  );
}

/**
 * Validates values against the spec's schemas with JSON Schema 2020-12 and format checking on.
 * `components/schemas` is registered as the `$defs` of `urn:codepen:api-v2`, and every
 * `#/components/schemas/…` reference is rewritten to point there.
 */
export function createValidator(doc: JsonObject): (schema: Json, value: Json) => string[] {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strictTypes: false });
  addFormats(ajv);
  ajv.addFormat('binary', true);
  ajv.addVocabulary(EXTENSION_KEYWORDS);
  const schemas = resolvePointer(doc, '#/components/schemas');
  ajv.addSchema({ $id: SPEC_ID, $defs: absoluteRefs(isObject(schemas) ? schemas : {}) });
  return (schema, value) => {
    const validate = ajv.compile(absoluteRefs(schema) as object);
    if (validate(value)) return [];
    return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`);
  };
}
