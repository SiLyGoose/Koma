import { TEXT } from '../constants.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { unequipSlot } from '../services/equipment.js';
import { SLOTS, type Slot } from '../types.js';
import type { Command } from './types.js';

export const unequip: Command = {
  name: 'unequip',
  description: 'Take off your weapon, your armor, or both.',
  usage: 'unequip weapon|armor|all',
  slashUsage: 'unequip <slot>',

  async execute(ctx) {
    const { args } = ctx;
    const p = ctx.prefix;
    const choice = args[0]?.toLowerCase();

    let slots: readonly Slot[];
    if (choice === 'all' || choice === 'both') slots = SLOTS;
    else if (choice === 'weapon' || choice === 'armor') slots = [choice];
    else {
      await ctx.reply(TEXT.unequip.usage(p));
      return;
    }

    const removed: string[] = [];
    for (const slot of slots) {
      const { removedId } = await unequipSlot(ctx.guildId, ctx.user.id, slot);
      if (removedId) removed.push(ITEMS_BY_ID.get(removedId)?.name ?? removedId);
    }

    await ctx.reply(removed.length > 0
        ? TEXT.unequip.tookOff(removed)
        : choice === 'all' || choice === 'both'
          ? TEXT.unequip.nothingAtAll
          : choice === 'armor'
            ? TEXT.unequip.noArmor
            : TEXT.unequip.noWeapon,
    );
  },
};
