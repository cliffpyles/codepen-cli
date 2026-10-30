import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import { formatJson, formatTable } from '../lib/output.js';
import type { PenDomain } from '../types.js';

export const domainColumns = [
  { header: 'HOST', value: (d: PenDomain) => d.host },
  { header: 'STATUS', value: (d: PenDomain) => d.status },
  { header: 'CNAME', value: (d: PenDomain) => d.cname_record },
  { header: 'A', value: (d: PenDomain) => d.a_record },
  {
    header: 'DNS RECORDS TO CREATE',
    value: (d: PenDomain) => d.dns.map((r) => `${r.type} ${r.name} ${r.value}`).join(', '),
  },
];

function printDomains(ctx: CommandContext, list: PenDomain[]): void {
  ctx.out(
    ctx.format() === 'json'
      ? formatJson(list)
      : formatTable(list, domainColumns, 'No custom domains.'),
  );
}

export function registerDomains(pens: Command, ctx: CommandContext): void {
  const domains = pens.command('domains').description("Manage a Pen's custom domains");

  domains
    .command('list <pen>')
    .description('List custom domains, with their status and the DNS records to create')
    .action(async (penId: string) => {
      printDomains(ctx, await ctx.client().listDomains(penId));
    });

  domains
    .command('add <pen> <host>')
    .description("Add a custom domain to the Pen's deployment")
    .action(async (penId: string, host: string) => {
      printDomains(ctx, await ctx.client().addDomain(penId, host));
    });

  domains
    .command('remove <pen> <host>')
    .description('Remove a custom domain from the deployment')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (penId: string, host: string, opts: { yes?: boolean }) => {
      await ctx.confirmOrAbort(`Remove ${host} from Pen ${penId}?`, opts.yes);
      printDomains(ctx, await ctx.client().removeDomain(penId, host));
    });
}
