import { TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, money, signed } from '../lib/format.js';
import { claimHourly } from '../services/economy/index.js';
import { replyWithDice } from '../animations/dice-reply.js';
import { replyWithWheel } from '../animations/wheel-reply.js';
import type { Command } from '../discord/types.js';

export const claim: Command = {
  name: 'claim',
  description: 'Claim your points for this hour.',

  async execute(ctx) {
    const result = await claimHourly(ctx.guildId, ctx.user.id);

    if (!result.ok) {
      await ctx.reply(TEXT.claim.already(result.nextClaimUnix));
      return;
    }

    const user = ctx.user.toString();
    const { d20, wheel, wheelBonus, d20Bonus, stonks, stonksBonus } = result;
    const failed = d20?.kind === 'fail';

    // What happened, in the order it happened: the claim, the wheel, then the D20.
    const lines: string[] = [
      failed && d20
        ? TEXT.d20.fail(user, d20.roll)
        : result.bonus > 0
          ? TEXT.claim.claimedWithGear(user, fmt(result.amount), fmt(result.bonus))
          : TEXT.claim.claimed(user, fmt(result.amount)),
    ];
    // Each line says how many points the effect added (or took away), so the changes add up to the claim.
    if (wheel && !failed) lines.push(TEXT.wheel.landed(formatMultiplier(wheel.multiplier), wheelBonus === 0 ? '' : signed(wheelBonus)));
    if (d20 && !failed) {
      const multiplier = formatMultiplier(d20.multiplier);
      const change = d20Bonus === 0 ? '' : signed(d20Bonus);
      lines.push(d20.kind === 'success' ? TEXT.d20.critical(d20.roll, multiplier, change) : TEXT.d20.landed(d20.roll, multiplier, change));
    }
    if (stonks) lines.push(TEXT.stonks.landed(formatMultiplier(stonks), stonksBonus === 0 ? '' : signed(stonksBonus)));
    if (result.bonusLeft) lines.push(TEXT.d20.claimAgain);
    if (result.taxed) {
      lines.push(TEXT.claim.taxed(`<@${result.taxed.toUserId}>`, fmt(result.taxed.amount), fmt(result.amount - result.taxed.amount)));
    }

    const embed = createEmbed()
      .setTitle(failed ? TEXT.d20.failTitle : d20?.kind === 'success' ? TEXT.d20.successTitle : TEXT.claim.title)
      .setDescription(lines.join('\n'))
      .addFields(
        { name: TEXT.claim.balanceField, value: money(result.balance), inline: true },
        {
          name: TEXT.claim.nextField,
          value: result.bonusLeft ? TEXT.d20.nextBonus(result.nextClaimUnix) : TEXT.claim.next(result.nextClaimUnix),
          inline: true,
        },
      );
    if (result.extra) embed.setFooter({ text: TEXT.d20.bonusFooter });

    // The die takes the animation if it rolled (a member with both a wheel and a die, which only
    // the admin can be, still sees the wheel's line in the text); otherwise the wheel does.
    if (d20) {
      await replyWithDice(ctx, embed, d20);
    } else if (wheel) {
      await replyWithWheel(ctx, embed, wheel);
    } else {
      await ctx.reply({ embeds: [embed] });
    }
  },
};
