/**
 * Vitest setup for endpoint coverage. Wraps the CLI's test helper `fakeFetch` so every request the
 * client tests make is appended to CALLS_FILE. The tests themselves are unchanged.
 */

import { appendFileSync } from 'node:fs';
import { afterEach, vi } from 'vitest';
import { CALLS_FILE } from './coverage.js';
import type * as Helpers from '../../test/helpers.js';

type FakeFetch = ReturnType<typeof Helpers.fakeFetch>;
const fetches: FakeFetch[] = [];

vi.mock('../../test/helpers.js', async (importOriginal) => {
  const helpers = await importOriginal<typeof Helpers>();
  return {
    ...helpers,
    fakeFetch: (...responses: Response[]) => {
      const fetch = helpers.fakeFetch(...responses);
      fetches.push(fetch);
      return fetch;
    },
  };
});

afterEach(() => {
  for (const fetch of fetches.splice(0)) {
    for (const [input, init] of fetch.mock.calls) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      appendFileSync(CALLS_FILE, `${JSON.stringify({ method: init?.method ?? 'GET', url })}\n`);
    }
  }
});
