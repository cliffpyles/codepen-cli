import { Command } from 'commander';
import { registerAuth } from './commands/auth.js';
import { registerCollections } from './commands/collections.js';
import { createContext, type ContextIO, type GlobalOptions } from './commands/context.js';
import { registerPens } from './commands/pens.js';
import { exitCodeFor } from './lib/errors.js';

export type ProgramIO = ContextIO;

/** Build the CLI. Separated from `cli.ts` so tests can run it in-process. */
export function createProgram(io: ProgramIO): Command {
  const program = new Command()
    .name('codepen')
    .description('Command-line interface for the CodePen API v2')
    .version('0.1.0', '-v, --version')
    .option('--api-key <key>', 'API key (defaults to $CODEPEN_API_KEY, then the config file)')
    .option('--api-url <url>', 'API base URL (defaults to https://api.codepen.io)')
    .option('--json', 'Print raw JSON instead of a table')
    .configureOutput({ writeOut: io.out, writeErr: io.err })
    .exitOverride();

  const ctx = createContext(() => program.opts<GlobalOptions>(), io);
  registerAuth(program, ctx);
  registerPens(program, ctx);
  registerCollections(program, ctx);
  return program;
}

/** Run with argv; resolves to a process exit code instead of exiting. */
export async function run(argv: string[], io: ProgramIO): Promise<number> {
  const program = createProgram(io);
  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (error) {
    if (isCommanderExit(error)) return error.exitCode;
    io.err(`${describeError(error)}\n`);
    return exitCodeFor(error);
  }
}

function isCommanderExit(error: unknown): error is { exitCode: number; code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { exitCode?: unknown }).exitCode === 'number' &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('commander.')
  );
}

/** Node wraps network failures as "fetch failed" with the real reason in `cause`. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error && cause.message) return `${error.message}: ${cause.message}`;
  return error.message;
}
