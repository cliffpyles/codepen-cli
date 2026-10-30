import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import { addPagingOptions, LIST_SORTS, printPage, toListOptions } from './shared.js';
import type { PagingOptions } from './shared.js';
import { formatJson } from '../lib/output.js';
import type { TrashItem } from '../types.js';

export const trashColumns = [
  { header: 'TYPE', value: (t: TrashItem) => t.type },
  { header: 'ID', value: (t: TrashItem) => t.item_id },
  { header: 'TITLE', value: (t: TrashItem) => t.title },
  { header: 'DELETED', value: (t: TrashItem) => t.deleted_at },
  { header: 'EXPIRES', value: (t: TrashItem) => t.expires_at },
];

export function registerTrash(program: Command, ctx: CommandContext): void {
  const trash = program.command('trash').description('See and purge deleted Pens and Collections');

  addPagingOptions(
    trash
      .command('list')
      .description(
        'List deleted Pens and Collections. Restore with `pens restore` or `collections restore`',
      ),
    LIST_SORTS,
  ).action(async (opts: PagingOptions) => {
    const page = await ctx.client().listTrash(toListOptions(opts));
    printPage(ctx, page, trashColumns, 'The trash is empty.');
  });

  trash
    .command('purge <pen>')
    .description('Delete a trashed Pen for good. This cannot be undone')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (penId: string, opts: { yes?: boolean }) => {
      await ctx.confirmOrAbort(`Permanently delete Pen ${penId}? This cannot be undone.`, opts.yes);
      const item = await ctx.client().purgePen(penId);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson(item)
          : `Permanently deleted Pen ${penId} (${item.title}).`,
      );
    });
}
