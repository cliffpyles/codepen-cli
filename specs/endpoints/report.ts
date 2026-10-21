/** Reports which spec operations the CLI's client tests exercise, from the requests they recorded. */

import { readFileSync } from 'node:fs';
import { loadSpec, operations } from '../lib/spec.js';
import { CALLS_FILE, endpointCoverage } from './coverage.js';
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
for (const name of uncovered) console.log(`✗ not exercised: ${name}`);
for (const call of unknown) console.log(`✗ not in the spec: ${call}`);
if (uncovered.length > 0 || unknown.length > 0) process.exitCode = 1;
