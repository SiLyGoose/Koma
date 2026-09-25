import { SLOT_LABELS, TEXT } from '../constants/index.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { canUseItem, describeEffects, describeTotals, equippedItems, itemEffectiveness, totalEffects } from '../lib/game/equipment.js';
import { formatPercent, mentionList, starString } from '../lib/format.js';
import { getEquipment } from '../services/equipment.js';
import { SLOTS } from '../types.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

export const gear: Command = {
  name: 'gear',
  aliases: ['equipment', 'loadout'],
  description: "See what you (or another member) have equipped and what it does.",
  usage: 'gear [@user]',
  slashUsage: 'gear [user]',

  async execute(ctx) {
    const { args } = ctx;
    let target = ctx.user;
    if (args[0]) {
      const resolved = await resolveUserArg(ctx, args[0]);
      if (!resolved) {
        await ctx.reply(memberNotFound(ctx, 'gear @user'));
        return;
      }
      target = resolved;
    }
    const isSelf = target.id === ctx.user.id;
    const equipment = await getEquipment(ctx.guildId, target.id);

    const embed = createEmbed().setTitle(TEXT.gear.title(target.displayName));
    for (const slot of SLOTS) {
      const label = SLOT_LABELS[slot];
      const id = equipment[slot];
      const item = id ? ITEMS_BY_ID.get(id) : undefined;
      if (!item || item.slot !== slot) {
        embed.addFields({
          name: label,
          value: id
            ? TEXT.gear.unknownItem(id)
            : isSelf
              ? TEXT.gear.emptySelf(ctx.prefix)
              : TEXT.gear.emptyOther,
        });
        continue;
      }
      // Someone else's exclusive item works at part strength: show the effects they really get, and say why.
      const share = itemEffectiveness(item, target.id);
      const lines = describeEffects(item, share);
      if (item.usableBy && !canUseItem(item, target.id)) lines.unshift(TEXT.gear.exclusive(mentionList(item.usableBy), formatPercent(share)));
      embed.addFields({
        name: label,
        value: [TEXT.gear.item(item.name, starString(item.stars)), ...lines].join('\n'),
      });
    }

    const totals = describeTotals(totalEffects(equippedItems(equipment), target.id));
    if (totals.length > 0) embed.addBlankField().addFields({ name: TEXT.gear.totalsField, value: totals.join('\n') });

    await ctx.reply({ embeds: [embed] });
  },
};
