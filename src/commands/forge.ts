import { CONFIG } from '../config.js';
import { SLOT_EMOJI, TEXT } from '../constants/index.js';
import { boldGems } from '../constants/text/currency.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { bonusText, itemEffectiveness } from '../lib/game/items/equipment.js';
import { starString } from '../lib/format.js';
import { getInventory } from '../services/economy/index.js';
import { forgeMasterwork } from '../services/items/forge.js';
import type { ItemDef } from '../types.js';
import type { Command } from '../discord/types.js';
import { resolveItem } from '../discord/item-pick.js';

/** Spend komaGems to forge an R5 copy of a 4-star item into a masterwork, awakening its bonus (services/items/forge.ts). */
export const forge: Command = {
  name: 'forge',
  aliases: ['mw'],
  category: 'items',
  description: 'Forge your R5 copy of a 4-star item into a masterwork with komaGems, awakening its bonus.',
  usage: 'forge <item name>',
  slashUsage: 'forge <item>',
  details:
    'Also `mw`. Forges your highest-refined copy not yet a masterwork, which must be refined to R5 first. A masterwork copy is worn first, sold last, and never used up by a refine.',

  async execute(ctx) {
    const p = ctx.prefix;
    const t = TEXT.forge;
    const query = ctx.args.join(' ').trim();
    if (!query) {
      await ctx.reply(t.askWhich(p, CONFIG.refine.masterworkGems));
      return;
    }

    const owned = (await getInventory(ctx.guildId, ctx.user.id))
      .map((entry) => ITEMS_BY_ID.get(entry.itemId))
      .filter((item): item is ItemDef => item !== undefined);
    const pick = await resolveItem(
      ctx,
      query,
      { ambiguous: TEXT.refine.ambiguous, noSuchItem: TEXT.refine.noSuchItem(p, query) },
      { items: owned, notOwned: (name) => TEXT.refine.notOwned(p, name) },
    );
    if (!pick) return;
    // After a "Did you mean...?", the forge goes on that question's message.
    ctx = pick.ctx;
    const { item } = pick;
    const result = await forgeMasterwork(ctx.guildId, ctx.user.id, item);
    if (!result.ok) {
      if (result.reason === 'no_bonus') await ctx.reply(t.noBonus(item.name));
      else if (result.reason === 'too_low') await ctx.reply(t.tooLow(p, item.name, result.level, result.needed));
      else if (result.reason === 'already') await ctx.reply(t.already(item.name));
      else if (result.reason === 'too_poor') await ctx.reply(t.tooPoor(result.price, result.gems));
      else if (result.reason === 'not_owned') await ctx.reply(TEXT.refine.notOwned(p, item.name));
      else await ctx.reply(t.busy);
      return;
    }

    const bonus = item.bonus!;
    const embed = createEmbed()
      .setTitle(t.title(starString(item.stars), item.name, SLOT_EMOJI[item.slot]))
      .setDescription(t.done(ctx.user.toString(), result.paid, bonusText(item, itemEffectiveness(item, ctx.user.id), bonus.level)))
      .addFields({ name: t.gemsField, value: boldGems(result.gemsLeft), inline: true });
    await ctx.reply({ embeds: [embed] });
  },
};
