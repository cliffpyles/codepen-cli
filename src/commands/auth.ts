import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import {
  API_KEY_ENV,
  describeSource,
  isValidApiKey,
  keyKind,
  maskApiKey,
  missingKeyMessage,
} from '../lib/config.js';
import { CodePenApiError, ConfigError } from '../lib/errors.js';
import { formatJson } from '../lib/output.js';
import { configPath, deleteStore, readStore, writeStore } from '../lib/store.js';

export function registerAuth(program: Command, ctx: CommandContext): void {
  const auth = program.command('auth').description('Manage the stored API key');

  auth
    .command('login')
    .description('Store an API key in the config file')
    .option('--with-token', 'Read the key from standard input instead of prompting')
    .addHelpText(
      'after',
      `
Examples:
  $ codepen auth login                     # prompts, input is hidden
  $ codepen auth login --with-token < key.txt
  $ pbpaste | codepen auth login --with-token`,
    )
    .action(async (opts: { withToken?: boolean }) => {
      const key = await obtainKey(ctx, opts.withToken === true);
      if (!key) throw new ConfigError('No API key entered.');
      if (!isValidApiKey(key)) {
        throw new ConfigError(
          'That does not look like a CodePen API key. Keys start with cp_user_ or cp_team_.',
        );
      }
      const path = configPath(ctx.env);
      const existing = readStore(path);
      writeStore(path, { ...existing, api_key: key });
      ctx.out(`Saved ${keyKind(key)} key ${maskApiKey(key)} to ${path}`);
      if (ctx.env[API_KEY_ENV]) {
        ctx.err(`Note: $${API_KEY_ENV} is set and takes precedence over the stored key.`);
      }
    });

  auth
    .command('status')
    .description('Show which key is active and verify it against the API')
    .option('--no-verify', 'Skip the API request')
    .action(async (opts: { verify: boolean }) => {
      const path = configPath(ctx.env);
      let config;
      try {
        config = ctx.config();
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        if (ctx.format() === 'json') {
          ctx.out(formatJson({ authenticated: false, config_path: path, error: error.message }));
        } else {
          ctx.err(`Not logged in. ${missingKeyMessage(path)}`);
        }
        throw error;
      }

      const report: Record<string, unknown> = {
        key: maskApiKey(config.apiKey),
        kind: keyKind(config.apiKey),
        source: config.source,
        config_path: path,
        api_url: config.baseUrl,
      };

      let verified: boolean | undefined;
      let failure: string | undefined;
      if (opts.verify) {
        try {
          await ctx.client(config).listPens({ per_page: 1 });
          verified = true;
        } catch (error) {
          verified = false;
          failure = error instanceof Error ? error.message : String(error);
          if (error instanceof CodePenApiError) report.error_code = error.code;
        }
        report.authenticated = verified;
        if (failure) report.error = failure;
      }

      if (ctx.format() === 'json') {
        ctx.out(formatJson(report));
      } else {
        ctx.out(
          [
            `Key:      ${report.key as string} (${report.kind as string})`,
            `Source:   ${describeSource(config.source, path)}`,
            `API URL:  ${config.baseUrl}`,
            verified === undefined
              ? 'Verified: skipped'
              : verified
                ? 'Verified: yes, the API accepted this key'
                : `Verified: no (${failure ?? 'unknown error'})`,
          ].join('\n'),
        );
      }
      if (verified === false) throw new ConfigError('API key was rejected.');
    });

  auth
    .command('logout')
    .description('Delete the stored API key')
    .action(() => {
      const path = configPath(ctx.env);
      const removed = deleteStore(path);
      ctx.out(removed ? `Removed ${path}` : `Nothing to remove; ${path} does not exist.`);
      if (ctx.env[API_KEY_ENV]) {
        ctx.err(`Note: $${API_KEY_ENV} is still set in this shell.`);
      }
    });
}

async function obtainKey(ctx: CommandContext, withToken: boolean): Promise<string> {
  if (withToken || !ctx.isInteractive()) {
    return (await ctx.readStdin()).trim();
  }
  ctx.err('Paste your CodePen API key. Generate one at https://codepen.io/settings/api');
  return (await ctx.promptSecret('API key: ')).trim();
}
