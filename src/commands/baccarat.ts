import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt } from '../lib/format.js';
import type { Command } from '../discord/types.js';
import { siteGameLink, webConfig } from '../web/config.js';

/*
 * `k!baccarat`: baccarat is played on the games' site (web/baccarat-server.ts, and the Koma-UI repo),
 * so this only says what it is and links there. The link is the same for everyone: the site logs
 * them in with Discord and opens baccarat in this server.
 */

export const baccarat: Command = {
  name: 'baccarat',
  description: `Baccarat on the Koma site: bet ${CURRENCY_NAME} on Player, Banker or Tie, with the Kirin and Phoenix side bets.`,

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.baccarat.off);
      return;
    }
    const { maxBet, payout } = CONFIG.baccarat;
    const embed = createEmbed()
      .setTitle(TEXT.baccarat.title)
      .setDescription(TEXT.baccarat.intro(String(payout.banker), String(payout.tie), String(payout.kirin), String(payout.phoenix), fmt(maxBet)))
      .setFooter({ text: TEXT.baccarat.footer });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'baccarat', ctx.guildId)).setLabel(TEXT.baccarat.playButton).setEmoji('🃏'),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
