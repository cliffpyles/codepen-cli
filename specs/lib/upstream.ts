/** CodePen's official OpenAPI description: where it is published and how a pulled copy is judged. */

import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { isObject } from './spec.js';
import type { Json, JsonObject } from './spec.js';

/** One published form of the spec and where our copy of it is saved. */
export interface UpstreamFile {
  url: string;
  file: URL;
}

/** Both are linked from https://api.codepen.io/docs. The build reads the YAML. */
export const UPSTREAM_YAML: UpstreamFile = {
  url: 'https://api.codepen.io/openapi.yaml',
  file: new URL('../upstream/codepen-api-v2.yaml', import.meta.url),
};
export const UPSTREAM_JSON: UpstreamFile = {
  url: 'https://api.codepen.io/openapi.json',
  file: new URL('../upstream/codepen-api-v2.json', import.meta.url),
};
export const UPSTREAM_FILES = [UPSTREAM_YAML, UPSTREAM_JSON];

export const UPSTREAM_SPEC_URL = UPSTREAM_YAML.url;
export const UPSTREAM_FILE_URL = UPSTREAM_YAML.file;
export const CHANGELOG_URL = new URL('../upstream/CHANGELOG.md', import.meta.url);

const PULL_TIMEOUT_MS = 10_000;

/**
 * Parses a published description, YAML or JSON, refusing anything that is not recognisably an
 * OpenAPI 3.1 document.
 */
export function parseUpstream(text: string): JsonObject {
  const doc = parse(text) as Json;
  if (!isObject(doc)) throw new Error('the official spec is not a YAML or JSON mapping');
  if (typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.1.')) {
    throw new Error(`expected OpenAPI 3.1, got ${String(doc.openapi)}`);
  }
  if (!isObject(doc.paths) || Object.keys(doc.paths).length === 0) {
    throw new Error('the official spec has no paths');
  }
  return doc;
}

/** Whether two descriptions say the same thing. Key order, formatting and format do not count. */
export function sameSpec(a: string, b: string): boolean {
  return isDeepStrictEqual(parseUpstream(a), parseUpstream(b));
}

export async function fetchUpstream(
  url: string = UPSTREAM_SPEC_URL,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(PULL_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const text = await response.text();
  parseUpstream(text);
  return text;
}
