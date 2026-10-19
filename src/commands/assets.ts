import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import { looksBinary, readLocal } from './files.js';
import { addPagingOptions, printPage, toListOptions, type PagingOptions } from './shared.js';
import { ConfigError } from '../lib/errors.js';
import { formatJson, renderRecord } from '../lib/output.js';
import type { Asset } from '../types.js';

export const assetColumns = [
  { header: 'ID', value: (a: Asset) => a.id },
  { header: 'FILENAME', value: (a: Asset) => a.filename },
  { header: 'BINARY', value: (a: Asset) => (a.is_binary ? 'yes' : '') },
  { header: 'URL', value: (a: Asset) => a.url ?? '' },
];

const assetKeys = ['id', 'filename', 'is_binary', 'url', 'created_at', 'updated_at'];

/** Asset filenames must be unique and cannot contain path separators. */
export function validateFilename(name: string): string {
  if (!name || /[\\/]/.test(name)) {
    throw new ConfigError(
      `Invalid asset filename "${name}": it cannot be empty or contain / or \\.`,
    );
  }
  return name;
}

function printAsset(ctx: CommandContext, asset: Asset): void {
  ctx.out(
    ctx.format() === 'json'
      ? formatJson(asset)
      : renderRecord(asset as unknown as Record<string, unknown>, 'table', assetKeys),
  );
}

/** Decide how to send local bytes: text as a string, binary as bytes. */
export function toPayload(bytes: Uint8Array, forceBinary: boolean): Uint8Array | string {
  return forceBinary || looksBinary(bytes) ? bytes : new TextDecoder().decode(bytes);
}

export function registerAssets(program: Command, ctx: CommandContext): void {
  const assets = program.command('assets').description('Work with your Assets');

  addPagingOptions(assets.command('list').description('List your Assets')).action(
    async (opts: PagingOptions) => {
      const page = await ctx.client().listAssets(toListOptions(opts));
      printPage(ctx, page, assetColumns, 'No Assets.');
    },
  );

  assets
    .command('get <id>')
    .description('Show an Asset; --output saves its content locally')
    .option('-o, --output <local>', 'Save the content to this file')
    .action(async (id: string, opts: { output?: string }) => {
      const asset = await ctx.client().getAsset(id);
      if (!opts.output) {
        printAsset(ctx, asset);
        return;
      }
      let bytes: Uint8Array;
      if (asset.content !== null && asset.content !== undefined && !asset.is_binary) {
        bytes = new TextEncoder().encode(asset.content);
      } else {
        if (!asset.url) throw new ConfigError(`Asset ${id} has no download URL.`);
        const response = await ctx.client().fetch(asset.url);
        if (!response.ok)
          throw new ConfigError(`Download of ${asset.url} failed: HTTP ${response.status}`);
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      try {
        await writeFile(opts.output, bytes);
      } catch (error) {
        throw new ConfigError(
          `Could not write ${opts.output}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      ctx.err(`Saved ${asset.filename} (${bytes.length} bytes) to ${opts.output}`);
    });

  assets
    .command('upload <local>')
    .description('Upload a local file as a new Asset')
    .option('--filename <name>', 'Asset filename (defaults to the local basename)')
    .option('--binary', 'Force a multipart upload (auto-detected from NUL bytes otherwise)')
    .action(async (local: string, opts: { filename?: string; binary?: boolean }) => {
      const filename = validateFilename(opts.filename ?? basename(local));
      const bytes = await readLocal(local);
      printAsset(
        ctx,
        await ctx.client().createAsset(filename, toPayload(bytes, opts.binary === true)),
      );
    });

  assets
    .command('update <id>')
    .description('Rename an Asset and/or replace its content')
    .option('--filename <name>', 'New filename (changes the URL)')
    .option('--from <local>', 'Local file whose content replaces the Asset')
    .option('--binary', 'Force a multipart upload for --from')
    .action(async (id: string, opts: { filename?: string; from?: string; binary?: boolean }) => {
      if (opts.filename === undefined && opts.from === undefined) {
        throw new ConfigError('Nothing to update. Pass --filename and/or --from.');
      }
      const filename = opts.filename === undefined ? undefined : validateFilename(opts.filename);
      const data =
        opts.from === undefined
          ? undefined
          : toPayload(await readLocal(opts.from), opts.binary === true);
      printAsset(ctx, await ctx.client().updateAsset(id, { filename, data }));
    });

  assets
    .command('delete <id>')
    .description('Delete an Asset')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }) => {
      await ctx.confirmOrAbort(`Delete Asset ${id}? This cannot be undone.`, opts.yes);
      await ctx.client().deleteAsset(id);
      ctx.out(ctx.format() === 'json' ? formatJson({ id, deleted: true }) : `Deleted Asset ${id}.`);
    });
}
