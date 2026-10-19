import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import { registerCollaborators } from './collaborators.js';
import { readLocalFiles, registerFiles } from './files.js';
import { registerVersions } from './versions.js';
import {
  ACCESS_VALUES,
  addPagingOptions,
  addWriteOptions,
  finishBuild,
  oneOf,
  parseBoolean,
  parseTags,
  penColumns,
  penRecord,
  penRecordKeys,
  printPage,
  RANKED_SORTS,
  toListOptions,
  toWriteOptions,
  type PagingOptions,
  type WriteFlags,
} from './shared.js';
import { ConfigError } from '../lib/errors.js';
import { formatJson, renderRecord } from '../lib/output.js';
import type { Pen, PenSettings } from '../types.js';

interface PenFlags {
  title?: string;
  description?: string;
  tag?: string[];
  access?: string;
  password?: string;
  template?: boolean;
}

function penInput(opts: PenFlags) {
  return {
    title: opts.title,
    description: opts.description,
    tags: parseTags(opts.tag),
    access: opts.access,
    password: opts.password,
    template: opts.template,
  };
}

function addPenOptions(cmd: Command): Command {
  return cmd
    .option('--title <title>', 'Pen title')
    .option('--description <text>', 'Description')
    .option('--tag <tag...>', 'Tag (repeat or comma-separate; max 3)')
    .option(
      '--access <access>',
      `One of ${ACCESS_VALUES.join(', ')}`,
      oneOf(ACCESS_VALUES, '--access'),
    )
    .option('--password <password>', 'Password for Protected access (8+ characters)')
    .option('--template <bool>', 'Mark as a template (true/false)', parseBoolean('--template'));
}

function printPen(ctx: CommandContext, pen: Pen, build?: unknown): void {
  if (ctx.format() === 'json') {
    ctx.out(formatJson(build === undefined ? pen : { ...pen, build }));
  } else {
    ctx.out(renderRecord(penRecord(pen), 'table', penRecordKeys));
  }
}

export function registerPens(program: Command, ctx: CommandContext): void {
  const pens = program.command('pens').description('Work with your Pens');

  addPagingOptions(
    pens
      .command('list')
      .description('List your Pens')
      .option(
        '--access <access>',
        `Filter: ${ACCESS_VALUES.join(', ')} (comma-separate for several)`,
      )
      .option('--tag <tag...>', 'Filter by tag (up to 3)')
      .option('--search <term>', 'Search term (up to 200 characters)')
      .option(
        '--deployed <bool>',
        'Only deployed (true) or undeployed (false) Pens',
        parseBoolean('--deployed'),
      )
      .option(
        '--template <bool>',
        'Only templates (true) or non-templates (false)',
        parseBoolean('--template'),
      )
      .option(
        '--forks <mode>',
        'All, Forked or NotForked',
        oneOf(['All', 'Forked', 'NotForked'], '--forks'),
      )
      .option('--editor <editor>', 'Classic or V2', oneOf(['Classic', 'V2'], '--editor')),
    RANKED_SORTS,
  ).action(
    async (
      opts: PagingOptions & {
        access?: string;
        tag?: string[];
        search?: string;
        deployed?: boolean;
        template?: boolean;
        forks?: string;
        editor?: string;
      },
    ) => {
      const page = await ctx.client().listPens({
        access: opts.access,
        tags: parseTags(opts.tag),
        search_term: opts.search,
        deployed: opts.deployed,
        template: opts.template,
        forks: opts.forks,
        editor: opts.editor,
        ...toListOptions(opts),
      });
      printPage(ctx, page, penColumns, 'No Pens found.');
    },
  );

  pens
    .command('get <id>')
    .description('Show one Pen')
    .action(async (id: string) => {
      printPen(ctx, await ctx.client().getPen(id));
    });

  addWriteOptions(
    addPenOptions(
      pens
        .command('create')
        .description('Create a 2.0 Pen and build it')
        .option(
          '--file <spec...>',
          'Local file to include, as local/path or local/path=pen/path (repeatable); binaries are detected',
        ),
    ),
  )
    .addHelpText(
      'after',
      `
Examples:
  $ codepen pens create --title "Hello" --file index.html --file src/main.css=style.css
  $ codepen pens create --title "Logo" --file index.html --file logo.png=img/logo.png
  $ codepen pens create --title "Private" --access Private --tag demo,api`,
    )
    .action(async (opts: PenFlags & WriteFlags & { file?: string[] }) => {
      const files = opts.file ? await readLocalFiles(opts.file) : undefined;
      const { build, ...pen } = await ctx
        .client()
        .createPen({ ...penInput(opts), files }, toWriteOptions(opts));
      const finalBuild = await finishBuild(ctx, build, opts.follow !== false);
      printPen(ctx, pen, finalBuild);
      if (finalBuild?.status === 'Failed')
        throw new ConfigError('Pen created, but the build failed.');
    });

  addPenOptions(
    pens
      .command('update <id>')
      .description('Change title, description, tags, access or template flag'),
  ).action(async (id: string, opts: PenFlags) => {
    const input = penInput(opts);
    if (Object.values(input).every((v) => v === undefined)) {
      throw new ConfigError(
        'Nothing to update. Pass at least one of --title, --description, --tag, --access, --password, --template.',
      );
    }
    printPen(ctx, await ctx.client().updatePen(id, input));
  });

  pens
    .command('delete <id>')
    .description('Move a Pen to the trash (restorable on codepen.io for 3 days)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }) => {
      await ctx.confirmOrAbort(`Move Pen ${id} to the trash?`, opts.yes);
      await ctx.client().deletePen(id);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson({ id, deleted: true })
          : `Moved Pen ${id} to the trash.`,
      );
    });

  addWriteOptions(
    addPenOptions(pens.command('fork <id>').description('Copy a 2.0 Pen and build the copy')),
  ).action(async (id: string, opts: PenFlags & WriteFlags) => {
    const { build, ...pen } = await ctx.client().forkPen(id, penInput(opts), toWriteOptions(opts));
    const finalBuild = await finishBuild(ctx, build, opts.follow !== false);
    printPen(ctx, pen, finalBuild);
    if (finalBuild?.status === 'Failed') throw new ConfigError('Pen forked, but the build failed.');
  });

  pens
    .command('settings <id>')
    .description('Update editor settings for a Pen')
    .option('--auto-deploy <bool>', 'Deploy on save', parseBoolean('--auto-deploy'))
    .option('--auto-run <bool>', 'Run on change', parseBoolean('--auto-run'))
    .option('--auto-save <bool>', 'Save automatically', parseBoolean('--auto-save'))
    .option('--indent-with <style>', 'spaces or tabs', oneOf(['spaces', 'tabs'], '--indent-with'))
    .option('--tab-size <n>', 'Tab size', (v: string) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 8)
        throw new ConfigError(`--tab-size must be 1–8, got "${v}".`);
      return n;
    })
    .action(
      async (
        id: string,
        opts: {
          autoDeploy?: boolean;
          autoRun?: boolean;
          autoSave?: boolean;
          indentWith?: string;
          tabSize?: number;
        },
      ) => {
        const settings: PenSettings = {};
        if (opts.autoDeploy !== undefined) settings.auto_deploy = opts.autoDeploy;
        if (opts.autoRun !== undefined) settings.auto_run = opts.autoRun;
        if (opts.autoSave !== undefined) settings.auto_save = opts.autoSave;
        if (opts.indentWith !== undefined) settings.indent_with = opts.indentWith;
        if (opts.tabSize !== undefined) settings.tab_size = opts.tabSize;
        if (Object.keys(settings).length === 0)
          throw new ConfigError('Nothing to update. Pass at least one setting flag.');
        const result = await ctx.client().updatePenSettings(id, settings);
        ctx.out(renderRecord(result as Record<string, unknown>, ctx.format()));
      },
    );

  // Subgroups last so `pens --help` lists the common commands first.
  registerFiles(pens, ctx);
  registerVersions(pens, ctx);
  registerCollaborators(pens, ctx);
}
