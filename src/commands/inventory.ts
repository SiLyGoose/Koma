import { STARS } from '../config.js';
import { TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { ITEMS, ITEMS_BY_ID } from '../data/items.js';
import { fmt, joinLimited, starString } from '../lib/format.js';
import { getInventory } from '../services/economy.js';
import { getEquipment } from '../services/equipment.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

export const inventory: Command = {
  name: 'inventory',
  aliases: ['inv'],
  description: 'See the items you have collected, yours or another member\'s.',
  usage: 'inventory [@user]',
  slashUsage: 'inventory [user]',

  async execute(ctx) {
    const { args } = ctx;
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
    const equippedIds = new Set([equipment.weapon, equipment.armor]);

    if (entries.length === 0) {
      await ctx.reply(target.id === ctx.user.id
          ? TEXT.inventory.emptySelf(ctx.prefix)
          : TEXT.inventory.emptyOther(target.displayName),
      );
      return;
    }

    const owned = new Map<string, number>(entries.map((entry): [string, number] => [entry.itemId, entry.count]));
    const totalItems = entries.reduce((sum, entry) => sum + entry.count, 0);
    const unique = entries.filter((entry) => ITEMS_BY_ID.has(entry.itemId)).length;

    const embed = createEmbed()
      .setTitle(TEXT.inventory.title(target.displayName))
      .setDescription(TEXT.inventory.summary(fmt(totalItems), unique, ITEMS.length));

    for (const stars of [...STARS].reverse()) {
      const tier = ITEMS.filter((item) => item.stars === stars);
      const lines = tier
        .filter((item) => owned.has(item.id))
        .map((item) => {
          const line = equippedIds.has(item.id) ? TEXT.inventory.itemEquipped : TEXT.inventory.item;
          return line(item.name, owned.get(item.id) as number, item.slot);
        });
      embed.addFields({
        name: TEXT.inventory.tierField(starString(stars), lines.length, tier.length),
        value: lines.length > 0 ? joinLimited(lines) : TEXT.inventory.tierEmpty,
      });
    }

    // Items removed from the catalog after being pulled still show up here.
    const unknown = entries
      .filter((entry) => !ITEMS_BY_ID.has(entry.itemId))
      .map((entry) => TEXT.inventory.otherItem(entry.itemId, entry.count));
    if (unknown.length > 0) {
      embed.addFields({ name: TEXT.inventory.otherField, value: joinLimited(unknown) });
    }

    await ctx.reply({ embeds: [embed] });
  },
};
