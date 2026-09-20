import { TEXT } from '../constants.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { unequipSlot } from '../services/equipment.js';
import { getPrefix } from '../services/settings.js';
import { SLOTS, type Slot } from '../types.js';
import { reply } from './reply.js';
import type { Command } from './types.js';

export const unequip: Command = {
  name: 'unequip',
  description: 'Take off your weapon, your armor, or both.',
  usage: 'unequip weapon|armor|all',

  async execute({ message, args }) {
    const p = getPrefix();
    const choice = args[0]?.toLowerCase();

    let slots: readonly Slot[];
    if (choice === 'all' || choice === 'both') slots = SLOTS;
    else if (choice === 'weapon' || choice === 'armor') slots = [choice];
    else {
      await reply(message, TEXT.unequip.usage(p));
      return;
    }

    const removed: string[] = [];
    for (const slot of slots) {
      const { removedId } = await unequipSlot(message.guildId, message.author.id, slot);
      if (removedId) removed.push(ITEMS_BY_ID.get(removedId)?.name ?? removedId);
    }

    await reply(
      message,
      removed.length > 0
        ? TEXT.unequip.tookOff(removed)
        : choice === 'all' || choice === 'both'
          ? TEXT.unequip.nothingAtAll
          : choice === 'armor'
            ? TEXT.unequip.noArmor
            : TEXT.unequip.noWeapon,
    );
  },
};
