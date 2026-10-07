import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatPercent } from '../lib/format.js';
import type { Command } from '../discord/types.js';
import { siteGameLink, webConfig } from '../web/config.js';

/*
 * `k!poker`: Texas hold'em is played on the games' site (web/games/poker/, and the Koma-UI repo), so
 * this only says what it is and links there. The link is the same for everyone: the site logs them
 * in with Discord and opens poker in this server.
 */

export const poker: Command = {
  name: 'poker',
  category: 'casino',
  description: `Texas hold'em on the Koma site: sit down with ${CURRENCY_NAME} as chips and play the table (or bots).`,

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.poker.off);
      return;
    }
    const { smallBlind, bigBlind, minBuyIn, maxBuyIn, rake, rakeCap } = CONFIG.poker;
    const embed = createEmbed()
      .setTitle(TEXT.poker.title)
      .setDescription(TEXT.poker.intro(fmt(smallBlind), fmt(bigBlind), fmt(minBuyIn), fmt(maxBuyIn), formatPercent(rake), fmt(rakeCap)))
      .setFooter({ text: TEXT.poker.footer });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'poker', ctx.guildId)).setLabel(TEXT.poker.playButton).setEmoji('♠️'),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
