/**
 * Builds the spec from upstream/ and overlays/ into codepen-api-v2.yaml, and its TypeScript types into
 * generated/codepen-api-v2.ts, both formatted with the repo's Prettier settings. With --check, writes
 * nothing and fails if a committed file is stale.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import type { OpenAPI3 } from 'openapi-typescript';
import { format, resolveConfig } from 'prettier';
import { stringify } from 'yaml';
import { buildFromFiles } from '../lib/merge.js';
import { SPEC_URL } from '../lib/spec.js';

const GENERATED_URL = new URL('../generated/codepen-api-v2.ts', import.meta.url);
const SPEC_HEADER = `# Generated from upstream/ and overlays/ by scripts/generate.ts. Do not edit; see CONTRIBUTING.md.\n`;

async function formatted(url: URL, source: string): Promise<string> {
  const filepath = fileURLToPath(url);
  return format(source, { ...(await resolveConfig(filepath)), filepath });
}

const doc = buildFromFiles();
const outputs: [URL, string][] = [
  [
    SPEC_URL,
    await formatted(SPEC_URL, SPEC_HEADER + stringify(doc, { aliasDuplicateObjects: false })),
  ],
  [
    GENERATED_URL,
    await formatted(
      GENERATED_URL,
      COMMENT_HEADER + astToString(await openapiTS(doc as unknown as OpenAPI3)),
    ),
  ],
];

function readCommitted(url: URL): string | undefined {
  try {
    return readFileSync(url, 'utf8');
  } catch {
    return undefined;
  }
}

for (const [url, output] of outputs) {
  const name = fileURLToPath(url).split('/specs/').at(-1);
  if (!process.argv.includes('--check')) {
    writeFileSync(url, output);
    console.log(`Wrote ${name}`);
  } else if (readCommitted(url) === output) {
    console.log(`${name} is up to date.`);
  } else {
    console.error(`${name} is out of date. Run: npm run generate`);
    process.exitCode = 1;
  }
}
