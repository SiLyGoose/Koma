import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Guild } from 'discord.js';
import { isAdmin } from '../config.js';
import { createEmbed } from '../lib/embed.js';
import { parseMailCommand } from '../lib/game/mail.js';
import { everyoneIn, sendMail } from '../services/mail.js';
import { getNotifyRoleId } from '../services/roles.js';
import type { Command } from '../discord/types.js';
import { webConfig } from '../web/config.js';
import { attachmentView } from '../web/models/mail.js';

/*
 * The bot admin sends mail with rewards to a member's mailbox, or everyone's with the server's notify role (`config set
 * notifyRole`; services/mail.ts): a title, a message, and what it carries (lib/game/mail.ts says the words). They read and
 * claim it on the site. Sent, the bot says so in the channel: an embed pinging whom it went to (the member, or the notify
 * role), with a button to the site.
 */

const USAGE = (p: string): string =>
  [
    `**${p}mail** \`<@user | all> | <title> | <message> | [rewards]\``,
    'Rewards, separated by commas: `points:5000`, `gems:20`, `tokens:5`, `item:<item id>` (`x3` for 3), `rune:<rune id>` (`x3` for 3), `uw` (a Unique Weapon Ticket), `ut` (a Unique Treasure Ticket), `tp` (a Transcendence Attribute Point (5 TP), `tpx3` for 3), `box:<King’s Raid code>` (a Dispatch Battle Loot, `x3` for 3).',
    `For example: \`${p}mail all | Maintenance | Thanks for waiting! | points:5000, uw\``,
    '`all` is everyone with the notify role.',
  ].join('\n');

/**
 * The server's notify role, and everyone in the server with it whom the bot knows (a member document; each looked up, as the
 * bot doesn't get the whole member list). Null: the server has no notify role.
 */
async function notifyRoleMembers(guild: Guild): Promise<{ roleId: string; userIds: string[] } | null> {
  const roleId = await getNotifyRoleId(guild.id, 'general');
  if (roleId === null || !guild.roles.cache.has(roleId)) return null;
  const members = await Promise.all((await everyoneIn(guild.id)).map((id) => guild.members.fetch(id).catch(() => null)));
  return { roleId, userIds: members.flatMap((member) => (member && !member.user.bot && member.roles.cache.has(roleId) ? [member.id] : [])) };
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
    const role = parsed.to === 'all' ? await notifyRoleMembers(ctx.guild) : null;
    if (parsed.to === 'all' && !role) {
      await ctx.reply('This server has no notify role to send to (`config set notifyRole`).');
      return;
    }
    const sent = await sendMail(ctx.guildId, role ? role.userIds : [parsed.to], { title: parsed.title, message: parsed.message, from: 'admin', attachments: parsed.attachments });

    // Whom it went to, pinged (the notify role, or the member), told they have mail, with a button to the site.
    const ping = role ? { content: `<@&${role.roleId}>`, allowedMentions: { parse: [], roles: [role.roleId] } } : { content: `<@${parsed.to}>`, allowedMentions: { parse: [], users: [parsed.to] } };
    const claim = 'Claim it from the mail icon on the site.';
    const embed = createEmbed()
      .setTitle('📬 You have mail!')
      .setDescription(`**${parsed.title}**\n${parsed.message}`)
      .setFooter({ text: role ? `Sent to ${sent} member${sent === 1 ? '' : 's'} with the notify role. ${claim}` : claim });
    if (parsed.attachments.length > 0) embed.addFields({ name: 'Rewards', value: parsed.attachments.map((one) => `• ${attachmentView(one).text}`).join('\n').slice(0, 1024) });
    const site = webConfig();
    const components = site ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(site.siteUrl).setLabel('Open the site').setEmoji('📬'))] : [];
    await ctx.reply({ ...ping, embeds: [embed], components });
  },
};
