import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier } from '../lib/format.js';
import { getVaultPool } from '../services/vault.js';
import type { Command } from '../discord/types.js';

/**
 * How much is in this server's vault: everything lost to gambling and caught robbers' fines so
 * far, and what the next vault game would put up.
 */
export const vault: Command = {
  name: 'vault',
  description: `See how many ${CURRENCY_NAME} are in the vault, and what the next vault game would put up.`,

  async execute(ctx) {
    const pool = await getVaultPool(ctx.guildId);
    const { multiplier } = CONFIG.events.vault;
    const embed = createEmbed()
      .setTitle(TEXT.vault.commandTitle)
      .setDescription(TEXT.vault.commandInfo(fmt(pool), fmt(Math.round(pool * multiplier)), formatMultiplier(multiplier)));
    await ctx.reply({ embeds: [embed] });
  },
};
