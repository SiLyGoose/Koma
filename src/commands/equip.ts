import { TEXT } from '../constants.js';
import { ITEMS_BY_ID, findItem } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { canUseItem, describeEffects } from '../lib/equipment.js';
import { mentionList, starString } from '../lib/format.js';
import { getInventory } from '../services/economy.js';
import { equipItem } from '../services/equipment.js';
import { getPrefix } from '../services/settings.js';
import type { ItemDef } from '../types.js';
import { reply } from './reply.js';
import type { Command } from './types.js';

export const equip: Command = {
  name: 'equip',
  description: 'Equip a weapon or armor you own. You can wear one of each, and a new one replaces the old.',
  usage: 'equip <item name>',

  async execute({ message, args }) {
    const p = getPrefix();
    const query = args.join(' ').trim();
    if (!query) {
      await reply(message, TEXT.equip.askWhich(p));
      return;
    }

    const entries = await getInventory(message.guildId, message.author.id);
    const ownedItems = entries
      .map((entry) => ITEMS_BY_ID.get(entry.itemId))
      .filter((item): item is ItemDef => item !== undefined);

    const lookup = findItem(query, ownedItems);
    if (lookup.kind === 'ambiguous') {
      await reply(message, TEXT.equip.ambiguous(lookup.matches.map((item) => item.name)));
      return;
    }
    if (lookup.kind === 'none') {
      // Tell apart "you don't have it" from "there is no such item".
      const anywhere = findItem(query);
      await reply(
        message,
        anywhere.kind === 'found'
          ? TEXT.equip.notOwned(p, anywhere.item.name)
          : TEXT.equip.noSuchItem(p, query),
      );
      return;
    }

    const { item } = lookup;
    const result = await equipItem(message.guildId, message.author.id, item);
    if (!result.ok) {
      await reply(message, TEXT.equip.notOwned(p, item.name));
      return;
    }
    if (result.alreadyEquipped) {
      await reply(message, TEXT.equip.alreadyEquipped(item.name, item.slot));
      return;
    }

    const replaced = result.previousId ? ITEMS_BY_ID.get(result.previousId) : undefined;
    const embed = createEmbed()
      .setTitle(TEXT.equip.title(starString(item.stars), item.name))
      .setDescription(
        replaced
          ? TEXT.equip.doneReplacing(message.author.toString(), item.slot, replaced.name)
          : TEXT.equip.done(message.author.toString(), item.slot),
      )
      .addFields({ name: TEXT.equip.effectsField, value: describeEffects(item).join('\n') || TEXT.equip.noEffects })
      .setFooter({ text: TEXT.equip.footer(p) });
    // Anyone can wear an exclusive item, but only the members it is for get its effects.
    if (item.usableBy && !canUseItem(item, message.author.id)) {
      embed.addFields({ name: TEXT.equip.exclusiveField, value: TEXT.equip.exclusive(mentionList(item.usableBy)) });
    }
    await reply(message, { embeds: [embed] });
  },
};
