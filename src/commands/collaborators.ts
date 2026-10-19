import type { Command } from 'commander';
import type { CommandContext } from './context.js';
import { oneOf, ROLE_VALUES } from './shared.js';
import { formatJson, formatTable } from '../lib/output.js';
import type { Collaborator, Invite } from '../types.js';

export const collaboratorColumns = [
  { header: 'USERNAME', value: (c: Collaborator) => c.username },
  { header: 'NAME', value: (c: Collaborator) => c.name ?? '' },
  { header: 'ROLE', value: (c: Collaborator) => c.role },
  { header: 'TEAM MEMBER', value: (c: Collaborator) => (c.is_team_member ? 'yes' : '') },
];

export const inviteColumns = [
  { header: 'ID', value: (i: Invite) => i.id },
  { header: 'INVITEE', value: (i: Invite) => i.username ?? i.email ?? '' },
  { header: 'ROLE', value: (i: Invite) => i.role },
  { header: 'CREATED', value: (i: Invite) => i.created_at ?? '' },
];

export function registerCollaborators(pens: Command, ctx: CommandContext): void {
  const collab = pens.command('collaborators').description("Manage a Pen's collaborators");
  const roleParser = oneOf(ROLE_VALUES, '--role');

  collab
    .command('list <pen>')
    .description('List collaborators')
    .action(async (penId: string) => {
      const list = await ctx.client().listCollaborators(penId);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson(list)
          : formatTable(list, collaboratorColumns, 'No collaborators.'),
      );
    });

  collab
    .command('invite <pen> <email-or-username>')
    .description('Invite someone to collaborate')
    .requiredOption('--role <role>', ROLE_VALUES.join(' or '), roleParser)
    .action(async (penId: string, who: string, opts: { role: string }) => {
      const invites = await ctx.client().inviteCollaborator(penId, who, opts.role);
      if (ctx.format() === 'json') {
        ctx.out(formatJson(invites));
      } else {
        ctx.out(`Invited ${who} as ${opts.role}.`);
        ctx.out(formatTable(invites, inviteColumns, 'No pending invites.'));
      }
    });

  collab
    .command('set-role <pen> <username>')
    .description("Change a collaborator's role")
    .requiredOption('--role <role>', ROLE_VALUES.join(' or '), roleParser)
    .action(async (penId: string, username: string, opts: { role: string }) => {
      const list = await ctx.client().updateCollaborator(penId, username, opts.role);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson(list)
          : formatTable(list, collaboratorColumns, 'No collaborators.'),
      );
    });

  collab
    .command('remove <pen> <username>')
    .description('Remove a collaborator')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (penId: string, username: string, opts: { yes?: boolean }) => {
      await ctx.confirmOrAbort(`Remove ${username} from Pen ${penId}?`, opts.yes);
      await ctx.client().removeCollaborator(penId, username);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson({ pen: penId, username, removed: true })
          : `Removed ${username} from Pen ${penId}.`,
      );
    });

  collab
    .command('invites <pen>')
    .description('List pending invites')
    .action(async (penId: string) => {
      const list = await ctx.client().listInvites(penId);
      ctx.out(
        ctx.format() === 'json'
          ? formatJson(list)
          : formatTable(list, inviteColumns, 'No pending invites.'),
      );
    });
}
