import { CONFIG, isAdmin } from '../config.js';
import { TEXT } from '../constants.js';
import { GAME_EVENTS, eventChances, findEvent, pickEvent } from '../events/registry.js';
import { startEvent } from '../events/runner.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, formatPercent, joinLimited } from '../lib/format.js';
import { getVaultPool } from '../services/vault.js';
import type { Command, CommandContext } from '../discord/types.js';

/**
 * Every event that can happen, with the chance of each being picked at random. Which channel
 * they spawn in is `k!config`'s business now (the `channel` setting), not shown here.
 */
async function showStatus(ctx: CommandContext): Promise<void> {
  const pool = await getVaultPool(ctx.guildId);
  const embed = createEmbed()
    .setTitle(TEXT.events.statusTitle)
    .addFields(
      { name: TEXT.events.vaultField, value: TEXT.events.vaultInfo(fmt(pool), fmt(Math.round(pool * CONFIG.events.vault.multiplier)), formatMultiplier(CONFIG.events.vault.multiplier)) },
      {
        name: TEXT.events.listField,
        value: joinLimited(eventChances().map(({ event, chance }) => TEXT.events.listLine(event.id, event.label, event.description, formatPercent(chance)))),
      },
    )
    .setFooter({ text: TEXT.events.usage(ctx.prefix) });
  await ctx.reply({ embeds: [embed] });
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
  else if (result.reason === 'no_channel') await ctx.reply(TEXT.events.startNoChannel);
  else await ctx.reply(TEXT.events.startBadChannel);
}

export const events: Command = {
  name: 'events',
  aliases: ['event'],
  description: 'Random events: see every event that can happen, or start one now. Bot admin only.',
  usage: 'events [status | start [event]]',
  slashUsage: 'events status | start',
  adminOnly: true,

  async execute(ctx) {
    if (!isAdmin(ctx.user.id)) {
      await ctx.reply(TEXT.events.adminOnly);
      return;
    }

    const action = ctx.args[0]?.toLowerCase();
    if (action === undefined || action === 'status') await showStatus(ctx);
    else if (action === 'start') await startNow(ctx);
    else await ctx.reply(TEXT.events.usage(ctx.prefix));
  },
};
