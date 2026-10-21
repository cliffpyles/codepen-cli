/**
 * Contract tests: reads your own Pens, Collections and Assets from the live API and checks every
 * response against the spec. Read-only; any request but GET is refused before it is sent.
 * Uses the same key as the CLI: $CODEPEN_API_KEY (or ../.env), then the `codepen auth login` file.
 */

import { CodePenClient, resolveConfig } from '../../src/index.js';
import { createValidator, isObject, loadSpec } from '../lib/spec.js';
import type { Json, JsonObject } from '../lib/spec.js';
import { expandPath, expectedResponse, findOperation, responseProblems } from './contract.js';

const doc = loadSpec();
const validate = createValidator(doc);

const readOnlyFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET')
    return Promise.reject(new Error(`contract tests are read-only; refused ${method}`));
  return fetch(input, init);
};
const client = new CodePenClient({ ...resolveConfig(), fetch: readOnlyFetch });

const failures: string[] = [];
const skipped: string[] = [];
let passed = 0;

/** Calls one operation, checks the response against the spec, and returns the body for discovery. */
async function check(
  operationId: string,
  label: string,
  params: Record<string, string> = {},
  query: Record<string, number> = {},
): Promise<Json | undefined> {
  const name = `${operationId} (${label})`;
  const op = findOperation(doc, operationId);
  try {
    const { data, response } = await client.request<Json>('GET', expandPath(op, params), { query });
    const live = { status: response.status, headers: response.headers, body: data };
    const problems = responseProblems(expectedResponse(doc, op, 200), 200, live, validate);
    if (problems.length === 0) {
      passed += 1;
      console.log(`✓ ${name}`);
    } else {
      failures.push(name);
      console.log(`✗ ${name}\n${problems.map((p) => `    ${p}`).join('\n')}`);
    }
    return data;
  } catch (error) {
    failures.push(name);
    console.log(`✗ ${name}\n    ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function skip(name: string, reason: string): void {
  skipped.push(name);
  console.log(`– ${name}: skipped, ${reason}`);
}

function objects(value: Json | undefined): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function text(value: Json | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function buildStatus(version: JsonObject): Json | undefined {
  return isObject(version.build) ? version.build.status : undefined;
}

// Pens: one 2.0 Pen and one Classic Pen, found in your first 100.
const pens = objects(await check('listPens', 'up to 100 Pens', {}, { per_page: 100 }));
const v2Pens = pens.filter((p) => p.editor === 'V2');
const v2 = v2Pens[0];
const classic = pens.find((p) => p.editor === 'Classic');

if (v2) {
  const id = String(v2.id);
  await check('getPen', '2.0 Pen', { id });
  const files = objects(await check('listPenFiles', '2.0 Pen', { id }));
  const file = files.find((f) => !f.is_binary && String(f.path).split('/').length > 2) ?? files[0];
  if (file)
    await check('getPenFile', `2.0 Pen, ${String(file.path)}`, { id, path: String(file.path) });
  else skip('getPenFile', 'the 2.0 Pen has no files');

  const versions = objects(await check('listPenVersions', '2.0 Pen', { id }, { per_page: 100 }));
  const head = isObject(v2.saved_version) ? text(v2.saved_version.id) : undefined;
  if (head) await check('getVersion', 'saved head', { id: head });
  else skip('getVersion', 'the 2.0 Pen has no saved version');

  const succeeded = versions.find((v) => buildStatus(v) === 'Success');
  if (succeeded) await check('getBuild', 'succeeded', { id: String(succeeded.id) });
  else skip('getBuild (succeeded)', 'no succeeded build in the 2.0 Pen');

  // A failed build is rarer; look through up to three more 2.0 Pens for one.
  let failed = versions.find((v) => buildStatus(v) === 'Failed');
  for (const pen of v2Pens.slice(1, 4)) {
    if (failed) break;
    const more = objects(
      await check(
        'listPenVersions',
        'searching for a failed build',
        { id: String(pen.id) },
        { per_page: 100 },
      ),
    );
    failed = more.find((v) => buildStatus(v) === 'Failed');
  }
  if (failed) await check('getBuild', 'failed', { id: String(failed.id) });
  else skip('getBuild (failed)', 'no failed build in the first four 2.0 Pens');

  await check('listPenCollaborators', '2.0 Pen', { id });
  await check('listPenInvites', '2.0 Pen', { id });
} else {
  skip('2.0 Pen operations', 'no 2.0 Pen in your first 100');
}

if (classic) {
  const id = String(classic.id);
  await check('getPen', 'Classic Pen', { id });
  await check('listPenFiles', 'Classic Pen', { id });
} else {
  skip('Classic Pen operations', 'no Classic Pen in your first 100');
}

// Collections
const collection = objects(await check('listCollections', 'first page'))[0];
if (collection) {
  const id = String(collection.id);
  await check('getCollection', 'first Collection', { id });
  await check('listCollectionPens', 'first Collection', { id });
} else {
  skip('Collection operations', 'you have no Collections');
}

// Assets: prefer a text Asset, whose content is returned.
const assets = objects(await check('listAssets', 'first page'));
const asset = assets.find((a) => a.is_binary === false) ?? assets[0];
if (asset)
  await check('getAsset', asset.is_binary === false ? 'text Asset' : 'binary Asset', {
    id: String(asset.id),
  });
else skip('getAsset', 'you have no Assets');

console.log(`\n${passed} passed, ${failures.length} failed, ${skipped.length} skipped`);
if (failures.length > 0 || passed === 0) process.exitCode = 1;
