import { CodePenClient } from '../lib/client.js';
import { resolveConfig } from '../lib/config.js';
import type { OutputFormat } from '../lib/output.js';

export interface GlobalOptions {
  apiKey?: string;
  apiUrl?: string;
  json?: boolean;
}

/** Everything a command needs, injected so tests can swap IO and HTTP. */
export interface CommandContext {
  client: () => CodePenClient;
  format: () => OutputFormat;
  out: (line: string) => void;
  err: (line: string) => void;
}

export function createContext(
  getOptions: () => GlobalOptions,
  io: { out: (s: string) => void; err: (s: string) => void; fetch?: typeof globalThis.fetch },
): CommandContext {
  return {
    client: () => {
      const opts = getOptions();
      const config = resolveConfig({ apiKey: opts.apiKey, baseUrl: opts.apiUrl });
      return new CodePenClient({ ...config, ...(io.fetch ? { fetch: io.fetch } : {}) });
    },
    format: () => (getOptions().json ? 'json' : 'table'),
    out: io.out,
    err: io.err,
  };
}
