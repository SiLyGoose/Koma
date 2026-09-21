import { TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier } from '../lib/format.js';
import { claimHourly } from '../services/economy.js';
import { replyWithWheel } from './wheel-reply.js';
import type { Command } from './types.js';

export const claim: Command = {
  name: 'claim',
  description: 'Claim your points for this hour.',

  async execute(ctx) {
    const result = await claimHourly(ctx.guildId, ctx.user.id);

    if (!result.ok) {
      await ctx.reply(TEXT.claim.already(result.nextClaimUnix));
      return;
    }

    const embed = createEmbed()
      .setTitle(TEXT.claim.title)
      .setDescription(
        (result.bonus > 0
          ? TEXT.claim.claimedWithGear(ctx.user.toString(), fmt(result.amount), fmt(result.bonus))
          : TEXT.claim.claimed(ctx.user.toString(), fmt(result.amount))) +
          (result.wheel ? `\n${TEXT.wheel.landed(formatMultiplier(result.wheel.multiplier))}` : '') +
          (result.taxed
            ? `\n${TEXT.claim.taxed(`<@${result.taxed.toUserId}>`, fmt(result.taxed.amount), fmt(result.amount - result.taxed.amount))}`
            : ''),
      )
      .addFields(
        { name: TEXT.claim.balanceField, value: fmt(result.balance), inline: true },
        { name: TEXT.claim.nextField, value: TEXT.claim.next(result.nextClaimUnix), inline: true },
      );
    if (result.wheel) {
      await replyWithWheel(ctx, embed, result.wheel);
    } else {
      await ctx.reply({ embeds: [embed] });
    }
  },
};
