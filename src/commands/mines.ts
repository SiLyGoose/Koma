import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, MINE_MINES, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { formatMultiplier } from '../lib/format.js';
import type { Command } from '../discord/types.js';
import { siteGameLink, webConfig } from '../web/config.js';

/*
 * `k!mines`: Mines is played on the games' site (web/mines-session.ts, and the Koma-UI repo), so this
 * only says what it is and links there. The link is the same for everyone: the site logs them in
 * with Discord and opens Mines in this server.
 */

export const mines: Command = {
  name: 'mines',
  description: `Stake-style mines on the Koma site: bet ${CURRENCY_NAME}, pick how many mines hide on a 5x5 board, then turn over tiles for gems.`,

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.mines.off);
      return;
    }
    const embed = createEmbed()
      .setTitle(TEXT.mines.title)
      .setDescription(TEXT.mines.intro(MINE_MINES.min, MINE_MINES.max, formatMultiplier(CONFIG.mines.maxMultiplier)))
      .setFooter({ text: TEXT.mines.footer });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'mines', ctx.guildId)).setLabel(TEXT.mines.playButton).setEmoji('💎'),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
