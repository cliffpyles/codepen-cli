/**
 * Pulls CodePen's official spec into upstream/, byte for byte, when what it says has changed. With
 * --check, writes nothing and fails if the published spec differs from the saved copy.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchUpstream, sameSpec, UPSTREAM_FILE_URL, UPSTREAM_SPEC_URL } from '../lib/upstream.js';

function readSaved(): string | undefined {
  try {
    return readFileSync(UPSTREAM_FILE_URL, 'utf8');
  } catch {
    return undefined;
  }
}

const published = await fetchUpstream();
const saved = readSaved();

if (saved !== undefined && sameSpec(saved, published)) {
  console.log(`upstream/ matches ${UPSTREAM_SPEC_URL}.`);
} else if (process.argv.includes('--check')) {
  console.error(`${UPSTREAM_SPEC_URL} has changed. Run: npm run spec:pull`);
  process.exitCode = 1;
} else {
  const path = fileURLToPath(UPSTREAM_FILE_URL);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, published);
  console.log(`Saved ${UPSTREAM_SPEC_URL} to upstream/. Now run: npm --prefix specs run generate`);
}
