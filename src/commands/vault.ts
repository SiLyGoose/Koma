import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier } from '../lib/format.js';
import { getVaultTotals } from '../services/vault.js';
import type { Command } from '../discord/types.js';

/**
 * How much is in this server's vault, and what the next vault game would put up. Who donated and
 * lost the most is on the leaderboard's buttons (commands/leaderboard.ts).
 */
export const vault: Command = {
  name: 'vault',
  category: 'economy',
  description: `See how many ${CURRENCY_NAME} are in the vault, and what the next vault game would put up.`,

  async execute(ctx) {
    const { pool, payout } = await getVaultTotals(ctx.guildId);
    const { multiplier } = CONFIG.events.vault;
    const embed = createEmbed()
      .setTitle(TEXT.vault.commandTitle)
      .setDescription(TEXT.vault.commandInfo(fmt(pool), fmt(Math.round(payout * multiplier)), formatMultiplier(multiplier)));
    await ctx.reply({ embeds: [embed] });
  },
};
