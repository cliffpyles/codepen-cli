/**
 * Generates TypeScript types from the spec into generated/codepen-api-v2.ts, formatted with the
 * repo's Prettier settings. With --check, writes nothing and fails if the committed file is stale.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import { format, resolveConfig } from 'prettier';
import { SPEC_URL } from '../lib/spec.js';

export const GENERATED_URL = new URL('../generated/codepen-api-v2.ts', import.meta.url);

export async function render(): Promise<string> {
  const source = COMMENT_HEADER + astToString(await openapiTS(SPEC_URL));
  const filepath = fileURLToPath(GENERATED_URL);
  return format(source, { ...(await resolveConfig(filepath)), filepath });
}

function readCommitted(): string | undefined {
  try {
    return readFileSync(GENERATED_URL, 'utf8');
  } catch {
    return undefined;
  }
}

const output = await render();
if (process.argv.includes('--check')) {
  if (readCommitted() !== output) {
    console.error(
      'generated/codepen-api-v2.ts is out of date with the spec. Run: npm run generate',
    );
    process.exit(1);
  }
  console.log('generated/codepen-api-v2.ts matches the spec.');
} else {
  writeFileSync(GENERATED_URL, output);
  console.log('Wrote generated/codepen-api-v2.ts');
}
