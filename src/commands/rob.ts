import { CONFIG } from '../config.js';
import { CURRENCY_NAME, FAILURE_TITLES, ROB_STREAK_WINDOW_MS, SUCCESS_TITLES, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, formatPercent, mention, signed } from '../lib/format.js';
import { pickRandom } from '../lib/random.js';
import type { D20Roll } from '../perks/index.js';
import { rob as robService } from '../services/economy/index.js';
import { replyWithDice } from '../animations/dice-reply.js';
import { replyWithWheel } from '../animations/wheel-reply.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

function caughtText(
  robber: string,
  victim: string,
  result: { fine: number; owed: number; waived: number; raised: number; vulnerable: number | null; rolls: { of: number } | null },
): string {
  // MP5: every shot missed.
  const missed = result.rolls !== null ? `${TEXT.rob.rollsMissed(result.rolls.of)}
` : '';
  return missed + caughtBody(robber, victim, result);
}

function caughtBody(
  robber: string,
  victim: string,
  result: { fine: number; owed: number; waived: number; raised: number; vulnerable: number | null },
): string {
  // Thoccy Keyboard: a failed rob leaves its wearer vulnerable.
  const after = result.vulnerable !== null ? `\n${TEXT.rob.nowVulnerable(robber, formatPercent(result.vulnerable))}` : '';
  if (result.owed === 0 && result.waived > 0) return TEXT.rob.caughtGearSaved(robber, victim) + after;
  if (result.fine === 0) return TEXT.rob.caughtNothingToFine(robber, victim) + after;
  const text =
    result.waived > 0
      ? TEXT.rob.caughtFinedWithGear(robber, victim, fmt(result.fine), fmt(result.waived))
      : TEXT.rob.caughtFined(robber, victim, fmt(result.fine));
  return (result.raised > 0 ? `${text}\n${TEXT.rob.fineRaised(fmt(result.raised))}` : text) + after;
}

/**
 * The D20's line, first since it was rolled first: what it did to the chance, to the fine on a 1, or
 * to the take on a 20. Empty when it didn't roll.
 */
function d20Line(result: { d20: D20Roll | null; chance: number; d20Bonus?: number; d20Extra?: number }): string {
  const { d20 } = result;
  if (!d20) return '';
  const multiplier = formatMultiplier(d20.multiplier);
  const bonus = result.d20Bonus ?? 0;
  const extra = result.d20Extra ?? 0;
  const line =
    d20.kind === 'fail'
      ? TEXT.d20.robFail(d20.roll, d20.bonus ?? 1, formatMultiplier(d20.bonus ?? 1), extra === 0 ? '' : signed(extra))
      : d20.bonus !== null
        ? TEXT.d20.critical(d20.roll, d20.bonus, multiplier, bonus === 0 ? '' : signed(bonus))
        : TEXT.d20.robLanded(d20.roll, multiplier, formatPercent(result.chance));
  return `${line}\n`;
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
    slip: { returned: number; penalty: number } | null;
    streak: { count: number; rate: number; bonus: number } | null;
    vulnerableBonus: number;
    wealthTax: { amount: number; rate: number } | null;
    rolls: { used: number; of: number } | null;
  },
): string {
  const lines: string[] = [];
  // MP5: which shot hit.
  if (result.rolls !== null) lines.push(TEXT.rob.rollHit(result.rolls.used, result.rolls.of));
  // Thoccy Keyboard: the streak and a vulnerable victim, which add to the take first.
  if (result.streak !== null && result.streak.bonus > 0) {
    lines.push(TEXT.rob.streak(result.streak.count, ROB_STREAK_WINDOW_MS / 3_600_000, formatPercent(result.streak.rate), fmt(result.streak.bonus)));
  }
  if (result.vulnerableBonus > 0) lines.push(TEXT.rob.vulnerableTaken(victim, fmt(result.vulnerableBonus)));
  if (result.wealthTax !== null) {
    lines.push(TEXT.rob.wealthTaxed(victim, fmt(CONFIG.rob.wealthTaxThreshold), formatPercent(result.wealthTax.rate), fmt(result.wealthTax.amount)));
  }
  // What each effect did to the amount, in the order it was applied.
  if (result.gearBonus > 0) lines.push(TEXT.rob.gearAdded(fmt(result.gearBonus)));
  if (result.gearBonus < 0) lines.push(TEXT.rob.gearCut(fmt(-result.gearBonus)));
  if (result.shielded > 0) lines.push(TEXT.rob.shielded(victim, fmt(result.shielded)));
  if (result.wheel !== null) {
    lines.push(TEXT.wheel.landed(formatMultiplier(result.wheel.multiplier), result.wheelBonus === 0 ? '' : signed(result.wheelBonus)));
  }
  if (result.robTaxPaid !== null) {
    const { amount, toUserId } = result.robTaxPaid;
    lines.push(TEXT.rob.robTaxPaid(mention(toUserId), fmt(amount), fmt(result.stolen + result.wheelBonus - amount)));
  }
  if (result.claimTax !== null) lines.push(TEXT.rob.claimTaxed(victim, formatPercent(result.claimTax)));
  if (result.robTax !== null) lines.push(TEXT.rob.robTaxed(victim, formatPercent(result.robTax)));
  if (result.slip !== null) {
    const { returned, penalty } = result.slip;
    lines.push(TEXT.rob.slipped(victim, fmt(returned), penalty > 0 ? fmt(penalty) : ''));
  }
  return lines.map((line) => `\n${line}`).join('');
}

export const rob: Command = {
  name: 'rob',
  category: 'economy',
  description: `Steal ${CURRENCY_NAME} from another member. You can rob once per hour.`,
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

    const footer =
      result.rolls !== null
        ? TEXT.rob.footerRolls(formatPercent(result.chance), result.rolls.of, formatPercent(result.overallChance))
        : TEXT.rob.footer(formatPercent(result.chance));
    const embed = createEmbed().setFooter({ text: footer });

    if (result.success) {
      embed
        .setTitle(result.d20?.kind === 'success' ? TEXT.d20.successTitle : pickRandom(SUCCESS_TITLES))
        .setDescription(
          d20Line(result) +
          (result.victimBalance === 0 ? TEXT.rob.successEverything : TEXT.rob.success)(
            ctx.user.toString(),
            target.toString(),
            fmt(result.stolen),
          ) + successNotes(target.toString(), result),
        );
    } else {
      embed
        .setTitle(result.d20?.kind === 'fail' ? TEXT.d20.failTitle : pickRandom(FAILURE_TITLES))
        .setDescription(d20Line(result) + caughtText(ctx.user.toString(), target.toString(), result));
    }

    // Ping only the victim so they know it happened.
    const allowedMentions = { users: [target.id] };

    // A rob that rolled the D20 plays the die's animation (a wheel spun as well still has its line in
    // the text); otherwise a successful rob that spun the wheel plays the wheel's.
    if (result.d20) {
      await replyWithDice(ctx, embed, result.d20, { allowedMentions });
    } else if (result.success && result.wheel) {
      await replyWithWheel(ctx, embed, result.wheel, { allowedMentions });
    } else {
      await ctx.reply({ embeds: [embed], allowedMentions });
    }
  },
};
