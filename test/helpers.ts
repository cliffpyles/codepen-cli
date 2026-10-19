import { vi } from 'vitest';
import type { ProgramIO } from '../src/program.js';
import type { Build } from '../src/types.js';

export interface FakeResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Build a Response like the real API would return. */
export function jsonResponse({ status = 200, body, headers = {} }: FakeResponseInit): Response {
  const hasBody = status !== 204 && body !== undefined;
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...headers },
  });
}

/** A fetch mock that answers from a queue of responses and records calls. */
export function fakeFetch(...responses: Response[]) {
  const queue = [...responses];
  const fn = vi.fn((..._args: Parameters<typeof globalThis.fetch>): Promise<Response> => {
    const next = queue.shift();
    if (!next) return Promise.reject(new Error('fakeFetch: no response queued'));
    return Promise.resolve(next);
  });
  return fn as unknown as typeof globalThis.fetch & typeof fn;
}

/** The URL and init of the nth recorded fetch call. Throws if that call never happened. */
export function callOf(fetch: ReturnType<typeof fakeFetch>, index = 0) {
  const call = fetch.mock.calls[index];
  if (!call) throw new Error(`fakeFetch: call ${index} was not made`);
  const [url, init] = call;
  const urlString = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  return { url: urlString, init, headers: (init?.headers ?? {}) as Record<string, string> };
}

export const TEST_KEY = 'cp_user_test_key_123';
export const TEST_URL = 'https://api.example.test';

export function pen(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc123',
    title: 'Hello Pen',
    access: 'Public',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

export interface CliHarness {
  out: string[];
  err: string[];
  stdout: () => string;
  stderr: () => string;
  io: ProgramIO;
}

/**
 * Isolated CLI harness: no real env, config file, network, or prompts.
 * `configFile` should live in a mkdtemp directory owned by the test.
 */
export function cliHarness(
  configFile: string,
  overrides: Partial<ProgramIO> = {},
  env: NodeJS.ProcessEnv = {},
): CliHarness {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: () => out.join('\n'),
    stderr: () => err.join('\n'),
    io: {
      out: (s) => void out.push(s),
      err: (s) => void err.push(s),
      env: {
        CODEPEN_CONFIG_PATH: configFile,
        CODEPEN_API_URL: TEST_URL,
        CODEPEN_API_KEY: TEST_KEY,
        ...env,
      },
      isInteractive: () => false,
      promptSecret: () => Promise.reject(new Error('promptSecret not expected')),
      readStdin: () => Promise.reject(new Error('readStdin not expected')),
      confirm: () => Promise.reject(new Error('confirm not expected')),
      ...overrides,
    },
  };
}

export function build(overrides: Partial<Build> = {}) {
  return { id: 'v1', status: 'Success' as const, ...overrides };
}
