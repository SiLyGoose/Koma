import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt } from '../lib/format.js';
import type { Command } from '../discord/types.js';
import { siteGameLink, webConfig } from '../web/config.js';

/*
 * `k!duckrace`: the duck race is played on the games' site (web/games/duckrace/server.ts, and the
 * Koma-UI repo), so this only says what it is and links there. The link is the same for everyone:
 * the site logs them in with Discord and opens the duck race in this server.
 */

export const duckrace: Command = {
  name: 'duckrace',
  category: 'casino',
  description: `Duck Race on the Koma site: bet ${CURRENCY_NAME} on one of four ducks and watch them race.`,

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.duckRace.off);
      return;
    }
    const embed = createEmbed()
      .setTitle(TEXT.duckRace.title)
      .setDescription(TEXT.duckRace.intro(String(CONFIG.duckRace.payout), fmt(CONFIG.duckRace.maxBet)))
      .setFooter({ text: TEXT.duckRace.footer });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'duckrace', ctx.guildId)).setLabel(TEXT.duckRace.playButton).setEmoji('🦆'),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
