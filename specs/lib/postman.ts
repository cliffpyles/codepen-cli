/** Converts the spec into a Postman collection with Postman's own converter, the one its app runs on import. */

import { convert } from 'openapi-to-postmanv2';
import { isObject, walk } from './spec.js';
import type { JsonObject } from './spec.js';

/**
 * A copy of the spec in which each request body offers only its first-listed media type.
 * A Postman request has one body, and the converter picks multipart whenever it is offered,
 * ignoring its own `first-listed` preference; this gives it one choice, the spec's first.
 */
export function firstListedBodies(doc: JsonObject): JsonObject {
  const copy = structuredClone(doc);
  for (const [pointer, node] of walk(copy)) {
    const isRequestBody =
      pointer.endsWith('/requestBody') || /\/components\/requestBodies\/[^/]+$/.test(pointer);
    if (!isRequestBody || !isObject(node.content)) continue;
    const [first] = Object.keys(node.content);
    if (first !== undefined) node.content = { [first]: node.content[first] ?? null };
  }
  return copy;
}

export async function buildCollection(doc: JsonObject): Promise<JsonObject> {
  const spec = firstListedBodies(doc);
  return new Promise((resolve, reject) => {
    convert(
      { type: 'json', data: spec },
      {
        folderStrategy: 'Tags',
        // Fill requests and saved responses from the spec's examples, not `<string>` placeholders.
        requestParametersResolution: 'Example',
        exampleParametersResolution: 'Example',
        // Optional query parameters stay listed but unticked, so a request sends no example filters.
        enableOptionalParameters: false,
      },
      (error, result) => {
        if (error) return reject(error);
        const data = result?.output?.[0]?.data as JsonObject | undefined;
        if (!result?.result || !isObject(data)) {
          return reject(new Error(result?.reason ?? 'conversion failed'));
        }
        resolve(data);
      },
    );
  });
}
