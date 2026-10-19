import { CodePenClient } from '../lib/client.js';
import { resolveConfig, type Config } from '../lib/config.js';
import type { OutputFormat } from '../lib/output.js';
import { confirm, isInteractive, promptSecret, readAll } from '../lib/tty.js';
import { ConfigError } from '../lib/errors.js';

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
  /** Ask a yes/no question. */
  confirm?: (message: string) => Promise<boolean>;
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
  confirm: (message: string) => Promise<boolean>;
  /**
   * Guard a destructive action. Passes with --yes; otherwise prompts when interactive
   * and refuses when not.
   */
  confirmOrAbort: (message: string, yes: boolean | undefined) => Promise<void>;
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
    confirm: io.confirm ?? ((message) => confirm(message)),
    confirmOrAbort,
  };

  async function confirmOrAbort(message: string, yes: boolean | undefined): Promise<void> {
    if (yes) return;
    const ask = io.confirm ?? ((m: string) => confirm(m));
    const interactive = io.isInteractive ?? (() => isInteractive());
    if (!interactive()) {
      throw new ConfigError(`${message} Refusing without --yes in a non-interactive session.`);
    }
    if (!(await ask(message))) throw new ConfigError('Aborted.');
  }
}
