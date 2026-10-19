import { readFile, writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import { addWriteOptions, finishBuild, toWriteOptions, type WriteFlags } from './shared.js';
import { normalizePenPath } from '../lib/client.js';
import { ConfigError } from '../lib/errors.js';
import { formatJson, formatTable } from '../lib/output.js';
import type { FileChange, PenFile, WriteResult } from '../types.js';

export const fileColumns = [
  { header: 'PATH', value: (f: PenFile) => f.path },
  { header: 'ID', value: (f: PenFile) => f.id },
  { header: 'BINARY', value: (f: PenFile) => (f.is_binary ? 'yes' : '') },
  { header: 'HASH', value: (f: PenFile) => f.content_hash ?? '' },
];

/** Treat anything with a NUL byte in its first 8 KiB as binary. */
export function looksBinary(data: Uint8Array): boolean {
  const limit = Math.min(data.length, 8192);
  for (let i = 0; i < limit; i++) if (data[i] === 0) return true;
  return false;
}

function wrap(error: unknown, prefix: string): ConfigError {
  return new ConfigError(`${prefix}: ${error instanceof Error ? error.message : String(error)}`);
}

export async function readLocal(path: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    throw wrap(error, `Could not read ${path}`);
  }
}

/** Parse a bulk change list from JSON; accepts a bare array or {files: [...]}. */
export function parseChanges(json: string, source: string): FileChange[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ConfigError(`${source} is not valid JSON.`);
  }
  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as { files?: unknown }).files)
      ? (parsed as { files: unknown[] }).files
      : undefined;
  if (!list)
    throw new ConfigError(
      `${source} must be a JSON array of changes or an object with a "files" array.`,
    );
  return list.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null)
      throw new ConfigError(`${source}: change ${i} is not an object.`);
    const c = entry as Record<string, unknown>;
    if (typeof c.path !== 'string' && typeof c.id !== 'string') {
      throw new ConfigError(`${source}: change ${i} needs a "path" or "id".`);
    }
    if (
      c.delete !== true &&
      typeof c.content !== 'string' &&
      !(typeof c.id === 'string' && typeof c.path === 'string')
    ) {
      throw new ConfigError(
        `${source}: change ${i} must set "content", "delete": true, or move by giving both "id" and "path".`,
      );
    }
    const change: FileChange = {};
    if (typeof c.path === 'string') change.path = c.path;
    if (typeof c.id === 'string') change.id = c.id;
    if (typeof c.content === 'string') change.content = c.content;
    if (c.delete === true) change.delete = true;
    return change;
  });
}

async function reportWrite(
  ctx: CommandContext,
  result: WriteResult,
  follow: boolean,
  label: string,
): Promise<void> {
  const finalBuild = await finishBuild(ctx, result.build, follow);
  const build = finalBuild ?? result.build;
  if (ctx.format() === 'json') {
    ctx.out(formatJson({ ...result, build }));
  } else {
    ctx.out(`${label} Version ${result.version.id}.`);
  }
  if (build.status === 'Failed') throw new ConfigError('Files saved, but the build failed.');
}

export function registerFiles(pens: Command, ctx: CommandContext): void {
  const files = pens.command('files').description("Read and write a Pen's files");

  files
    .command('list <pen>')
    .description("List the files in the Pen's saved head")
    .action(async (penId: string) => {
      const list = await ctx.client().listFiles(penId);
      ctx.out(
        ctx.format() === 'json' ? formatJson(list) : formatTable(list, fileColumns, 'No files.'),
      );
    });

  files
    .command('get <pen> <path>')
    .description('Print a file, or save it with --output')
    .option('-o, --output <local>', 'Write the content to this local file')
    .action(async (penId: string, path: string, opts: { output?: string }) => {
      const file = await ctx.client().getFile(penId, path);
      if (ctx.format() === 'json' && !opts.output) {
        ctx.out(formatJson(file));
        return;
      }
      if (file.is_binary || file.content === null || file.content === undefined) {
        if (!opts.output)
          throw new ConfigError(`${file.path} is binary; pass --output <local> to save it.`);
        if (!file.url) throw new ConfigError(`${file.path} is binary and has no download URL.`);
        const response = await ctx.client().fetch(file.url);
        if (!response.ok)
          throw new ConfigError(`Download of ${file.url} failed: HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        await writeFile(opts.output, bytes).catch((e: unknown) => {
          throw wrap(e, `Could not write ${opts.output}`);
        });
        ctx.err(`Saved ${bytes.length} bytes to ${opts.output}`);
        return;
      }
      if (opts.output) {
        await writeFile(opts.output, file.content).catch((e: unknown) => {
          throw wrap(e, `Could not write ${opts.output}`);
        });
        ctx.err(`Saved ${file.path} to ${opts.output}`);
      } else {
        ctx.out(file.content);
      }
    });

  addWriteOptions(
    files
      .command('put <pen> <path>')
      .description('Write one file from a local file, --content, or stdin; builds the Pen')
      .option('-f, --from <local>', 'Local file to upload (defaults to the Pen path)')
      .option('--content <text>', 'Literal text content')
      .option('--stdin', 'Read content from standard input')
      .option('--binary', 'Force a multipart upload (auto-detected from NUL bytes otherwise)'),
  )
    .addHelpText(
      'after',
      `
Examples:
  $ codepen pens files put abc123 index.html                # uploads ./index.html
  $ codepen pens files put abc123 src/app.js --from dist/app.js
  $ codepen pens files put abc123 style.css --content "body{margin:0}"
  $ cat notes.md | codepen pens files put abc123 notes.md --stdin --wait 0`,
    )
    .action(
      async (
        penId: string,
        path: string,
        opts: WriteFlags & { from?: string; content?: string; stdin?: boolean; binary?: boolean },
      ) => {
        const sources = [opts.from, opts.content, opts.stdin].filter(
          (v) => v !== undefined && v !== false,
        ).length;
        if (sources > 1) throw new ConfigError('Use only one of --from, --content, --stdin.');
        const client = ctx.client();
        const write = toWriteOptions(opts);
        let result: WriteResult;
        if (opts.content !== undefined) {
          result = await client.putFile(penId, path, opts.content, write);
        } else if (opts.stdin) {
          result = await client.putFile(penId, path, await ctx.readStdin(), write);
        } else {
          const local = opts.from ?? normalizePenPath(path).slice(1);
          const bytes = await readLocal(local);
          result =
            opts.binary || looksBinary(bytes)
              ? await client.putBinaryFile(penId, path, bytes, write)
              : await client.putFile(penId, path, new TextDecoder().decode(bytes), write);
        }
        await reportWrite(ctx, result, opts.follow !== false, `Wrote ${normalizePenPath(path)}.`);
      },
    );

  addWriteOptions(
    files
      .command('apply <pen> <changes>')
      .description('Apply several changes as one version from a JSON file ("-" for stdin)'),
  )
    .addHelpText(
      'after',
      `
The JSON is an array (or {"files": [...]}) of changes, applied in order:
  { "path": "index.html", "content": "<h1>Hi</h1>" }     write by path (creates if missing)
  { "id": "<file id>", "content": "..." }                 write by id
  { "id": "<file id>", "path": "src/app.js" }             move/rename, keeping the id
  { "path": "style.css", "delete": true }                 delete (a directory removes everything under it)`,
    )
    .action(async (penId: string, changesPath: string, opts: WriteFlags) => {
      const json =
        changesPath === '-'
          ? await ctx.readStdin()
          : new TextDecoder().decode(await readLocal(changesPath));
      const changes = parseChanges(json, changesPath === '-' ? 'stdin' : changesPath);
      if (changes.length === 0) throw new ConfigError('No changes to apply.');
      const result = await ctx.client().putFiles(penId, changes, toWriteOptions(opts));
      await reportWrite(ctx, result, opts.follow !== false, `Applied ${changes.length} change(s).`);
    });

  addWriteOptions(
    files
      .command('delete <pen> <path>')
      .description('Delete a file, or every file under a directory; builds the Pen')
      .option('-y, --yes', 'Skip the confirmation prompt'),
  ).action(async (penId: string, path: string, opts: WriteFlags & { yes?: boolean }) => {
    const normalized = normalizePenPath(path);
    await ctx.confirmOrAbort(`Delete ${normalized} from Pen ${penId}?`, opts.yes);
    const result = await ctx.client().deleteFile(penId, path, toWriteOptions(opts));
    await reportWrite(ctx, result, opts.follow !== false, `Deleted ${normalized}.`);
  });
}
