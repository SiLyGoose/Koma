import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt } from '../lib/format.js';
import type { Command } from '../discord/types.js';
import { siteGameLink, webConfig } from '../web/config.js';

/*
 * `k!roulette`: roulette is played on the games' site (web/roulette-server.ts, and the Koma-UI repo),
 * so this only says what it is and links there. The link is the same for everyone: the site logs
 * them in with Discord and opens roulette in this server.
 */

export const roulette: Command = {
  name: 'roulette',
  description: `Roulette on the Koma site: bet ${CURRENCY_NAME} on numbers, colours, dozens and more.`,

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.roulette.off);
      return;
    }
    const embed = createEmbed()
      .setTitle(TEXT.roulette.title)
      .setDescription(TEXT.roulette.intro(fmt(CONFIG.roulette.maxBet)))
      .setFooter({ text: TEXT.roulette.footer });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'roulette', ctx.guildId)).setLabel(TEXT.roulette.playButton).setEmoji('🎡'),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
