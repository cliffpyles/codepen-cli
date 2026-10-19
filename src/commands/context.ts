import { CodePenClient } from '../lib/client.js';
import { resolveConfig, type Config } from '../lib/config.js';
import type { OutputFormat } from '../lib/output.js';
import { isInteractive, promptSecret, readAll } from '../lib/tty.js';

export interface GlobalOptions {
  apiKey?: string;
  apiUrl?: string;
  json?: boolean;
}

/** Side-effecting dependencies, injected so tests can swap IO, HTTP and prompts. */
export interface ContextIO {
  out: (s: string) => void;
  err: (s: string) => void;
  fetch?: typeof globalThis.fetch;
  env?: NodeJS.ProcessEnv;
  /** Read a secret interactively without echoing it. */
  promptSecret?: (message: string) => Promise<string>;
  /** Read all of stdin, for `--with-token` style piping. */
  readStdin?: () => Promise<string>;
  isInteractive?: () => boolean;
}

/** Everything a command needs. */
export interface CommandContext {
  env: NodeJS.ProcessEnv;
  config: () => Config;
  client: (config?: Config) => CodePenClient;
  format: () => OutputFormat;
  out: (line: string) => void;
  err: (line: string) => void;
  promptSecret: (message: string) => Promise<string>;
  readStdin: () => Promise<string>;
  isInteractive: () => boolean;
}

export function createContext(getOptions: () => GlobalOptions, io: ContextIO): CommandContext {
  const env = io.env ?? process.env;
  const config = () => {
    const opts = getOptions();
    return resolveConfig({ apiKey: opts.apiKey, baseUrl: opts.apiUrl }, env);
  };
  return {
    env,
    config,
    client: (resolved = config()) =>
      new CodePenClient({ ...resolved, ...(io.fetch ? { fetch: io.fetch } : {}) }),
    format: () => (getOptions().json ? 'json' : 'table'),
    out: io.out,
    err: io.err,
    promptSecret: io.promptSecret ?? ((message) => promptSecret(message)),
    readStdin: io.readStdin ?? (() => readAll()),
    isInteractive: io.isInteractive ?? (() => isInteractive()),
  };
}
