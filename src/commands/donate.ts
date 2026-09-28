import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, money } from '../lib/format.js';
import { parseBetArg } from '../lib/game/casino/bet.js';
import { donateToVault } from '../services/vault.js';
import type { Command } from '../discord/types.js';

/** Give some of your points to this server's vault, for the next vault game to put up. */
export const donate: Command = {
  name: 'donate',
  category: 'economy',
  description: `Give some of your ${CURRENCY_NAME} to the vault, for the next vault game to put up.`,
  usage: 'donate <amount | all>',
  slashUsage: 'donate amount',

  async execute(ctx) {
    const parsed = parseBetArg(ctx.args);
    if (!parsed.ok) {
      await ctx.reply(parsed.error === 'usage' ? TEXT.vault.donateUsage(ctx.prefix) : TEXT.vault.donateBadAmount);
      return;
    }

    const result = await donateToVault(ctx.guildId, ctx.user.id, parsed.bet);
    if (!result.ok) {
      await ctx.reply(result.balance > 0 ? TEXT.vault.donateTooPoor(fmt(result.balance)) : TEXT.vault.donateNothing);
      return;
    }

    const embed = createEmbed()
      .setTitle(TEXT.vault.donateTitle)
      .setDescription(TEXT.vault.donateDone(ctx.user.toString(), fmt(result.donated), fmt(result.pool)))
      .addFields({ name: TEXT.vault.donateBalanceField, value: money(result.balance), inline: true });
    await ctx.reply({ embeds: [embed] });
  },
};
