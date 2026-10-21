/** Pure helpers for the contract tests: look an operation up in the spec and check one live response against it. */

import { operations, resolvePointer, isObject } from '../lib/spec.js';
import type { Json, JsonObject, Operation } from '../lib/spec.js';

export function findOperation(doc: JsonObject, operationId: string): Operation {
  const op = operations(doc).find((o) => o.operation.operationId === operationId);
  if (!op) throw new Error(`No operation ${operationId} in the spec`);
  return op;
}

/**
 * Fills the operation's path template. Values are percent-encoded, except a parameter marked
 * `x-codepen-multi-segment`, whose slashes are kept.
 */
export function expandPath(op: Operation, params: Record<string, string>): string {
  return op.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`${op.path} needs a value for {${name}}`);
    const param = op.parameters.find((p) => p.in === 'path' && p.name === name);
    return param?.['x-codepen-multi-segment'] === true
      ? value.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
      : encodeURIComponent(value);
  });
}

export interface ExpectedResponse {
  schema: Json;
  requiredHeaders: string[];
}

/** The JSON schema and required headers the spec gives for one status of an operation. */
export function expectedResponse(doc: JsonObject, op: Operation, status: number): ExpectedResponse {
  const responses = isObject(op.operation.responses) ? op.operation.responses : {};
  let response = responses[String(status)];
  if (isObject(response) && typeof response.$ref === 'string') {
    response = resolvePointer(doc, response.$ref);
  }
  if (!isObject(response))
    throw new Error(`The spec has no ${status} response for ${String(op.operation.operationId)}`);
  const media = isObject(response.content) ? response.content['application/json'] : undefined;
  if (!isObject(media))
    throw new Error(
      `The ${status} response of ${String(op.operation.operationId)} has no JSON body`,
    );
  const headers = isObject(response.headers) ? response.headers : {};
  const requiredHeaders = Object.entries(headers)
    .filter(([, header]) => {
      const resolved =
        isObject(header) && typeof header.$ref === 'string'
          ? resolvePointer(doc, header.$ref)
          : header;
      return isObject(resolved) && resolved.required === true;
    })
    .map(([name]) => name);
  return { schema: media.schema ?? null, requiredHeaders };
}

export interface LiveResponse {
  status: number;
  headers: Headers;
  body: Json;
}

/** Everything wrong with one live response: its status, required headers and body. */
export function responseProblems(
  expected: ExpectedResponse,
  status: number,
  live: LiveResponse,
  validate: (schema: Json, value: Json) => string[],
): string[] {
  if (live.status !== status) return [`answered ${live.status}, expected ${status}`];
  const missing = expected.requiredHeaders
    .filter((name) => !live.headers.has(name))
    .map((name) => `missing required header ${name}`);
  return [...missing, ...validate(expected.schema, live.body)];
}
