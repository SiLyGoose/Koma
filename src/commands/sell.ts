import { TEXT } from '../constants.js';
import { ITEMS_BY_ID, findItem } from '../data/items.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { fmt, joinLimited, starString } from '../lib/format.js';
import { parseSellArgs } from '../lib/sell.js';
import { getInventory } from '../services/economy.js';
import { planSale, sellCopies, type SalePlan, type SaleResult, type SellTarget } from '../services/sell.js';
import type { ItemDef } from '../types.js';
import { CONFIRM_TIMEOUT_MS, askToConfirm } from './confirm.js';
import type { Command } from './types.js';

const lineText = (line: { item: ItemDef; count: number; total: number }) =>
  TEXT.sell.line(starString(line.item.stars), line.item.name, line.count, fmt(line.total));

/** The embed shown after a sale. `remaining` is how many copies of a single item are left (only for selling one). */
function soldEmbed(user: string, result: Extract<SaleResult, { ok: true }>, remaining: number | null): BotEmbed {
  const [first] = result.lines;
  const single = result.lines.length === 1 && first !== undefined && first.count === 1;
  const embed = createEmbed()
    .setTitle(TEXT.sell.soldTitle)
    .setDescription(
      (single && first
        ? TEXT.sell.soldOne(user, starString(first.item.stars), first.item.name, fmt(result.earned))
        : `${TEXT.sell.soldMany(user, result.lines.reduce((sum, line) => sum + line.count, 0), fmt(result.earned))}\n\n${joinLimited(result.lines.map(lineText), 3500)}`) +
        (result.skipped > 0 ? `\n${TEXT.sell.skipped(result.skipped)}` : ''),
    )
    .addFields({ name: TEXT.sell.balanceField, value: fmt(result.balance), inline: true });
  if (remaining !== null) embed.setFooter({ text: TEXT.sell.footerLeft(remaining) });
  return embed;
}

/** The reply to something that couldn't be read as a sale. */
function sellError(p: string, error: 'usage' | 'missing_item' | 'bad_stars' | 'bad_amount', args: readonly string[]): string {
  if (error === 'bad_stars') return TEXT.sell.badStars(p);
  if (error === 'bad_amount') return TEXT.sell.badAmount(p);
  if (error === 'missing_item') {
    // "sell all" and "sell 3" each ask which item, in their own words.
    return /^\d+$/.test((args[0] ?? '').trim()) ? TEXT.sell.askWhichAmount(p) : TEXT.sell.askWhichAll(p);
  }
  return TEXT.sell.usage(p);
}

/** Says why nothing can be sold. */
function refusal(p: string, plan: Extract<SalePlan, { ok: false }>, target: SellTarget): string {
  if (plan.reason === 'not_enough' && target.kind === 'some') {
    return TEXT.sell.notEnough(p, target.item.name, target.amount, plan.available);
  }
  if (target.kind === 'stars') {
    const stars = `${target.stars}-star`;
    return plan.reason === 'not_owned' ? TEXT.sell.noneInTier(stars) : TEXT.sell.onlyEquippedTier(p, stars);
  }
  return plan.reason === 'not_owned' ? TEXT.sell.notOwned(target.item.name) : TEXT.sell.onlyEquipped(p, target.item.name);
}

export const sell: Command = {
  name: 'sell',
  description: 'Sell items you are not wearing for points: one copy, some copies, all copies of an item, or a whole star tier.',
  usage: 'sell <item> | sell <number> <item> | sell all <item> | sell stars <1-4>',
  slashUsage: 'sell one | some | all | stars',

  async execute(ctx) {
    const { args } = ctx;
    const p = ctx.prefix;
    const parsed = parseSellArgs(args);
    if (!parsed.ok) {
      await ctx.reply(sellError(p, parsed.error, args));
      return;
    }
    const { request } = parsed;

    // Work out what is being sold. Items are looked up among the ones the member owns.
    let target: SellTarget;
    if (request.kind === 'stars') {
      target = { kind: 'stars', stars: request.stars };
    } else {
      const entries = await getInventory(ctx.guildId, ctx.user.id);
      const owned = entries.map((entry) => ITEMS_BY_ID.get(entry.itemId)).filter((item): item is ItemDef => item !== undefined);
      const lookup = findItem(request.query, owned);
      if (lookup.kind === 'ambiguous') {
        await ctx.reply(TEXT.sell.ambiguous(lookup.matches.map((item) => item.name)));
        return;
      }
      if (lookup.kind === 'none') {
        // Tell "you don't have it" apart from "there is no such item".
        const anywhere = findItem(request.query);
        await ctx.reply(anywhere.kind === 'found' ? TEXT.sell.notOwned(anywhere.item.name) : TEXT.sell.noSuchItem(p, request.query));
        return;
      }
      target =
        request.kind === 'some' ? { kind: 'some', item: lookup.item, amount: request.amount } : { kind: request.kind, item: lookup.item };
    }

    const plan = await planSale(ctx.guildId, ctx.user.id, target);
    if (!plan.ok) {
      await ctx.reply(refusal(p, plan, target));
      return;
    }

    const user = ctx.user.toString();

    // One copy sells straight away.
    if (target.kind === 'one') {
      const result = await sellCopies(ctx.guildId, ctx.user.id, plan.copyIds);
      if (!result.ok) {
        await ctx.reply(TEXT.sell.nothingLeft);
        return;
      }
      const left = (await getInventory(ctx.guildId, ctx.user.id)).find((entry) => entry.itemId === target.item.id)?.count ?? 0;
      await ctx.reply({ embeds: [soldEmbed(user, result, left)] });
      return;
    }

    // Selling many shows what would be sold and waits for a yes.
    const prompt = createEmbed()
      .setTitle(TEXT.sell.confirmTitle)
      .setDescription(TEXT.sell.confirmDescription(fmt(plan.total), plan.count, joinLimited(plan.lines.map(lineText), 3500)))
      .setFooter({ text: TEXT.sell.confirmFooter(CONFIRM_TIMEOUT_MS / 1000) });
    const outcome = await askToConfirm(ctx, prompt, ctx.user.id, {
      confirm: TEXT.sell.confirmButton,
      cancel: TEXT.sell.cancelButton,
      notYours: TEXT.sell.notYours,
    });

    if (outcome.decision === 'timeout') {
      await outcome.finish([createEmbed().setTitle(TEXT.sell.timedOutTitle).setDescription(TEXT.sell.timedOut)]);
      return;
    }
    if (outcome.decision === 'cancel') {
      await outcome.finish([createEmbed().setTitle(TEXT.sell.cancelledTitle).setDescription(TEXT.sell.cancelled)]);
      return;
    }

    // Sell exactly the copies that were shown (each is checked again as it is sold).
    const result = await sellCopies(ctx.guildId, ctx.user.id, plan.copyIds);
    await outcome.finish(
      result.ok
        ? [soldEmbed(user, result, null)]
        : [createEmbed().setTitle(TEXT.sell.cancelledTitle).setDescription(TEXT.sell.nothingLeft)],
    );
  },
};
