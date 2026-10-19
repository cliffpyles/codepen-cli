#!/usr/bin/env node
import { run } from './program.js';

const code = await run(process.argv.slice(2), {
  out: (s) => process.stdout.write(s.endsWith('\n') ? s : `${s}\n`),
  err: (s) => process.stderr.write(s.endsWith('\n') ? s : `${s}\n`),
});
process.exitCode = code;
