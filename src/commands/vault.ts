import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, mention } from '../lib/format.js';
import { getVaultBreakdown } from '../services/vault.js';
import { commandPrefix } from '../discord/slash.js';
import type { Command } from '../discord/types.js';

/**
 * How much is in this server's vault, and what the next vault game would put up; then where its
 * points have come from since a vault game last paid out of it (losses and fines, donations, the
 * hourly growth) and who donated the most in that time.
 */
export const vault: Command = {
  name: 'vault',
  category: 'economy',
  description: `See how many ${CURRENCY_NAME} are in the vault, and what the next vault game would put up.`,

  async execute(ctx) {
    const { pool, losses, donated, grown, carriedOver, claimedAt, donors, donorCount } = await getVaultBreakdown(ctx.guildId);
    const claim = claimedAt ? { at: `<t:${Math.floor(claimedAt.getTime() / 1000)}:R>`, left: fmt(carriedOver) } : undefined;
    const { multiplier } = CONFIG.events.vault;
    const donorLines = donors.map((donor, i) => TEXT.vault.donorLine(i + 1, mention(donor.userId), fmt(donor.amount)));
    if (donorCount > donors.length) donorLines.push(TEXT.vault.moreDonors(donorCount - donors.length));
    const embed = createEmbed()
      .setTitle(TEXT.vault.commandTitle)
      .setDescription(TEXT.vault.commandInfo(fmt(pool), fmt(Math.round(pool * multiplier)), formatMultiplier(multiplier)))
      .addFields(
        { name: TEXT.vault.sourcesField(claim !== undefined), value: TEXT.vault.sources(fmt(losses), fmt(donated), fmt(grown), claim) },
        { name: TEXT.vault.donorsField(claim !== undefined), value: donorLines.length > 0 ? donorLines.join('\n') : TEXT.vault.noDonors(commandPrefix(ctx, 'donate')) },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
