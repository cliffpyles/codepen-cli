/**
 * Builds codepen-api-v2.yaml from CodePen's official spec: applies our overlays to it, then flattens
 * and closes its schemas. Upstream's document is never edited; every difference is written here or
 * in overlays/.
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { isObject, loadSpec, walk } from './spec.js';
import type { Json, JsonObject } from './spec.js';
import { UPSTREAM_FILE_URL } from './upstream.js';

export const OVERLAY_URLS = [
  new URL('../overlays/refinements.yaml', import.meta.url),
  new URL('../overlays/examples.yaml', import.meta.url),
];

/** One action of an OpenAPI Overlay 1.0 document. */
export interface OverlayAction {
  target: string;
  update?: Json;
  remove?: boolean;
}

/**
 * The keys a target walks. Only the plain paths of JSONPath are supported, `$.a.b['c/d']`, each
 * selecting one node: a wildcard could quietly match nothing or too much.
 */
export function targetKeys(target: string): string[] {
  if (!/^\$(?:\.[\w-]+|\['[^']+'\])+$/.test(target)) {
    throw new Error(`Unsupported overlay target: ${target}`);
  }
  return [...target.matchAll(/\.([\w-]+)|\['([^']+)'\]/g)].map((m) => m[1] ?? m[2] ?? '');
}

/** Recursively merges objects. Two arrays would be ambiguous, so one must be removed first. */
function merge(target: JsonObject, update: JsonObject, where: string): void {
  for (const [key, value] of Object.entries(update)) {
    const existing = target[key];
    if (isObject(existing) && isObject(value)) merge(existing, value, `${where}.${key}`);
    else if (Array.isArray(existing) && Array.isArray(value)) {
      throw new Error(`Overlay would merge two arrays at ${where}.${key}; remove it first`);
    } else target[key] = value;
  }
}

/** Applies overlay actions in order. An action whose target is gone from the document throws. */
export function applyOverlay(doc: JsonObject, actions: OverlayAction[]): void {
  for (const { target, update, remove } of actions) {
    const keys = targetKeys(target);
    const last = keys.at(-1) ?? '';
    let parent: Json | undefined = doc;
    for (const key of keys.slice(0, -1)) parent = isObject(parent) ? parent[key] : undefined;
    const node = isObject(parent) ? parent[last] : undefined;
    if (!isObject(parent) || node === undefined) {
      throw new Error(`Overlay target matches nothing: ${target}`);
    }
    if (remove === true) {
      Reflect.deleteProperty(parent, last);
    } else if (Array.isArray(node) && update !== undefined) {
      node.push(update);
    } else if (isObject(node) && isObject(update)) {
      merge(node, update, target);
    } else {
      throw new Error(`Overlay action does nothing: ${target}`);
    }
  }
}

const FLATTENABLE_KEYS = new Set(['type', 'description', 'required', 'properties']);

function flattened(schemas: JsonObject, schema: JsonObject, name: string): JsonObject {
  const { allOf, ...own } = schema;
  const parts = Array.isArray(allOf) ? allOf : [];
  const properties: JsonObject = {};
  const required: Json[] = [];
  const result: JsonObject = {};
  for (const part of [...parts, own]) {
    const resolved =
      isObject(part) && typeof part.$ref === 'string'
        ? schemas[part.$ref.split('/').at(-1) ?? '']
        : part;
    if (!isObject(resolved)) throw new Error(`Cannot flatten ${name}: unresolved allOf part`);
    const source = resolved.allOf === undefined ? resolved : flattened(schemas, resolved, name);
    const unknown = Object.keys(source).filter((key) => !FLATTENABLE_KEYS.has(key));
    if (unknown.length > 0) throw new Error(`Cannot flatten ${name}: ${unknown.join(', ')}`);
    Object.assign(properties, source.properties);
    if (Array.isArray(source.required)) required.push(...source.required);
    if (source.type !== undefined) result.type = source.type;
  }
  if (typeof schema.description === 'string') result.description = schema.description;
  if (required.length > 0) result.required = [...new Set(required)];
  result.properties = properties;
  return result;
}

/**
 * Rewrites each `allOf` under components/schemas as one object, so closing it is simple, and drops
 * the parts nothing else refers to.
 */
export function flattenAllOf(doc: JsonObject): void {
  const schemas = (doc.components as JsonObject).schemas as JsonObject;
  const originals = structuredClone(schemas);
  for (const [name, schema] of Object.entries(originals)) {
    if (isObject(schema) && schema.allOf !== undefined) {
      schemas[name] = flattened(originals, schema, name);
    }
  }
  const refs = new Set(
    [...walk(doc)].flatMap(([, node]) => (typeof node.$ref === 'string' ? [node.$ref] : [])),
  );
  for (const schema of Object.values(originals)) {
    if (!isObject(schema) || !Array.isArray(schema.allOf)) continue;
    for (const part of schema.allOf) {
      if (isObject(part) && typeof part.$ref === 'string' && !refs.has(part.$ref)) {
        Reflect.deleteProperty(schemas, part.$ref.split('/').at(-1) ?? '');
      }
    }
  }
}

/** Makes every object under components/schemas reject unknown fields, unless it says otherwise. */
export function closeSchemas(doc: JsonObject): void {
  const schemas = (doc.components as JsonObject).schemas as JsonObject;
  for (const schema of Object.values(schemas)) {
    if (isObject(schema) && schema.properties !== undefined) {
      schema.additionalProperties ??= false;
    }
  }
}

export function buildSpec(upstream: JsonObject, overlays: OverlayAction[][]): JsonObject {
  const doc = structuredClone(upstream);
  for (const actions of overlays) applyOverlay(doc, actions);
  flattenAllOf(doc);
  closeSchemas(doc);
  return doc;
}

/** Builds the spec from the files in upstream/ and overlays/. */
export function buildFromFiles(): JsonObject {
  const overlays = OVERLAY_URLS.map(
    (url) => (parse(readFileSync(url, 'utf8')) as { actions: OverlayAction[] }).actions,
  );
  return buildSpec(loadSpec(UPSTREAM_FILE_URL), overlays);
}
