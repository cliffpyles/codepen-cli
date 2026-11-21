/**
 * Describes how one copy of the official spec differs from the next, for upstream/CHANGELOG.md.
 * Operations, schemas and their fields get their own lines; any other difference is listed by
 * where it is, so nothing that changed goes unmentioned.
 */

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isObject, operationName, operations } from './spec.js';
import type { Json, JsonObject, Operation } from './spec.js';

export const CHANGELOG_HEADER = `# Changes to CodePen's official spec

Written by \`npm run spec:pull\` each time it saves a new copy of
https://api.codepen.io/openapi.yaml and openapi.json. CodePen publishes no changelog of its own, so
this compares the copies we pulled: changes made between two pulls show up as one entry.
`;

const OTHER_LIMIT = 25;

/** A readable location, such as `paths["/v2/pens"].get.summary`. */
export function describePath(keys: string[]): string {
  return keys.map((k, i) => (/^[\w-]+$/.test(k) ? `${i ? '.' : ''}${k}` : `["${k}"]`)).join('');
}

interface Difference {
  keys: string[];
  kind: 'added' | 'removed' | 'changed';
}

/** Every place two documents differ. Arrays count as single values. */
function differences(a: Json | undefined, b: Json | undefined, keys: string[] = []): Difference[] {
  if (isDeepStrictEqual(a, b)) return [];
  if (!isObject(a) || !isObject(b)) {
    if (a === undefined) return [{ keys, kind: 'added' }];
    if (b === undefined) return [{ keys, kind: 'removed' }];
    return [{ keys, kind: 'changed' }];
  }
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
    differences(a[k], b[k], [...keys, k]),
  );
}

const code = (s: string) => `\`${s}\``;
const list = (values: Json[]) => values.map((v) => code(String(v))).join(', ');

function setDiff(a: Json[], b: Json[]): { added: Json[]; removed: Json[] } {
  return { added: b.filter((v) => !a.includes(v)), removed: a.filter((v) => !b.includes(v)) };
}

function strings(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function objectAt(doc: JsonObject, ...keys: string[]): JsonObject {
  let node: Json | undefined = doc;
  for (const key of keys) node = isObject(node) ? node[key] : undefined;
  return isObject(node) ? node : {};
}

function hasPath(doc: JsonObject, path: string): boolean {
  return isObject(doc.paths) && doc.paths[path] !== undefined;
}

function parameterNames(op: Operation): Json[] {
  return op.parameters.map((p) => `${String(p.in)} ${String(p.name)}`);
}

/** The lines of one changelog entry; empty when the two documents say the same thing. */
export function describeChanges(before: JsonObject, after: JsonObject): string[] {
  const lines: string[] = [];
  const explained: string[][] = [];

  const opsBefore = new Map(operations(before).map((op) => [operationName(op), op]));
  const opsAfter = new Map(operations(after).map((op) => [operationName(op), op]));
  for (const [name, op] of opsAfter) {
    if (!opsBefore.has(name)) {
      lines.push(`- Added operation ${code(name)}: ${String(op.operation.summary ?? '')}`.trim());
      // A new path is explained by its operations.
      explained.push(hasPath(before, op.path) ? ['paths', op.path, op.method] : ['paths', op.path]);
    }
  }
  for (const [name, op] of opsBefore) {
    if (!opsAfter.has(name)) {
      lines.push(`- Removed operation ${code(name)}`);
      explained.push(hasPath(after, op.path) ? ['paths', op.path, op.method] : ['paths', op.path]);
    }
  }
  for (const [name, a] of opsBefore) {
    const b = opsAfter.get(name);
    if (!b) continue;
    const params = setDiff(parameterNames(a), parameterNames(b));
    if (params.added.length) lines.push(`- ${code(name)}: added parameters ${list(params.added)}`);
    if (params.removed.length) {
      lines.push(`- ${code(name)}: removed parameters ${list(params.removed)}`);
    }
    if (params.added.length || params.removed.length) {
      explained.push(['paths', a.path, 'parameters'], ['paths', a.path, a.method, 'parameters']);
    }
    const statuses = setDiff(
      Object.keys(objectAt(a.operation, 'responses')),
      Object.keys(objectAt(b.operation, 'responses')),
    );
    if (statuses.added.length)
      lines.push(`- ${code(name)}: added responses ${list(statuses.added)}`);
    if (statuses.removed.length) {
      lines.push(`- ${code(name)}: removed responses ${list(statuses.removed)}`);
    }
    for (const status of [...statuses.added, ...statuses.removed]) {
      explained.push(['paths', a.path, a.method, 'responses', String(status)]);
    }
  }

  const schemasBefore = objectAt(before, 'components', 'schemas');
  const schemasAfter = objectAt(after, 'components', 'schemas');
  const schemaNames = setDiff(Object.keys(schemasBefore), Object.keys(schemasAfter));
  if (schemaNames.added.length) lines.push(`- Added schemas ${list(schemaNames.added)}`);
  if (schemaNames.removed.length) lines.push(`- Removed schemas ${list(schemaNames.removed)}`);
  for (const name of [...schemaNames.added, ...schemaNames.removed]) {
    explained.push(['components', 'schemas', String(name)]);
  }
  for (const [name, a] of Object.entries(schemasBefore)) {
    const b = schemasAfter[name];
    if (!isObject(a) || !isObject(b)) continue;
    const where = ['components', 'schemas', name];
    const props = setDiff(
      Object.keys(objectAt(a, 'properties')),
      Object.keys(objectAt(b, 'properties')),
    );
    if (props.added.length) lines.push(`- ${code(name)}: added fields ${list(props.added)}`);
    if (props.removed.length) lines.push(`- ${code(name)}: removed fields ${list(props.removed)}`);
    for (const p of [...props.added, ...props.removed]) {
      explained.push([...where, 'properties', String(p)]);
    }
    const required = setDiff(strings(a.required), strings(b.required));
    if (required.added.length) lines.push(`- ${code(name)}: now requires ${list(required.added)}`);
    if (required.removed.length) {
      lines.push(`- ${code(name)}: no longer requires ${list(required.removed)}`);
    }
    if (required.added.length || required.removed.length) explained.push([...where, 'required']);
    const targets: [string, JsonObject][] = [
      [name, a],
      ...Object.entries(objectAt(a, 'properties')).map(
        ([p, v]) => [`${name}.${p}`, isObject(v) ? v : {}] as [string, JsonObject],
      ),
    ];
    for (const [label, schemaA] of targets) {
      const schemaB = label === name ? b : objectAt(b, 'properties', label.split('.')[1] ?? '');
      const enums = setDiff(strings(schemaA.enum), strings(schemaB.enum));
      if (enums.added.length) lines.push(`- ${code(label)}: added values ${list(enums.added)}`);
      if (enums.removed.length) {
        lines.push(`- ${code(label)}: removed values ${list(enums.removed)}`);
      }
      if (enums.added.length || enums.removed.length) {
        const sub = label === name ? [] : ['properties', label.split('.')[1] ?? ''];
        explained.push([...where, ...sub, 'enum']);
      }
    }
  }

  const covered = (keys: string[]) =>
    explained.some((prefix) => prefix.every((k, i) => keys[i] === k));
  const other = differences(before, after).filter((d) => !covered(d.keys));
  for (const d of other.slice(0, OTHER_LIMIT)) {
    lines.push(`- ${d.kind[0]?.toUpperCase()}${d.kind.slice(1)} ${code(describePath(d.keys))}`);
  }
  if (other.length > OTHER_LIMIT) lines.push(`- …and ${other.length - OTHER_LIMIT} more`);
  return lines;
}

/**
 * Identifies the saved copies an entry describes: the SHA-256 of each file's bytes, in the order
 * given. Written into each entry, so a check can tell whether the newest one is current.
 */
export function fingerprint(files: string[]): string {
  return files.map((text) => createHash('sha256').update(text).digest('hex')).join(' ');
}

const FINGERPRINT = /^<!-- copies: ([0-9a-f ]+) -->$/m;

/** The fingerprint recorded in the newest entry, if it has one. */
export function newestFingerprint(changelog: string): string | undefined {
  const newest = changelog.split(/^## /m)[1] ?? '';
  return FINGERPRINT.exec(newest)?.[1];
}

/** The changelog with a new entry first, under the header. */
export function addEntry(
  changelog: string | undefined,
  date: string,
  lines: string[],
  copies?: string,
): string {
  const mark = copies === undefined ? '' : `<!-- copies: ${copies} -->\n\n`;
  const entry = `## ${date}\n\n${mark}${lines.join('\n')}\n`;
  const body = (changelog ?? CHANGELOG_HEADER).replace(CHANGELOG_HEADER, '').trimStart();
  return `${CHANGELOG_HEADER}\n${entry}${body ? `\n${body}` : ''}`;
}
