import { STARS } from '../config.js';
import { SLOT_EMOJI, SLOT_LABELS, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { ITEMS, ITEMS_BY_ID } from '../data/items.js';
import { fmt, joinLimited, starString } from '../lib/format.js';
import { getInventoryStacks } from '../services/economy/index.js';
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

    const stacks = await getInventoryStacks(ctx.guildId, target.id);

    if (stacks.length === 0) {
      await ctx.reply(target.id === ctx.user.id
          ? TEXT.inventory.emptySelf(ctx.prefix)
          : TEXT.inventory.emptyOther(target.displayName),
      );
      return;
    }

    // With a category, everything below counts only that category's items.
    const catalog = slot === null ? ITEMS : ITEMS.filter((item) => item.slot === slot);
    const shown = slot === null ? stacks : stacks.filter((stack) => ITEMS_BY_ID.get(stack.itemId)?.slot === slot);
    const totalItems = shown.reduce((sum, stack) => sum + stack.count, 0);
    const unique = new Set(shown.filter((stack) => ITEMS_BY_ID.has(stack.itemId)).map((stack) => stack.itemId)).size;

    const title = TEXT.inventory.title(target.displayName);
    const embed = createEmbed()
      .setTitle(slot === null ? title : TEXT.inventory.categoryTitle(title, SLOT_LABELS[slot]))
      .setDescription(TEXT.inventory.summary(fmt(totalItems), unique, catalog.length));

    for (const stars of [...STARS].reverse()) {
      const tier = catalog.filter((item) => item.stars === stars);
      if (tier.length === 0) continue;
      // Copies that differ (level, locked, worn) each get a line of their own.
      const ownedItems = tier.filter((item) => shown.some((stack) => stack.itemId === item.id));
      const lines = ownedItems.flatMap((item) =>
        shown
          .filter((stack) => stack.itemId === item.id)
          .map((stack) => (stack.worn ? TEXT.inventory.itemEquipped : TEXT.inventory.item)(item.name, stack.count, SLOT_EMOJI[item.slot], stack.level, stack.locked)),
      );
      embed.addFields({
        name: TEXT.inventory.tierField(starString(stars), ownedItems.length, tier.length),
        value: lines.length > 0 ? joinLimited(lines) : TEXT.inventory.tierEmpty,
      });
    }

    // Items removed from the catalog after being pulled still show up here (they have no category).
    const unknownCounts = new Map<string, number>();
    for (const stack of shown) if (!ITEMS_BY_ID.has(stack.itemId)) unknownCounts.set(stack.itemId, (unknownCounts.get(stack.itemId) ?? 0) + stack.count);
    const unknown = [...unknownCounts].map(([id, count]) => TEXT.inventory.otherItem(id, count));
    if (unknown.length > 0) {
      embed.addFields({ name: TEXT.inventory.otherField, value: joinLimited(unknown) });
    }

    await ctx.reply({ embeds: [embed] });
  },
};
