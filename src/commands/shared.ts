import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import { ConfigError } from '../lib/errors.js';
import { formatJson, formatTable } from '../lib/output.js';
import type { Build, Diagnostic, Page, Pen } from '../types.js';

export const ACCESS_VALUES = ['Public', 'Private', 'Protected', 'Collaborators'] as const;
export const ROLE_VALUES = ['Editor', 'Viewer'] as const;
/** Sort fields every paged list accepts. */
export const LIST_SORTS = ['created', 'updated'] as const;
/** Pens and Collections can also be ranked by popularity. */
export const RANKED_SORTS = [...LIST_SORTS, 'popularity'] as const;

export interface PagingOptions {
  page: number;
  perPage: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface WriteFlags {
  wait?: number;
  expectedVersion?: string;
  follow?: boolean;
}

export const penColumns = [
  { header: 'ID', value: (p: Pen) => p.id },
  { header: 'TITLE', value: (p: Pen) => p.title },
  { header: 'ACCESS', value: (p: Pen) => p.access },
  { header: 'UPDATED', value: (p: Pen) => p.updated_at ?? '' },
];

/** Keys shown, in order, when a single Pen is printed as a record. */
export const penRecordKeys = [
  'id',
  'title',
  'description',
  'tags',
  'access',
  'editor',
  'template',
  'popularity',
  'created_at',
  'updated_at',
  'editor_url',
  'preview_url',
  'saved_version_id',
  'deployment_url',
];

export function penRecord(pen: Pen): Record<string, unknown> {
  return {
    ...pen,
    editor_url: pen.urls?.editor,
    preview_url: pen.urls?.preview,
    saved_version_id: pen.saved_version?.id,
    deployment_url: pen.deployment?.url,
  };
}

export function addPagingOptions(cmd: Command, sorts?: readonly string[]): Command {
  cmd
    .option('--page <n>', 'Page number', parsePositiveInt, 1)
    .option('--per-page <n>', 'Items per page (max 100)', parsePositiveInt, 30);
  if (sorts) {
    cmd
      .option('--sort <field>', `Sort by: ${sorts.join(', ')}`, oneOf(sorts, '--sort'))
      .option('--direction <dir>', 'asc or desc', oneOf(['asc', 'desc'], '--direction'));
  }
  return cmd;
}

export function addWriteOptions(cmd: Command): Command {
  return cmd
    .option(
      '--wait <seconds>',
      'Seconds the API waits for the build, 0–75 (server default 45)',
      parseWait,
    )
    .option(
      '--expected-version <id>',
      'Refuse the write if the Pen head is no longer this version (CONFLICT)',
    )
    .option('--no-follow', 'Do not poll an unfinished build before returning');
}

export function toListOptions(opts: PagingOptions) {
  return { page: opts.page, per_page: opts.perPage, sort: opts.sort, direction: opts.direction };
}

export function toWriteOptions(opts: WriteFlags) {
  return { wait: opts.wait, expected_version_id: opts.expectedVersion };
}

export function parsePositiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1)
    throw new ConfigError(`Expected a positive integer, got "${value}".`);
  return n;
}

export function parseWait(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 75) {
    throw new ConfigError(`--wait must be a whole number of seconds from 0 to 75, got "${value}".`);
  }
  return n;
}

/** Case-insensitive enum parser that returns the canonical spelling. */
export function oneOf<T extends string>(values: readonly T[], flag: string): (value: string) => T {
  return (value) => {
    const match = values.find((v) => v.toLowerCase() === value.toLowerCase());
    if (!match)
      throw new ConfigError(`${flag} must be one of: ${values.join(', ')}. Got "${value}".`);
    return match;
  };
}

export function parseBoolean(flag: string): (value: string) => boolean {
  return (value) => {
    const v = value.toLowerCase();
    if (v === 'true' || v === 'yes' || v === '1') return true;
    if (v === 'false' || v === 'no' || v === '0') return false;
    throw new ConfigError(`${flag} must be true or false, got "${value}".`);
  };
}

/** Print a listing with the active format and a next-page hint on stderr. */
export function printPage<T>(
  ctx: CommandContext,
  page: Page<T>,
  columns: { header: string; value: (row: T) => string }[],
  emptyMessage?: string,
): void {
  if (ctx.format() === 'json') {
    ctx.out(formatJson(page.items));
    return;
  }
  ctx.out(formatTable(page.items, columns, emptyMessage));
  if (page.links.next !== undefined) ctx.err(`More results: --page ${page.links.next}`);
}

function describeDiagnostic(d: Diagnostic): string {
  const where = d.path ? ` ${d.path}` : '';
  return `  ${d.type}${where}: ${d.message}`;
}

/** Human summary of a build for stderr; JSON callers get the build object instead. */
export function summarizeBuild(build: Build): string {
  const lines = [`Build ${build.id}: ${build.status}`];
  const errors = build.errors ?? [];
  for (const d of errors) lines.push(describeDiagnostic(d));
  if (build.status === 'Canceled') {
    if (build.next_id)
      lines.push(`  Compiler produced a follow-up version; see build ${build.next_id}.`);
    else if (build.patches?.length) {
      lines.push(`  ${build.patches.length} patch(es) must be applied before the Pen builds:`);
      for (const p of build.patches) lines.push(`    ${p.type} ${p.path}`);
    }
  }
  if (build.status === 'Queued' || build.status === 'Running') {
    lines.push(
      `  Still ${build.status.toLowerCase()}; check with \`codepen pens builds get ${build.id}\`.`,
    );
  }
  return lines.join('\n');
}

/**
 * Settle a build (polling if asked) and report it. Returns the final build.
 * A Failed build is not an error for the request, but it is for the user: exit 1.
 */
export async function finishBuild(
  ctx: CommandContext,
  build: Build | undefined,
  follow: boolean,
): Promise<Build | undefined> {
  if (!build) return undefined;
  const final = follow ? await ctx.client().waitForBuild(build) : build;
  if (ctx.format() !== 'json') ctx.err(summarizeBuild(final));
  return final;
}

export function parseTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  const flat = tags
    .flatMap((t) => t.split(','))
    .map((t) => t.trim())
    .filter(Boolean);
  return flat.length ? flat : undefined;
}
