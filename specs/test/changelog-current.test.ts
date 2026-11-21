import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fingerprint, newestFingerprint } from '../lib/changelog.js';
import { CHANGELOG_URL, UPSTREAM_FILES } from '../lib/upstream.js';

// A release gate: the saved copies of the official spec must not change without a changelog entry
// that says how. Only `npm run spec:pull` writes both, so run it rather than editing either.
describe('upstream/CHANGELOG.md', () => {
  it('has a newest entry that describes the saved copies of the official spec', () => {
    const saved = fingerprint(UPSTREAM_FILES.map((f) => readFileSync(f.file, 'utf8')));
    const recorded = newestFingerprint(readFileSync(CHANGELOG_URL, 'utf8'));
    expect(
      recorded,
      'upstream/ changed without a changelog entry. Run npm run spec:pull, or restore upstream/ with git.',
    ).toBe(saved);
  });
});
