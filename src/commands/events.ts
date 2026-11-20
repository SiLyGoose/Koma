import { isAdmin } from '../config.js';
import { EVENTS_LIST, TEXT } from '../constants/index.js';
import { paginate } from '../discord/paginate.js';
import { GAME_EVENTS, eventChances, findEvent, pickEvent } from '../events/registry.js';
import { startEvent } from '../events/runner.js';
import type { GameEvent } from '../events/types.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { formatPercent } from '../lib/format.js';
import type { Command, CommandContext } from '../discord/types.js';

/** One event on the list, with its chance of being picked at random. */
export type EventEntry = { event: GameEvent; chance: number };

/** `entries` in pages of `size`, in the order given (at least one page, empty when there are no events). */
export function eventPages(entries: readonly EventEntry[], size: number = EVENTS_LIST.pageSize): EventEntry[][] {
  const pages: EventEntry[][] = [];
  for (let i = 0; i < entries.length; i += size) pages.push(entries.slice(i, i + size));
  return pages.length > 0 ? pages : [[]];
}

/** Page `index` (from 0) of `pageCount`: an embed field per event, so each one's whole description fits. `hint` goes in the footer. */
export function eventsPageEmbed(page: readonly EventEntry[], index: number, pageCount: number, hint: string): BotEmbed {
  return createEmbed()
    .setTitle(TEXT.events.statusTitle)
    .addFields(page.map(({ event, chance }) => ({ name: TEXT.events.entryName(event.label, formatPercent(chance)), value: TEXT.events.entryValue(event.id, event.description) })))
    .setFooter({ text: TEXT.events.pageFooter(index + 1, pageCount, hint) });
}

/**
 * Every event that can happen, with the chance of each being picked at random, EVENTS_LIST.pageSize
 * a page with Previous/Next to flip through. Which channel they spawn in is `k!config`'s business
 * (the `channel` setting), not shown here.
 */
// The vault's size is the `vault` command's job (commands/vault.ts).
async function showStatus(ctx: CommandContext): Promise<void> {
  const pages = eventPages(eventChances());
  const hint = isAdmin(ctx.user.id) ? TEXT.events.usage(ctx.prefix) : TEXT.events.footerOthers;
  await paginate(
    ctx,
    pages.length,
    (index) => ({ embeds: [eventsPageEmbed(pages[index] ?? [], index, pages.length, hint)] }),
    ctx.user.id,
    { previous: TEXT.events.previousButton, next: TEXT.events.nextButton, notYours: TEXT.events.notYours },
    EVENTS_LIST.idleMs,
  );
}

async function startNow(ctx: CommandContext): Promise<void> {
  if (!isAdmin(ctx.user.id)) {
    await ctx.reply(TEXT.events.adminOnly);
    return;
  }

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
  category: 'adventure',
  aliases: ['event'],
  description: 'Random events: see every event that can happen. Only the bot admin can start one.',
  usage: 'events [status | start [event]]',
  slashUsage: 'events status | start',

  // Anyone can see the list; only starting an event is admin only (checked in startNow).
  async execute(ctx) {
    const action = ctx.args[0]?.toLowerCase();
    if (action === undefined || action === 'status') await showStatus(ctx);
    else if (action === 'start') await startNow(ctx);
    else await ctx.reply(TEXT.events.usage(ctx.prefix));
  },
};
