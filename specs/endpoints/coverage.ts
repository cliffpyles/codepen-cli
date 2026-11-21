/** Pure helpers for endpoint coverage: match recorded requests to the spec's operations. */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operationName } from '../lib/spec.js';
import type { Operation } from '../lib/spec.js';

/** Where the recording setup writes one JSON line per request the endpoint tests make. */
export const CALLS_FILE = join(tmpdir(), 'codepen-api-v2-spec-endpoint-calls.jsonl');

/**
 * Operations the official spec has and the CLI's client does not call yet. Endpoint coverage fails
 * if one of these starts being exercised, so the list stays exact; add an entry when upstream gains
 * an operation before the client does, and remove it when the client catches up.
 */
export const NOT_IN_CLIENT: string[] = ['GET /v2/pens/{id}/download/{path}'];

export interface RecordedCall {
  method: string;
  url: string;
}

function templatePattern(op: Operation): RegExp {
  const pattern = op.path
    .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
    .replace(/\\?\{([^}]+)\\?\}/g, (_, name: string) => {
      const param = op.parameters.find((p) => p.in === 'path' && p.name === name);
      return param?.['x-codepen-multi-segment'] === true ? '.+' : '[^/]+';
    });
  return new RegExp(`^${pattern}$`);
}

/**
 * The operation a request is for, matched by method and by path template against the URL's path.
 * Undefined when no operation matches.
 */
export function matchOperation(ops: Operation[], call: RecordedCall): Operation | undefined {
  const path = new URL(call.url).pathname;
  const method = call.method.toLowerCase();
  return ops.find((op) => op.method === method && templatePattern(op).test(path));
}

export interface EndpointCoverage {
  /** Operations no recorded request exercised, as `METHOD /path`. */
  uncovered: string[];
  /** Recorded requests that match no operation in the spec, as `METHOD url`. */
  unknown: string[];
  covered: number;
}

export function endpointCoverage(ops: Operation[], calls: RecordedCall[]): EndpointCoverage {
  const hit = new Set<Operation>();
  const unknown = new Set<string>();
  for (const call of calls) {
    const op = matchOperation(ops, call);
    if (op) hit.add(op);
    else unknown.add(`${call.method.toUpperCase()} ${call.url}`);
  }
  return {
    uncovered: ops.filter((op) => !hit.has(op)).map(operationName),
    unknown: [...unknown],
    covered: hit.size,
  };
}
