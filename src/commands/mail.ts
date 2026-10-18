import type { Guild } from 'discord.js';
import { isAdmin } from '../config.js';
import { parseMailCommand } from '../lib/game/mail.js';
import { everyoneIn, sendMail } from '../services/mail.js';
import { getNotifyRoleId } from '../services/roles.js';
import type { Command } from '../discord/types.js';

/*
 * The bot admin sends mail with rewards to a member's mailbox, or everyone's with the server's notify role (`config set
 * notifyRole`; services/mail.ts): a title, a message, and what it carries (lib/game/mail.ts says the words). They read and
 * claim it on the site.
 */

const USAGE = (p: string): string =>
  [
    `**${p}mail** \`<@user | all> | <title> | <message> | [rewards]\``,
    'Rewards, separated by commas: `points:5000`, `gems:20`, `tokens:5`, `item:<item id>` (`x3` for 3), `rune:<rune id>` (`x3` for 3), `uw` (a Unique Weapon Ticket), `ut` (a Unique Treasure Ticket).',
    `For example: \`${p}mail all | Maintenance | Thanks for waiting! | points:5000, uw\``,
    '`all` is everyone with the notify role.',
  ].join('\n');

/**
 * Everyone in the server with its notify role whom the bot knows (a member document; each looked up, as the bot doesn't get the
 * whole member list). Null: the server has no notify role.
 */
async function notifyRoleMembers(guild: Guild): Promise<string[] | null> {
  const roleId = await getNotifyRoleId(guild.id, 'general');
  if (roleId === null || !guild.roles.cache.has(roleId)) return null;
  const members = await Promise.all((await everyoneIn(guild.id)).map((id) => guild.members.fetch(id).catch(() => null)));
  return members.flatMap((member) => (member && !member.user.bot && member.roles.cache.has(roleId) ? [member.id] : []));
}

export const mail: Command = {
  name: 'mail',
  category: 'bot',
  description: 'Bot admin only: send mail with rewards to a member, or everyone with the notify role.',
  usage: 'mail <@user | all> | <title> | <message> | [rewards]',
  slashUsage: 'mail <title> <message> [user] [everyone] [rewards]',
  adminOnly: true,

  async execute(ctx) {
    if (!isAdmin(ctx.user.id)) {
      await ctx.reply('Only the bot admin can send mail.');
      return;
    }
    const parsed = parseMailCommand(ctx.text ?? ctx.args.join(' '));
    if (!parsed.ok) {
      const why = parsed.reason === 'bad_target' ? `Send it to whom? \`${parsed.detail}\` is no member (a mention, an id, or \`all\`).` : parsed.reason === 'bad_reward' ? `\`${parsed.detail}\` is no reward I know.` : null;
      await ctx.reply([...(why ? [why] : []), USAGE(ctx.prefix)].join('\n'));
      return;
    }
    const to = parsed.to === 'all' ? await notifyRoleMembers(ctx.guild) : [parsed.to];
    if (!to) {
      await ctx.reply('This server has no notify role to send to (`config set notifyRole`).');
      return;
    }
    const sent = await sendMail(ctx.guildId, to, { title: parsed.title, message: parsed.message, from: 'admin', attachments: parsed.attachments });
    const what = parsed.attachments.length > 0 ? ` with ${parsed.attachments.length} reward${parsed.attachments.length === 1 ? '' : 's'}` : '';
    await ctx.reply(`📬 Sent **${parsed.title}**${what} to ${parsed.to === 'all' ? `${sent} member${sent === 1 ? '' : 's'} with the notify role` : `<@${parsed.to}>`}. They claim it from the mail icon on the site.`);
  },
};
