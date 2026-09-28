import { STARS } from '../config.js';
import { SLOT_EMOJI, SLOT_LABELS, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { ITEMS, ITEMS_BY_ID } from '../data/items.js';
import { fmt, joinLimited, starString } from '../lib/format.js';
import { getInventory } from '../services/economy/index.js';
import { getEquipment } from '../services/items/equipment.js';
import { refineLevel } from '../lib/game/items/refine.js';
import { takeSlot } from '../lib/game/items/slot-filter.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

export const inventory: Command = {
  name: 'inventory',
  category: 'items',
  aliases: ['inv'],
  description: 'See the items you have collected, yours or another member\'s. Add a category (weapon, armor, treasure) to see just those.',
  usage: 'inventory [@user] [category]',
  slashUsage: 'inventory [user] [category]',

  async execute(ctx) {
    // A category word (`weapon`, `armor`, `treasure`) can go before or after the member.
    const { slot, rest: args } = takeSlot(ctx.args);
    let target = ctx.user;
    if (args[0]) {
      const resolved = await resolveUserArg(ctx, args[0]);
      if (!resolved) {
        await ctx.reply(memberNotFound(ctx, 'inventory @user'));
        return;
      }
      target = resolved;
    }

    const [entries, equipment] = await Promise.all([
      getInventory(ctx.guildId, target.id),
      getEquipment(ctx.guildId, target.id),
    ]);
    const equippedIds = new Set([equipment.weapon, equipment.armor, equipment.treasure]);

    if (entries.length === 0) {
      await ctx.reply(target.id === ctx.user.id
          ? TEXT.inventory.emptySelf(ctx.prefix)
          : TEXT.inventory.emptyOther(target.displayName),
      );
      return;
    }

    // With a category, everything below counts only that category's items.
    const catalog = slot === null ? ITEMS : ITEMS.filter((item) => item.slot === slot);
    const shown = slot === null ? entries : entries.filter((entry) => ITEMS_BY_ID.get(entry.itemId)?.slot === slot);
    const owned = new Map<string, number>(shown.map((entry): [string, number] => [entry.itemId, entry.count]));
    const bestLevel = new Map<string, number>(shown.map((entry): [string, number] => [entry.itemId, refineLevel(entry.bestLevel)]));
    const totalItems = shown.reduce((sum, entry) => sum + entry.count, 0);
    const unique = shown.filter((entry) => ITEMS_BY_ID.has(entry.itemId)).length;

    const title = TEXT.inventory.title(target.displayName);
    const embed = createEmbed()
      .setTitle(slot === null ? title : TEXT.inventory.categoryTitle(title, SLOT_LABELS[slot]))
      .setDescription(TEXT.inventory.summary(fmt(totalItems), unique, catalog.length));

    for (const stars of [...STARS].reverse()) {
      const tier = catalog.filter((item) => item.stars === stars);
      if (tier.length === 0) continue;
      const lines = tier
        .filter((item) => owned.has(item.id))
        .map((item) => {
          const line = equippedIds.has(item.id) ? TEXT.inventory.itemEquipped : TEXT.inventory.item;
          return line(item.name, owned.get(item.id) as number, SLOT_EMOJI[item.slot], bestLevel.get(item.id) ?? 1);
        });
      embed.addFields({
        name: TEXT.inventory.tierField(starString(stars), lines.length, tier.length),
        value: lines.length > 0 ? joinLimited(lines) : TEXT.inventory.tierEmpty,
      });
    }

    // Items removed from the catalog after being pulled still show up here (they have no category).
    const unknown = shown
      .filter((entry) => !ITEMS_BY_ID.has(entry.itemId))
      .map((entry) => TEXT.inventory.otherItem(entry.itemId, entry.count));
    if (unknown.length > 0) {
      embed.addFields({ name: TEXT.inventory.otherField, value: joinLimited(unknown) });
    }

    await ctx.reply({ embeds: [embed] });
  },
};
