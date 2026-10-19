import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import {
  ACCESS_VALUES,
  addPagingOptions,
  oneOf,
  penColumns,
  printPage,
  toListOptions,
  type PagingOptions,
} from './shared.js';
import { ConfigError } from '../lib/errors.js';
import { formatJson, renderRecord } from '../lib/output.js';
import type { Collection } from '../types.js';

export const collectionColumns = [
  { header: 'ID', value: (c: Collection) => c.id },
  { header: 'TITLE', value: (c: Collection) => c.title },
  { header: 'ACCESS', value: (c: Collection) => c.access },
  { header: 'UPDATED', value: (c: Collection) => c.updated_at ?? '' },
];

const collectionKeys = ['id', 'title', 'description', 'access', 'created_at', 'updated_at'];

interface CollectionFlags {
  title?: string;
  description?: string;
  access?: string;
}

function addCollectionOptions(cmd: Command): Command {
  return cmd
    .option('--title <title>', 'Collection title')
    .option('--description <text>', 'Description')
    .option('--access <access>', `Public or Private`, oneOf(ACCESS_VALUES, '--access'));
}

function printCollection(ctx: CommandContext, collection: Collection): void {
  ctx.out(
    ctx.format() === 'json'
      ? formatJson(collection)
      : renderRecord(collection, 'table', collectionKeys),
  );
}

export function registerCollections(program: Command, ctx: CommandContext): void {
  const collections = program.command('collections').description('Work with your Collections');

  addPagingOptions(
    collections
      .command('list')
      .description('List your Collections')
      .option('--access <access>', 'Filter by access (comma-separate for several)'),
  ).action(async (opts: PagingOptions & { access?: string }) => {
    const page = await ctx
      .client()
      .listCollections({ access: opts.access, ...toListOptions(opts) });
    printPage(ctx, page, collectionColumns, 'No Collections found.');
  });

  collections
    .command('get <id>')
    .description('Show one Collection')
    .action(async (id: string) => {
      printCollection(ctx, await ctx.client().getCollection(id));
    });

  addCollectionOptions(collections.command('create').description('Create a Collection')).action(
    async (opts: CollectionFlags) => {
      if (!opts.title) throw new ConfigError('--title is required.');
      printCollection(
        ctx,
        await ctx.client().createCollection({
          title: opts.title,
          description: opts.description,
          access: opts.access,
        }),
      );
    },
  );

  addCollectionOptions(
    collections.command('update <id>').description('Change title, description or access'),
  ).action(async (id: string, opts: CollectionFlags) => {
    const input = { title: opts.title, description: opts.description, access: opts.access };
    if (Object.values(input).every((v) => v === undefined)) {
      throw new ConfigError('Nothing to update. Pass --title, --description or --access.');
    }
    printCollection(ctx, await ctx.client().updateCollection(id, input));
  });

  collections
    .command('delete <id>')
    .description('Move a Collection to the trash (its Pens are not affected)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }) => {
      await ctx.confirmOrAbort(`Move Collection ${id} to the trash?`, opts.yes);
      await ctx.client().deleteCollection(id);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson({ id, deleted: true })
          : `Moved Collection ${id} to the trash.`,
      );
    });

  addPagingOptions(
    collections.command('pens <id>').description('List the Pens in a Collection'),
  ).action(async (id: string, opts: PagingOptions) => {
    const page = await ctx.client().listCollectionPens(id, toListOptions(opts));
    printPage(ctx, page, penColumns, 'No Pens in this Collection.');
  });

  collections
    .command('add <id> <pen>')
    .description('Add a Pen to a Collection')
    .action(async (id: string, penId: string) => {
      const collection = await ctx.client().addPenToCollection(id, penId);
      if (ctx.format() === 'json') ctx.out(formatJson(collection));
      else ctx.out(`Added Pen ${penId} to Collection ${id} (${collection.title}).`);
    });

  collections
    .command('remove <id> <pen>')
    .description('Remove a Pen from a Collection')
    .action(async (id: string, penId: string) => {
      await ctx.client().removePenFromCollection(id, penId);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson({ collection: id, pen: penId, removed: true })
          : `Removed Pen ${penId} from Collection ${id}.`,
      );
    });
}
