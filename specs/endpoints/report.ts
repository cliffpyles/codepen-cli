/** Reports which spec operations the CLI's client tests exercise, from the requests they recorded. */

import { readFileSync } from 'node:fs';
import { loadSpec, operations } from '../lib/spec.js';
import { CALLS_FILE, endpointCoverage, NOT_IN_CLIENT } from './coverage.js';
import type { RecordedCall } from './coverage.js';

const calls = readFileSync(CALLS_FILE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as RecordedCall);

const ops = operations(loadSpec());
const { covered, uncovered, unknown } = endpointCoverage(ops, calls);

console.log(
  `Endpoint coverage: ${covered} of ${ops.length} operations exercised by the client tests`,
);
const missing = uncovered.filter((name) => !NOT_IN_CLIENT.includes(name));
const stale = NOT_IN_CLIENT.filter((name) => !uncovered.includes(name));
for (const name of missing) console.log(`✗ not exercised: ${name}`);
for (const name of stale) console.log(`✗ exercised, so remove it from NOT_IN_CLIENT: ${name}`);
for (const call of unknown) console.log(`✗ not in the spec: ${call}`);
console.log(`${NOT_IN_CLIENT.length} operations are not in the client yet.`);
if (missing.length > 0 || stale.length > 0 || unknown.length > 0) process.exitCode = 1;
