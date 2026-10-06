import { TEXT } from '../constants/index.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { canUseItem, describeEffects, itemEffectiveness, showsMasterwork } from '../lib/game/items/equipment.js';
import { formatPercent, mentionList, starString } from '../lib/format.js';
import { getInventory } from '../services/economy/index.js';
import { equipItem } from '../services/items/equipment.js';
import type { ItemDef } from '../types.js';
import type { Command } from '../discord/types.js';
import { resolveItem } from '../discord/item-pick.js';

export const equip: Command = {
  name: 'equip',
  category: 'gear',
  description: 'Equip a weapon or armor you own. You can wear one of each, and a new one replaces the old.',
  usage: 'equip <item name>',
  slashUsage: 'equip <item>',

  async execute(ctx) {
    const { args } = ctx;
    const p = ctx.prefix;
    const query = args.join(' ').trim();
    if (!query) {
      await ctx.reply(TEXT.equip.askWhich(p));
      return;
    }

    const entries = await getInventory(ctx.guildId, ctx.user.id);
    const ownedItems = entries
      .map((entry) => ITEMS_BY_ID.get(entry.itemId))
      .filter((item): item is ItemDef => item !== undefined);

    const pick = await resolveItem(
      ctx,
      query,
      { ambiguous: TEXT.equip.ambiguous, noSuchItem: TEXT.equip.noSuchItem(p, query) },
      { items: ownedItems, notOwned: (name) => TEXT.equip.notOwned(p, name) },
    );
    if (!pick) return;
    // After a "Did you mean...?", the answer goes on that question's message.
    ctx = pick.ctx;
    const { item } = pick;
    const result = await equipItem(ctx.guildId, ctx.user.id, item);
    if (!result.ok) {
      await ctx.reply(TEXT.equip.notOwned(p, item.name));
      return;
    }
    if (result.alreadyEquipped) {
      await ctx.reply(TEXT.equip.alreadyEquipped(item.name, item.slot));
      return;
    }

    const share = itemEffectiveness(item, ctx.user.id);
    const replaced = result.previousId ? ITEMS_BY_ID.get(result.previousId) : undefined;
    const embed = createEmbed()
      .setTitle(TEXT.equip.title(starString(item.stars), item.name))
      .setDescription(
        replaced
          ? TEXT.equip.doneReplacing(ctx.user.toString(), item.slot, replaced.name)
          : TEXT.equip.done(ctx.user.toString(), item.slot),
      )
      .addFields({ name: TEXT.equip.effectsField(result.level, showsMasterwork(item, result.level, result.masterwork)), value: describeEffects(item, share, result.level, result.masterwork).join('\n') || TEXT.equip.noEffects })
      .setFooter({ text: TEXT.equip.footer(p) });
    // Anyone can wear an exclusive item, but only the members it is for get all of its effects.
    if (item.usableBy && !canUseItem(item, ctx.user.id)) {
      embed.addFields({ name: TEXT.equip.exclusiveField, value: TEXT.equip.exclusive(mentionList(item.usableBy), formatPercent(share)) });
    }
    await ctx.reply({ embeds: [embed] });
  },
};
