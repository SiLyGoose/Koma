import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, mention } from '../lib/format.js';
import { getVaultBreakdown } from '../services/vault.js';
import { commandPrefix } from '../discord/slash.js';
import type { Command } from '../discord/types.js';

/**
 * How much is in this server's vault, and what the next vault game would put up; then where its
 * points have come from (losses and fines, donations, the hourly growth) and who donated the most.
 */
export const vault: Command = {
  name: 'vault',
  category: 'economy',
  description: `See how many ${CURRENCY_NAME} are in the vault, and what the next vault game would put up.`,

  async execute(ctx) {
    const { pool, losses, donated, grown, donors, donorCount } = await getVaultBreakdown(ctx.guildId);
    const { multiplier } = CONFIG.events.vault;
    const donorLines = donors.map((donor, i) => TEXT.vault.donorLine(i + 1, mention(donor.userId), fmt(donor.amount)));
    if (donorCount > donors.length) donorLines.push(TEXT.vault.moreDonors(donorCount - donors.length));
    const embed = createEmbed()
      .setTitle(TEXT.vault.commandTitle)
      .setDescription(TEXT.vault.commandInfo(fmt(pool), fmt(Math.round(pool * multiplier)), formatMultiplier(multiplier)))
      .addFields(
        { name: TEXT.vault.sourcesField, value: TEXT.vault.sources(fmt(losses), fmt(donated), fmt(grown)) },
        { name: TEXT.vault.donorsField, value: donorLines.length > 0 ? donorLines.join('\n') : TEXT.vault.noDonors(commandPrefix(ctx, 'donate')) },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
