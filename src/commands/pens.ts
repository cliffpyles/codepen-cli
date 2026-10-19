import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import { render } from '../lib/output.js';
import type { Pen } from '../types.js';

export const penColumns = [
  { header: 'ID', value: (p: Pen) => p.id },
  { header: 'TITLE', value: (p: Pen) => p.title },
  { header: 'ACCESS', value: (p: Pen) => p.access },
  { header: 'UPDATED', value: (p: Pen) => p.updated_at ?? '' },
];

export function registerPens(program: Command, ctx: CommandContext): void {
  const pens = program.command('pens').description('Work with your Pens');

  pens
    .command('list')
    .description('List your Pens')
    .option('--access <access>', 'Filter by access (Public, Private, Protected, Collaborators)')
    .option('--tag <tag...>', 'Filter by tag (repeatable)')
    .option('--search <term>', 'Search term')
    .option('--page <n>', 'Page number', Number, 1)
    .option('--per-page <n>', 'Items per page (max 100)', Number, 30)
    .action(
      async (opts: {
        access?: string;
        tag?: string[];
        search?: string;
        page: number;
        perPage: number;
      }) => {
        const client = ctx.client();
        const page = await client.listPens({
          access: opts.access,
          tags: opts.tag,
          search_term: opts.search,
          page: opts.page,
          per_page: opts.perPage,
        });
        ctx.out(render(page.items, penColumns, ctx.format()));
        if (page.links.next !== undefined && ctx.format() === 'table') {
          ctx.err(`More results: --page ${page.links.next}`);
        }
      },
    );

  pens
    .command('get <id>')
    .description('Show one Pen')
    .action(async (id: string) => {
      const pen = await ctx.client().getPen(id);
      ctx.out(render([pen], penColumns, ctx.format()));
    });
}
