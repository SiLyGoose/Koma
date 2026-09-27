import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, MINE_MINES, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { formatMultiplier } from '../lib/format.js';
import type { Command } from '../discord/types.js';
import { siteGameLink, webConfig } from '../web/config.js';

/*
 * `k!mine`: Mines is played on the games' site (web/mine-session.ts, and the Koma-UI repo), so this
 * only says what it is and links there. The link is the same for everyone: the site logs them in
 * with Discord and opens Mines in this server.
 */

export const mine: Command = {
  name: 'mine',
  aliases: ['mines'],
  description: `Stake-style mines on the Koma site: bet ${CURRENCY_NAME}, pick how many mines hide on a 5x5 board, then turn over tiles for gems.`,

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.mine.off);
      return;
    }
    const embed = createEmbed()
      .setTitle(TEXT.mine.title)
      .setDescription(TEXT.mine.intro(MINE_MINES.min, MINE_MINES.max, formatMultiplier(CONFIG.mine.maxMultiplier)))
      .setFooter({ text: TEXT.mine.footer });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'mines', ctx.guildId)).setLabel(TEXT.mine.playButton).setEmoji('💎'),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
