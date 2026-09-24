import { FAILURE_TITLES, SUCCESS_TITLES, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, formatPercent, signed } from '../lib/format.js';
import { pickRandom } from '../lib/random.js';
import { rob as robService } from '../services/economy.js';
import { replyWithWheel } from '../animations/wheel-reply.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

function caughtText(
  robber: string,
  victim: string,
  result: { fine: number; owed: number; waived: number; raised: number },
): string {
  if (result.owed === 0 && result.waived > 0) return TEXT.rob.caughtGearSaved(robber, victim);
  if (result.fine === 0) return TEXT.rob.caughtNothingToFine(robber, victim);
  const text =
    result.waived > 0
      ? TEXT.rob.caughtFinedWithGear(robber, victim, fmt(result.fine), fmt(result.waived))
      : TEXT.rob.caughtFined(robber, victim, fmt(result.fine));
  return result.raised > 0 ? `${text}\n${TEXT.rob.fineRaised(fmt(result.raised))}` : text;
}

/** Extra lines under a successful rob: a tax paid out of it, and taxes now waiting on the victim. */
function successNotes(
  victim: string,
  result: {
    stolen: number;
    claimTax: number | null;
    robTax: number | null;
    robTaxPaid: { amount: number; toUserId: string } | null;
    wheel: { multiplier: number } | null;
    gearBonus: number;
    shielded: number;
    wheelBonus: number;
  },
): string {
  const lines: string[] = [];
  // What each effect did to the amount, in the order it was applied.
  if (result.gearBonus > 0) lines.push(TEXT.rob.gearAdded(fmt(result.gearBonus)));
  if (result.gearBonus < 0) lines.push(TEXT.rob.gearCut(fmt(-result.gearBonus)));
  if (result.shielded > 0) lines.push(TEXT.rob.shielded(victim, fmt(result.shielded)));
  if (result.wheel !== null) {
    lines.push(TEXT.wheel.landed(formatMultiplier(result.wheel.multiplier), result.wheelBonus === 0 ? '' : signed(result.wheelBonus)));
  }
  if (result.robTaxPaid !== null) {
    const { amount, toUserId } = result.robTaxPaid;
    lines.push(TEXT.rob.robTaxPaid(`<@${toUserId}>`, fmt(amount), fmt(result.stolen - amount)));
  }
  if (result.claimTax !== null) lines.push(TEXT.rob.claimTaxed(victim, formatPercent(result.claimTax)));
  if (result.robTax !== null) lines.push(TEXT.rob.robTaxed(victim, formatPercent(result.robTax)));
  return lines.map((line) => `\n${line}`).join('');
}

export const rob: Command = {
  name: 'rob',
  description: 'Steal points from another member. You can rob once per hour.',
  usage: 'rob @user',
  slashUsage: 'rob <user>',

  async execute(ctx) {
    const { args } = ctx;
    if (!args[0]) {
      await ctx.reply(TEXT.rob.usage(ctx.prefix));
      return;
    }

    const target = await resolveUserArg(ctx, args[0]);
    if (!target) {
      await ctx.reply(memberNotFound(ctx, 'rob @user'));
      return;
    }
    if (target.bot) {
      await ctx.reply(TEXT.rob.botTarget);
      return;
    }
    if (target.id === ctx.user.id) {
      await ctx.reply(TEXT.rob.selfTarget);
      return;
    }

    const result = await robService(ctx.guildId, ctx.user.id, target.id);

    if (!result.ok) {
      if (result.reason === 'cooldown') {
        await ctx.reply(TEXT.rob.cooldown(result.availableAtUnix));
      } else if (result.reason === 'robber_too_poor') {
        await ctx.reply(TEXT.rob.robberTooPoor(ctx.prefix, fmt(result.fine), fmt(result.balance)));
      } else if (result.reason === 'victim_busy') {
        await ctx.reply(TEXT.rob.victimBusy(target.displayName));
      } else {
        await ctx.reply(TEXT.rob.victimBroke(target.displayName));
      }
      return;
    }

    const embed = createEmbed().setFooter({ text: TEXT.rob.footer(formatPercent(result.chance)) });

    if (result.success) {
      embed
        .setTitle(pickRandom(SUCCESS_TITLES))
        .setDescription(
          (result.victimBalance === 0 ? TEXT.rob.successEverything : TEXT.rob.success)(
            ctx.user.toString(),
            target.toString(),
            fmt(result.stolen),
          ) + successNotes(target.toString(), result),
        );
    } else {
      embed
        .setTitle(pickRandom(FAILURE_TITLES))
        .setDescription(caughtText(ctx.user.toString(), target.toString(), result));
    }

    // Ping only the victim so they know it happened.
    const allowedMentions = { users: [target.id] };

    // A successful rob that spun the wheel plays the wheel animation before showing the result.
    if (result.success && result.wheel) {
      await replyWithWheel(ctx, embed, result.wheel, { allowedMentions });
    } else {
      await ctx.reply({ embeds: [embed], allowedMentions });
    }
  },
};
