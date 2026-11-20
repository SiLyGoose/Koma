import { PermissionFlagsBits } from 'discord.js';
import { NOTIFY_ROLES, TEXT } from '../constants/index.js';
import { checkEventChannel } from '../events/channel.js';
import { createEmbed } from '../lib/embed.js';
import { getNewsletterChannelId, getRoleMessageId, setRoleMessageId } from '../services/newsletter.js';
import { getNotifyRoleId, getNotifyRoleIds } from '../services/roles.js';
/** What the bot needs in the newsletter channel to post the role message and put its reactions on it. */
const NEEDED = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
];
/** An emoji without the "show as a picture" mark some of them carry, which Discord doesn't always send back. */
const plain = (emoji) => emoji.replaceAll('️', '');
/** Which notification role `emoji` stands for on the role message, if any. */
export function notifyRoleFor(emoji) {
    if (emoji === null)
        return undefined;
    return NOTIFY_ROLES.find((role) => plain(role.emoji) === plain(emoji));
}
/** The role message, offering `roles`. */
export function roleMessageEmbed(roles) {
    const t = TEXT.newsletter;
    const lines = roles.map((role) => t.rolesLine(role.emoji, role.roleId, t.rolesAbout[role.key]));
    return createEmbed().setTitle(t.rolesTitle).setDescription([t.rolesIntro, '', ...lines].join('\n'));
}
/** The notification roles `guild` has set and still has, in NOTIFY_ROLES' order. */
async function offeredRoles(guild) {
    const ids = await getNotifyRoleIds(guild.id);
    return NOTIFY_ROLES.flatMap(({ key, emoji }) => {
        const roleId = ids[key];
        return roleId !== null && guild.roles.cache.has(roleId) ? [{ key, emoji, roleId }] : [];
    });
}
/**
 * Posts the role message in `channelId`, with a reaction for each notification role the server
 * has, and remembers it. Only once: while the last one posted is still there, nothing is sent.
 */
export async function postRoleMessage(guild, channelId) {
    const roles = await offeredRoles(guild);
    if (roles.length === 0)
        return { ok: false, reason: 'no_roles' };
    const checked = await checkEventChannel(guild, channelId, NEEDED);
    if (!checked.ok)
        return { ok: false, reason: 'no_channel' };
    const me = guild.members.me ?? (await guild.members.fetchMe());
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
        return { ok: false, reason: 'no_manage' };
    const lastId = await getRoleMessageId(guild.id);
    const last = lastId === null ? null : await checked.channel.messages.fetch(lastId).catch(() => null);
    if (last)
        return { ok: false, reason: 'already', url: last.url };
    const message = await checked.channel.send({ embeds: [roleMessageEmbed(roles)], allowedMentions: { parse: [] } });
    await setRoleMessageId(guild.id, message.id);
    for (const role of roles)
        await message.react(role.emoji);
    return { ok: true, url: message.url, tooHigh: roles.filter((role) => !guild.roles.cache.get(role.roleId)?.editable).map((role) => role.roleId) };
}
/**
 * The server's notification roles changed (`config set notifyRole` / `raidRole`): rewrites the role
 * message, if one is up, to name the roles it gives now, with a reaction for any it newly offers.
 * Members keep the roles they already took. A failure is logged, never thrown: the setting itself
 * has changed either way.
 */
export async function refreshRoleMessage(guild) {
    try {
        const [channelId, messageId] = await Promise.all([getNewsletterChannelId(guild.id), getRoleMessageId(guild.id)]);
        if (channelId === null || messageId === null)
            return;
        const checked = await checkEventChannel(guild, channelId, NEEDED);
        const message = checked.ok ? await checked.channel.messages.fetch(messageId).catch(() => null) : null;
        if (!message)
            return;
        const roles = await offeredRoles(guild);
        await message.edit({ embeds: [roleMessageEmbed(roles)], allowedMentions: { parse: [] } });
        for (const role of roles)
            await message.react(role.emoji);
    }
    catch (err) {
        console.error(`Could not update the role message in ${guild.id}:`, err);
    }
}
/**
 * A reaction was put on (`added`) or taken off a message: if it's one of the role message's, gives
 * or takes its role. Anything else (another message, another emoji, the bot's own reactions) is
 * ignored. A failure is logged, never thrown: there's nobody to tell.
 */
export async function handleRoleReaction(reaction, user, added) {
    try {
        const role = notifyRoleFor(reaction.emoji.name);
        const { guildId } = reaction.message;
        if (!role || !guildId || user.id === reaction.client.user.id)
            return;
        if ((await getRoleMessageId(guildId)) !== reaction.message.id)
            return;
        const guild = reaction.client.guilds.cache.get(guildId);
        const roleId = await getNotifyRoleId(guildId, role.key);
        if (!guild || roleId === null || !guild.roles.cache.has(roleId))
            return;
        const member = await guild.members.fetch(user.id);
        if (member.user.bot || member.roles.cache.has(roleId) === added)
            return;
        if (added)
            await member.roles.add(roleId);
        else
            await member.roles.remove(roleId);
    }
    catch (err) {
        console.error(`Could not ${added ? 'give' : 'take'} a notification role for ${user.id}:`, err);
    }
}
//# sourceMappingURL=roles.js.map