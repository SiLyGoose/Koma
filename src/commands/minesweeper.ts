import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import type { Command } from '../discord/types.js';
import { siteGameLink, webConfig } from '../web/config.js';

/*
 * `k!minesweeper`: minesweeper is played on the games' site (web/games/minesweeper/, and the Koma-UI
 * repo), so this only says what it is and links there. The link is the same for everyone: the site
 * logs them in with Discord and puts them in this server's room, on the board everyone there plays.
 */

export const minesweeper: Command = {
  name: 'minesweeper',
  category: 'adventure',
  aliases: ['ms'],
  description: 'Minesweeper on the Koma site: clear one board together with everyone in the server, on a Beginner, Intermediate or Expert board.',

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.minesweeper.off);
      return;
    }
    const embed = createEmbed().setTitle(TEXT.minesweeper.title).setDescription(TEXT.minesweeper.intro).setFooter({ text: TEXT.minesweeper.footer });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'minesweeper', ctx.guildId)).setLabel(TEXT.minesweeper.playButton).setEmoji('🚩'),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
