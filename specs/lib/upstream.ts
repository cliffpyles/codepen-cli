/** CodePen's official OpenAPI description: where it is published and how a pulled copy is judged. */

import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { isObject } from './spec.js';
import type { Json, JsonObject } from './spec.js';

/** Linked from https://api.codepen.io/docs. */
export const UPSTREAM_SPEC_URL = 'https://api.codepen.io/openapi.yaml';
export const UPSTREAM_FILE_URL = new URL('../upstream/codepen-api-v2.yaml', import.meta.url);

const PULL_TIMEOUT_MS = 10_000;

/** Parses a published description, refusing anything that is not recognisably an OpenAPI 3.1 document. */
export function parseUpstream(text: string): JsonObject {
  const doc = parse(text) as Json;
  if (!isObject(doc)) throw new Error('the official spec is not a YAML mapping');
  if (typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.1.')) {
    throw new Error(`expected OpenAPI 3.1, got ${String(doc.openapi)}`);
  }
  if (!isObject(doc.paths) || Object.keys(doc.paths).length === 0) {
    throw new Error('the official spec has no paths');
  }
  return doc;
}

/** Whether two descriptions say the same thing. Key order and formatting do not count. */
export function sameSpec(a: string, b: string): boolean {
  return isDeepStrictEqual(parseUpstream(a), parseUpstream(b));
}

export async function fetchUpstream(fetchFn: typeof fetch = fetch): Promise<string> {
  const response = await fetchFn(UPSTREAM_SPEC_URL, {
    signal: AbortSignal.timeout(PULL_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${UPSTREAM_SPEC_URL} answered ${response.status}`);
  const text = await response.text();
  parseUpstream(text);
  return text;
}
