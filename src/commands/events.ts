import { isAdmin } from '../config.js';
import { TEXT } from '../constants.js';
import { checkEventChannel, type ChannelProblem } from '../events/channel.js';
import { GAME_EVENTS, eventChances, findEvent, pickEvent } from '../events/registry.js';
import { startEvent } from '../events/runner.js';
import { createEmbed } from '../lib/embed.js';
import { formatPercent, joinLimited } from '../lib/format.js';
import { parseChannelArg } from '../lib/parse.js';
import { getEventInfo, setEventChannel } from '../services/events.js';
import type { Command, CommandContext } from '../discord/types.js';

/** Why a channel can't be used, in words. */
function channelProblemText(problem: ChannelProblem, channelId: string): string {
  if (problem === 'missing') return TEXT.events.channelMissing;
  return problem === 'not_text' ? TEXT.events.channelNotText : TEXT.events.channelNoPermission(`<#${channelId}>`);
}

/** The events channel and every event that can happen, with the chance of each being picked at random. */
async function showStatus(ctx: CommandContext): Promise<void> {
  const info = await getEventInfo(ctx.guildId);
  const embed = createEmbed()
    .setTitle(TEXT.events.statusTitle)
    .addFields(
      { name: TEXT.events.channelField, value: info.channelId === null ? TEXT.events.channelNone : TEXT.events.channelSet(`<#${info.channelId}>`) },
      {
        name: TEXT.events.listField,
        value: joinLimited(eventChances().map(({ event, chance }) => TEXT.events.listLine(event.id, event.label, event.description, formatPercent(chance)))),
      },
    )
    .setFooter({ text: TEXT.events.usage(ctx.prefix) });
  await ctx.reply({ embeds: [embed] });
}

async function chooseChannel(ctx: CommandContext): Promise<void> {
  const arg = ctx.args[1]?.toLowerCase();
  if (arg === 'off' || arg === 'none' || arg === 'disable') {
    const result = await setEventChannel(ctx.user.id, ctx.guildId, null);
    await ctx.reply(result.ok ? TEXT.events.channelOff : TEXT.events.adminOnly);
    return;
  }

  const channelId = parseChannelArg(ctx.args[1]);
  if (channelId === null) {
    await ctx.reply(TEXT.events.channelUsage(ctx.prefix));
    return;
  }
  const checked = await checkEventChannel(ctx.guild, channelId);
  if (!checked.ok) {
    await ctx.reply(channelProblemText(checked.problem, channelId));
    return;
  }
  const result = await setEventChannel(ctx.user.id, ctx.guildId, channelId);
  await ctx.reply(result.ok ? TEXT.events.channelChanged(`<#${channelId}>`) : TEXT.events.adminOnly);
}

async function startNow(ctx: CommandContext): Promise<void> {
  const name = ctx.args.slice(1).join(' ');
  const event = name === '' ? pickEvent() : findEvent(name);
  if (!event) {
    await ctx.reply(TEXT.events.startUnknown(name, GAME_EVENTS.map((e) => `\`${e.id}\``).join(', ')));
    return;
  }

  const result = await startEvent(ctx.guild, event, null);
  if (result.ok) {
    await ctx.reply(TEXT.events.started(event.label, `<#${result.channelId}>`));
    return;
  }
  if (result.reason === 'busy') await ctx.reply(TEXT.events.startBusy);
  else if (result.reason === 'no_channel') await ctx.reply(TEXT.events.startNoChannel(ctx.prefix));
  else await ctx.reply(TEXT.events.startBadChannel);
}

export const events: Command = {
  name: 'events',
  aliases: ['event'],
  description: 'Random events: see them, start one now, or choose the events channel. Bot admin only.',
  usage: 'events [status | start [event] | channel <#channel | off>]',
  slashUsage: 'events status | start | channel | disable',
  adminOnly: true,

  async execute(ctx) {
    if (!isAdmin(ctx.user.id)) {
      await ctx.reply(TEXT.events.adminOnly);
      return;
    }

    const action = ctx.args[0]?.toLowerCase();
    if (action === undefined || action === 'status') await showStatus(ctx);
    else if (action === 'channel') await chooseChannel(ctx);
    else if (action === 'start') await startNow(ctx);
    else await ctx.reply(TEXT.events.usage(ctx.prefix));
  },
};
