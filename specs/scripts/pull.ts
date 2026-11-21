/**
 * Pulls CodePen's official spec, YAML and JSON, into upstream/ byte for byte when what either says
 * has changed, and adds an entry to upstream/CHANGELOG.md. With --check, writes nothing and fails if
 * a published copy differs from the saved one.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, describeChanges, fingerprint } from '../lib/changelog.js';
import {
  CHANGELOG_URL,
  fetchUpstream,
  parseUpstream,
  sameSpec,
  UPSTREAM_FILES,
  UPSTREAM_JSON,
  UPSTREAM_YAML,
} from '../lib/upstream.js';

function readSaved(url: URL): string | undefined {
  try {
    return readFileSync(url, 'utf8');
  } catch {
    return undefined;
  }
}

const published = new Map(
  await Promise.all(UPSTREAM_FILES.map(async (f) => [f, await fetchUpstream(f.url)] as const)),
);
const changed = UPSTREAM_FILES.filter((f) => {
  const saved = readSaved(f.file);
  return saved === undefined || !sameSpec(saved, published.get(f) ?? '');
});

if (changed.length === 0) {
  console.log('upstream/ matches the published YAML and JSON.');
} else if (process.argv.includes('--check')) {
  for (const f of changed) console.error(`${f.url} has changed.`);
  console.error('Run: npm run spec:pull');
  process.exitCode = 1;
} else {
  const yaml = published.get(UPSTREAM_YAML) ?? '';
  const json = published.get(UPSTREAM_JSON) ?? '';
  const savedYaml = readSaved(UPSTREAM_YAML.file);
  const lines =
    savedYaml === undefined
      ? ['- First copy saved.']
      : describeChanges(parseUpstream(savedYaml), parseUpstream(yaml));
  if (lines.length === 0) lines.push('- Only openapi.json changed.');
  if (!sameSpec(yaml, json)) {
    lines.push('- The published YAML and JSON say different things. The build reads the YAML.');
    console.warn('Warning: the published YAML and JSON say different things.');
  }
  for (const f of UPSTREAM_FILES) {
    const path = fileURLToPath(f.file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, published.get(f) ?? '');
  }
  const date = new Date().toISOString().slice(0, 10);
  const copies = fingerprint(UPSTREAM_FILES.map((f) => published.get(f) ?? ''));
  writeFileSync(CHANGELOG_URL, addEntry(readSaved(CHANGELOG_URL), date, lines, copies));
  console.log(`Saved both copies to upstream/ and added ${date} to upstream/CHANGELOG.md:`);
  console.log(lines.join('\n'));
  console.log('Now run: npm --prefix specs run generate');
}
