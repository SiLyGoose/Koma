import { isAdmin } from '../config.js';
import { MAX_GIVE_AMOUNT, TEXT } from '../constants/index.js';
import { ITEMS } from '../data/items.js';
import { fmt, starString } from '../lib/format.js';
import { parseGiveArgs } from '../lib/game/give.js';
import { giveItems } from '../services/admin.js';
import type { Command } from '../discord/types.js';

/** Every item id, comma separated, kept short enough for a message. */
function idList(): string {
  const text = ITEMS.map((item) => `\`${item.id}\``).join(', ');
  return text.length > 1500 ? `${text.slice(0, 1500)}...` : text;
}

export const give: Command = {
  name: 'give',
  description: 'Admin only, for testing: give yourself an item by its id.',
  usage: 'give <item id> [amount]',
  slashUsage: 'give <item> [amount]',
  adminOnly: true,

  async execute(ctx) {
    const { args } = ctx;
    if (!isAdmin(ctx.user.id)) {
      await ctx.reply(TEXT.give.adminOnly);
      return;
    }

    const p = ctx.prefix;
    const parsed = parseGiveArgs(args, MAX_GIVE_AMOUNT);
    if (!parsed.ok) {
      await ctx.reply(parsed.reason === 'bad_amount'
          ? TEXT.give.badAmount(fmt(MAX_GIVE_AMOUNT))
          : `${TEXT.give.usage(p, fmt(MAX_GIVE_AMOUNT))}\n${idList()}`,
      );
      return;
    }

    const result = await giveItems(ctx.user.id, ctx.guildId, parsed.itemId, parsed.count);
    if (!result.ok) {
      if (result.reason === 'forbidden') await ctx.reply(TEXT.give.adminOnly);
      else if (result.reason === 'bad_amount') await ctx.reply(TEXT.give.badAmount(fmt(MAX_GIVE_AMOUNT)));
      else await ctx.reply(TEXT.give.unknownItem(parsed.itemId, idList()));
      return;
    }

    await ctx.reply(TEXT.give.done(starString(result.item.stars), result.item.name, result.item.id, fmt(result.given), fmt(result.total)),
    );
  },
};
