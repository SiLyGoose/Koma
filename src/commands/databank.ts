import { TEXT } from '../constants.js';
import { ITEMS, findItem } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { buildDatabank, itemDetail } from '../lib/databank.js';
import { getPrefix } from '../services/settings.js';
import { reply } from './reply.js';
import type { Command } from './types.js';

export const databank: Command = {
  name: 'databank',
  aliases: ['items', 'db'],
  description: 'See every item and what it does. Add an item name or id to see just that one.',
  usage: 'databank [item]',

  async execute({ message, args }) {
    const p = getPrefix();

    // With a name or id: the full details of that one item.
    const query = args.join(' ').trim();
    if (query !== '') {
      const lookup = findItem(query);
      if (lookup.kind === 'none') {
        await reply(message, TEXT.databank.noSuchItem(p, query));
        return;
      }
      if (lookup.kind === 'ambiguous') {
        await reply(message, TEXT.databank.ambiguous(lookup.matches.map((item) => item.name)));
        return;
      }
      const detail = itemDetail(lookup.item);
      const embed = createEmbed().setTitle(detail.title).addFields(detail.fields).setFooter({ text: TEXT.databank.detailFooter(p) });
      if (detail.description !== '') embed.setDescription(detail.description);
      await reply(message, { embeds: [embed] });
      return;
    }

    const pages = buildDatabank(ITEMS);

    // Usually one message. A very long catalog carries on in more messages.
    for (const [index, fields] of pages.entries()) {
      const embed = createEmbed()
        .setTitle(pages.length > 1 ? TEXT.databank.titlePage(TEXT.databank.title, index + 1, pages.length) : TEXT.databank.title)
        .addFields(fields);
      if (index === 0) embed.setDescription(TEXT.databank.description);
      if (index === pages.length - 1) embed.setFooter({ text: TEXT.databank.footer(p) });
      await reply(message, { embeds: [embed] });
    }
  },
};
