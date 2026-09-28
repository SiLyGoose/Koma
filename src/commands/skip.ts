import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, money } from '../lib/format.js';
import { commandPrefix } from '../discord/slash.js';
import { claimSkip, findSkip, getSkipQuotes, SKIPS, skipMemberCooldown, type MemberSkip } from '../services/skips.js';
import type { SkipId } from '../types.js';
import type { Command, CommandContext } from '../discord/types.js';
import { runExtraRaid } from './raid.js';

/** The skippable things, for messages: "`claim`, `raid`". */
const skipIds = (): string => SKIPS.map((skip) => `\`${skip.id}\``).join(', ');

/** Skips a cooldown on the member's own document, and says how it went. */
async function runMemberSkip(ctx: CommandContext, chosen: MemberSkip, after: (p: string) => string): Promise<void> {
  const wait = TEXT.skip.waits[chosen.id];
  const result = await skipMemberCooldown(ctx.guildId, ctx.user.id, chosen);
  if (!result.ok) {
    if (result.reason === 'not_waiting') await ctx.reply(TEXT.skip.notWaiting(wait));
    else if (result.reason === 'too_poor') await ctx.reply(TEXT.skip.tooPoor(fmt(result.price), fmt(result.balance)));
    else await ctx.reply(TEXT.skip.busy);
    return;
  }
  const embed = createEmbed()
    .setTitle(TEXT.skip.doneTitle)
    .setDescription([TEXT.skip.done(ctx.user.toString(), wait, fmt(result.paid)), after(commandPrefix(ctx, chosen.id))].join('\n'))
    .addFields(
      { name: TEXT.skip.balanceField, value: money(result.balance), inline: true },
      { name: TEXT.skip.nextPriceField, value: money(result.nextPrice), inline: true },
    );
  await ctx.reply({ embeds: [embed] });
}

/** What carrying out each skip does. */
const RUN: Record<SkipId, (ctx: CommandContext) => Promise<void>> = {
  claim: (ctx) => runMemberSkip(ctx, claimSkip, TEXT.skip.claimReady),
  // Pays and starts the extra raid's lobby right away (commands/raid.ts).
  raid: runExtraRaid,
};

/**
 * Pay to skip a cooldown (services/skips.ts). With nothing after it, lists what can be skipped,
 * what each costs right now and whether there's a wait to skip.
 */
export const skip: Command = {
  name: 'skip',
  category: 'economy',
  description: `Pay ${CURRENCY_NAME} to skip a cooldown, like the wait for your next claim or next week's raid.`,
  usage: 'skip [what]',
  slashUsage: 'skip [what]',
  details:
    "A claim skip costs double the one before it that day (prices reset at midnight). A raid skip starts one extra raid for the whole server against another boss, once a week, after the week's raid has been fought. The points paid are gone for good.",

  async execute(ctx) {
    const [what] = ctx.args;

    if (what === undefined) {
      const quotes = await getSkipQuotes(ctx.guildId, ctx.user.id);
      const lines = quotes.map(({ skip: s, quote }) => TEXT.skip.listLine(TEXT.skip.names[s.id], fmt(quote.price), quote.waitingUntil, quote.usedUp));
      const embed = createEmbed()
        .setTitle(TEXT.skip.listTitle)
        .setDescription([TEXT.skip.listInfo(ctx.prefix, skipIds()), '', ...lines].join('\n'));
      await ctx.reply({ embeds: [embed] });
      return;
    }

    const chosen = findSkip(what);
    if (!chosen) {
      await ctx.reply(TEXT.skip.unknown(what, skipIds()));
      return;
    }
    await RUN[chosen.id](ctx);
  },
};
