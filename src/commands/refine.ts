import { REFINE, TEXT } from '../constants/index.js';
import { ITEMS_BY_ID, findItem } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { describeEffects, itemEffectiveness } from '../lib/game/equipment.js';
import { starString } from '../lib/format.js';
import { getInventory } from '../services/economy/index.js';
import { refineItem } from '../services/refine.js';
import type { ItemDef } from '../types.js';
import type { Command } from '../discord/types.js';

export const refine: Command = {
  name: 'refine',
  description: `Refine an item you own: use up a duplicate of it to raise it one level (up to R${REFINE.maxLevel}, its full strength).`,
  usage: 'refine <item name>',
  slashUsage: 'refine <item>',

  async execute(ctx) {
    const p = ctx.prefix;
    const t = TEXT.refine;
    const query = ctx.args.join(' ').trim();
    if (!query) {
      await ctx.reply(t.askWhich(p));
      return;
    }

    const owned = (await getInventory(ctx.guildId, ctx.user.id))
      .map((entry) => ITEMS_BY_ID.get(entry.itemId))
      .filter((item): item is ItemDef => item !== undefined);
    const lookup = findItem(query, owned);
    if (lookup.kind === 'ambiguous') {
      await ctx.reply(t.ambiguous(lookup.matches.map((item) => item.name)));
      return;
    }
    if (lookup.kind === 'none') {
      const anywhere = findItem(query);
      await ctx.reply(anywhere.kind === 'found' ? t.notOwned(p, anywhere.item.name) : t.noSuchItem(p, query));
      return;
    }

    const { item } = lookup;
    const result = await refineItem(ctx.guildId, ctx.user.id, item);
    if (!result.ok) {
      if (result.reason === 'busy') await ctx.reply(t.busy);
      else if (result.reason === 'maxed') await ctx.reply(t.maxed(item.name, REFINE.maxLevel));
      else if (result.reason === 'no_duplicate') await ctx.reply(t.noDuplicate(item.name, result.level));
      else await ctx.reply(t.notOwned(p, item.name));
      return;
    }

    const share = itemEffectiveness(item, ctx.user.id);
    const effects = (level: number) => describeEffects(item, share, level).join('\n') || t.noEffects;
    const embed = createEmbed()
      .setTitle(t.title(starString(item.stars), item.name))
      .setDescription(t.done(ctx.user.toString(), result.from, result.to, result.duplicatesLeft))
      .addFields(
        { name: t.beforeField(result.from), value: effects(result.from), inline: true },
        { name: t.afterField(result.to), value: effects(result.to), inline: true },
      )
      .setFooter({ text: t.footer(REFINE.maxLevel) });
    await ctx.reply({ embeds: [embed] });
  },
};
