import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { CALLS_FILE } from './endpoints/coverage.js';

// Runs the CLI's own client tests with requests recorded, for endpoints/report.ts.
rmSync(CALLS_FILE, { force: true });

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['src/lib/client.test.ts', 'src/lib/client.endpoints.test.ts'],
    setupFiles: ['specs/endpoints/record.ts'],
    environment: 'node',
  },
});
