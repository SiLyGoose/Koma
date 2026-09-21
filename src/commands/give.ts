import { isAdmin } from '../config.js';
import { MAX_GIVE_AMOUNT, TEXT } from '../constants.js';
import { ITEMS } from '../data/items.js';
import { fmt, starString } from '../lib/format.js';
import { parseGiveArgs } from '../lib/give.js';
import { giveItems } from '../services/admin.js';
import { getPrefix } from '../services/settings.js';
import { reply } from './reply.js';
import type { Command } from './types.js';

/** Every item id, comma separated, kept short enough for a message. */
function idList(): string {
  const text = ITEMS.map((item) => `\`${item.id}\``).join(', ');
  return text.length > 1500 ? `${text.slice(0, 1500)}...` : text;
}

export const give: Command = {
  name: 'give',
  description: 'Admin only, for testing: give yourself an item by its id.',
  usage: 'give <item id> [amount]',
  adminOnly: true,

  async execute({ message, args }) {
    if (!isAdmin(message.author.id)) {
      await reply(message, TEXT.give.adminOnly);
      return;
    }

    const p = getPrefix();
    const parsed = parseGiveArgs(args, MAX_GIVE_AMOUNT);
    if (!parsed.ok) {
      await reply(
        message,
        parsed.reason === 'bad_amount'
          ? TEXT.give.badAmount(fmt(MAX_GIVE_AMOUNT))
          : `${TEXT.give.usage(p, fmt(MAX_GIVE_AMOUNT))}\n${idList()}`,
      );
      return;
    }

    const result = await giveItems(message.author.id, message.guildId, parsed.itemId, parsed.count);
    if (!result.ok) {
      if (result.reason === 'forbidden') await reply(message, TEXT.give.adminOnly);
      else if (result.reason === 'bad_amount') await reply(message, TEXT.give.badAmount(fmt(MAX_GIVE_AMOUNT)));
      else await reply(message, TEXT.give.unknownItem(parsed.itemId, idList()));
      return;
    }

    await reply(
      message,
      TEXT.give.done(starString(result.item.stars), result.item.name, result.item.id, fmt(result.given), fmt(result.total)),
    );
  },
};
