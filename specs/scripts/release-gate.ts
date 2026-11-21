/**
 * The spec gate as prepublishOnly runs it: `npm run spec:gate`, unless SKIP_SPEC_GATE holds the
 * reason it is being skipped, such as a security fix that cannot wait for the spec. A skip is loud
 * on purpose, so it shows in the publish log.
 */

import { spawnSync } from 'node:child_process';

const reason = process.env.SKIP_SPEC_GATE?.trim();

if (reason) {
  console.warn(`\nWARNING: the spec gate is skipped for this publish. Reason: ${reason}\n`);
} else {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'spec:gate'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(
      '\nThe spec gate failed, so nothing was published. Fix it, or set SKIP_SPEC_GATE to the reason for skipping it.',
    );
  }
  process.exitCode = result.status ?? 1;
}
