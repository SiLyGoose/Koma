import { TEXT } from '../constants.js';
import { ITEMS } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { buildDatabank } from '../lib/databank.js';
import { getPrefix } from '../services/settings.js';
import { reply } from './reply.js';
import type { Command } from './types.js';

export const databank: Command = {
  name: 'databank',
  aliases: ['items', 'db'],
  description: 'See every item and what it does.',

  async execute({ message }) {
    const pages = buildDatabank(ITEMS);
    const p = getPrefix();

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
