import { SLOT_LABELS, TEXT } from '../constants.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { describeEffects, describeTotals, equippedItems, totalEffects } from '../lib/equipment.js';
import { starString } from '../lib/format.js';
import { getEquipment } from '../services/equipment.js';
import { getPrefix } from '../services/settings.js';
import { SLOTS } from '../types.js';
import { reply } from './reply.js';
import { memberNotFound, resolveUserArg } from './resolve.js';
import type { Command } from './types.js';

export const gear: Command = {
  name: 'gear',
  aliases: ['equipment', 'loadout'],
  description: "See what you (or another member) have equipped and what it does.",
  usage: 'gear [@user]',

  async execute({ message, args }) {
    let target = message.author;
    if (args[0]) {
      const resolved = await resolveUserArg(message, args[0]);
      if (!resolved) {
        await reply(message, memberNotFound('gear @user'));
        return;
      }
      target = resolved;
    }
    const isSelf = target.id === message.author.id;
    const equipment = await getEquipment(message.guildId, target.id);

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
              ? TEXT.gear.emptySelf(getPrefix())
              : TEXT.gear.emptyOther,
        });
        continue;
      }
      embed.addFields({
        name: label,
        value: [TEXT.gear.item(item.name, starString(item.stars)), ...describeEffects(item)].join('\n'),
      });
    }

    const totals = describeTotals(totalEffects(equippedItems(equipment)));
    if (totals.length > 0) embed.addBlankField().addFields({ name: TEXT.gear.totalsField, value: totals.join('\n') });

    await reply(message, { embeds: [embed] });
  },
};
