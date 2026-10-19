import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import {
  addPagingOptions,
  LIST_SORTS,
  penRecord,
  penRecordKeys,
  printPage,
  summarizeBuild,
  toListOptions,
  type PagingOptions,
} from './shared.js';
import { ConfigError } from '../lib/errors.js';
import { formatJson, formatTable, renderRecord } from '../lib/output.js';
import type { Build, Deployment, Version } from '../types.js';

export const versionColumns = [
  { header: 'ID', value: (v: Version) => v.id },
  { header: 'CREATED', value: (v: Version) => v.created_at ?? '' },
  { header: 'BUILD', value: (v: Version) => v.build?.status ?? '' },
  { header: 'DEPLOYED', value: (v: Version) => (v.deployed ? 'yes' : '') },
];

function versionRecord(v: Version): Record<string, unknown> {
  return {
    id: v.id,
    pen_id: v.pen_id,
    hash: v.hash,
    created_at: v.created_at,
    deployed: v.deployed,
    build_status: v.build?.status,
    preview_url: v.preview_url,
    files: v.files?.map((f) => f.path),
  };
}

function deploymentRecord(d: Deployment): Record<string, unknown> {
  return {
    id: d.id,
    version_id: d.version_id,
    url: d.url,
    custom_domains: d.custom_domains,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

export function registerVersions(pens: Command, ctx: CommandContext): void {
  const versions = pens
    .command('versions')
    .description("Browse and restore a Pen's saved versions");

  addPagingOptions(
    versions.command('list <pen>').description('List saved versions, newest first'),
    LIST_SORTS,
  ).action(async (penId: string, opts: PagingOptions) => {
    const page = await ctx.client().listVersions(penId, toListOptions(opts));
    printPage(ctx, page, versionColumns, 'No versions.');
  });

  versions
    .command('get <version>')
    .description('Show one version, including its files and build')
    .action(async (id: string) => {
      const version = await ctx.client().getVersion(id);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson(version)
          : renderRecord(versionRecord(version), 'table'),
      );
    });

  versions
    .command('restore <pen> <version>')
    .description('Copy an older version to the head (does not trigger a build)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (penId: string, versionId: string, opts: { yes?: boolean }) => {
      await ctx.confirmOrAbort(
        `Restore version ${versionId} as the head of Pen ${penId}?`,
        opts.yes,
      );
      const pen = await ctx.client().restoreVersion(penId, versionId);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson(pen)
          : renderRecord(penRecord(pen), 'table', penRecordKeys),
      );
    });

  const builds = pens.command('builds').description('Inspect builds');

  builds
    .command('get <build>')
    .description('Show a build; a build shares the ID of the version it built')
    .option('--follow', 'Poll until the build settles')
    .action(async (id: string, opts: { follow?: boolean }) => {
      const client = ctx.client();
      let build: Build = await client.getBuild(id);
      if (opts.follow) build = await client.waitForBuild(build);
      if (ctx.format() === 'json') {
        ctx.out(formatJson(build));
      } else {
        ctx.out(summarizeBuild(build));
        const files = build.files ?? [];
        if (files.length) {
          ctx.out(formatTable(files, [{ header: 'COMPILED FILE', value: (f) => f.path }]));
        }
      }
      if (build.status === 'Failed') throw new ConfigError('Build failed.');
    });

  pens
    .command('deploy <pen>')
    .description('Deploy the saved head, or a specific version with --version-id')
    .option('--version-id <id>', 'Version to deploy (defaults to the saved head)')
    .action(async (penId: string, opts: { versionId?: string }) => {
      const deployment = await ctx.client().deploy(penId, opts.versionId);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson(deployment)
          : renderRecord(deploymentRecord(deployment), 'table'),
      );
    });

  pens
    .command('undeploy <pen>')
    .description('Take the deployment down')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (penId: string, opts: { yes?: boolean }) => {
      await ctx.confirmOrAbort(`Take down the deployment of Pen ${penId}?`, opts.yes);
      await ctx.client().undeploy(penId);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson({ id: penId, deployed: false })
          : `Deployment of Pen ${penId} removed.`,
      );
    });
}
