import { CONFIG } from '../config.js';
import { CURRENCY_NAME, FAILURE_TITLES, ROB_STREAK_WINDOW_MS, SUCCESS_TITLES, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, formatPercent, mention } from '../lib/format.js';
import { pickRandom } from '../lib/random.js';
import { d20Penalty, type D20Roll } from '../perks/index.js';
import { rob as robService } from '../services/economy/index.js';
import { replyWithDice } from '../animations/dice-reply.js';
import { replyWithWheel } from '../animations/wheel-reply.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

/**
 * The D20's line, first since it was rolled first: what it did to the chance, to the fine on a 1, or
 * to the take on a 20 (what that added to either is on the receipt). Empty when it didn't roll.
 */
function d20Line(result: { d20: D20Roll | null; chance: number }): string {
  const { d20 } = result;
  if (!d20) return '';
  const multiplier = formatMultiplier(d20.multiplier);
  const line =
    d20.kind === 'fail'
      ? TEXT.d20.robFail(d20.roll, d20.bonus ?? 1, formatMultiplier(d20.bonus ?? 1))
      : d20.bonus !== null
        ? TEXT.d20.critical(d20.roll, d20.bonus, multiplier)
        : TEXT.d20.robLanded(d20.roll, multiplier, formatPercent(result.chance));
  return `${line}\n`;
}

/** MP5's line above the receipt: which shot hit, or that every shot missed. Empty with one shot. */
const rollsLine = (result: { success: boolean; rolls: { used: number; of: number } | null }): string =>
  result.rolls === null ? '' : `${result.success ? TEXT.rob.rollHit(result.rolls.used, result.rolls.of) : TEXT.rob.rollsMissed(result.rolls.of)}\n`;

/** What robReceipt needs of a successful rob (services/economy/rob.ts). */
export interface RobReceiptResult {
  stolen: number;
  victimBalance: number;
  rolled: number;
  gearBonus: number;
  shielded: number;
  streak: { count: number; rate: number; bonus: number } | null;
  vulnerableBonus: number;
  d20: D20Roll | null;
  d20Bonus: number;
  wealthTax: { amount: number; rate: number } | null;
  wheel: { multiplier: number } | null;
  wheelBonus: number;
  robTaxPaid: { amount: number; toUserId: string } | null;
  slip: { returned: number; penalty: number } | null;
  claimTax: number | null;
  robTax: number | null;
}

const RULE = '━━━━━━━━━━';

/** A receipt line: its text, and what it added to the amount (negative when it took some off). */
type ReceiptLine = [text: string, amount: number];

/**
 * A successful rob's text, `robber` and `victim` being mentions. With nothing but the roll to it, one
 * sentence. Otherwise a receipt: every effect on what was taken, in the order it was applied, what the
 * victim lost, then what changed the robber's take after that (the wheel, a rob tax) and what they
 * kept. A slip (Piplup) undoes it all, so it only says what was taken, what went back, and what the
 * robber is left with. Marks left on the victim for later go last.
 */
export function robReceipt(robber: string, victim: string, result: RobReceiptResult): string {
  const lost = fmt(result.stolen);
  const marks: string[] = [];
  if (result.claimTax !== null) marks.push(TEXT.rob.claimTaxed(victim, formatPercent(result.claimTax)));
  if (result.robTax !== null) marks.push(TEXT.rob.robTaxed(victim, formatPercent(result.robTax)));
  const withMarks = (text: string): string => (marks.length > 0 ? `${text}\n\n${marks.join('\n')}` : text);

  if (result.slip !== null) {
    const { returned, penalty } = result.slip;
    return withMarks(
      [
        TEXT.rob.receiptHeadline(robber, victim),
        '',
        TEXT.rob.receiptLost(victim, lost),
        TEXT.rob.slipped(victim, fmt(returned), penalty > 0 ? fmt(penalty) : ''),
        RULE,
        penalty > 0 ? TEXT.rob.receiptSlipLost(fmt(penalty)) : TEXT.rob.receiptSlipNothing,
      ].join('\n'),
    );
  }

  // What the victim paid, step by step.
  const taken: ReceiptLine[] = [];
  if (result.gearBonus > 0) taken.push([TEXT.rob.receiptGearAdded(fmt(result.gearBonus)), result.gearBonus]);
  if (result.gearBonus < 0) taken.push([TEXT.rob.receiptGearCut(fmt(-result.gearBonus)), result.gearBonus]);
  if (result.shielded > 0) taken.push([TEXT.rob.receiptArmor(victim, fmt(result.shielded)), -result.shielded]);
  const { streak } = result;
  if (streak !== null && streak.bonus > 0) {
    taken.push([TEXT.rob.receiptStreak(streak.count, ROB_STREAK_WINDOW_MS / 3_600_000, formatPercent(streak.rate), fmt(streak.bonus)), streak.bonus]);
  }
  if (result.vulnerableBonus > 0) taken.push([TEXT.rob.receiptVulnerable(victim, fmt(result.vulnerableBonus)), result.vulnerableBonus]);
  if (result.d20Bonus > 0 && result.d20) taken.push([TEXT.rob.receiptD20(formatMultiplier(result.d20.multiplier), fmt(result.d20Bonus)), result.d20Bonus]);
  const { wealthTax } = result;
  if (wealthTax !== null) {
    const line = fmt(CONFIG.rob.wealthTaxThreshold);
    taken.push([TEXT.rob.receiptWealthTax(victim, line, formatPercent(wealthTax.rate), fmt(wealthTax.amount)), wealthTax.amount]);
  }
  // A victim who couldn't pay it all (the steps add up to more than moved).
  const short = result.stolen - taken.reduce((sum, [, amount]) => sum + amount, result.rolled);
  if (short < 0) taken.push([TEXT.rob.receiptShort(victim, fmt(-short)), short]);

  // What changed the robber's take after that.
  const after: ReceiptLine[] = [];
  if (result.wheel !== null) {
    const multiplier = formatMultiplier(result.wheel.multiplier);
    const bonus = result.wheelBonus;
    const text =
      bonus > 0 ? TEXT.rob.receiptWheelAdded(multiplier, fmt(bonus)) : bonus < 0 ? TEXT.rob.receiptWheelCut(multiplier, fmt(-bonus)) : TEXT.rob.receiptWheelNothing(multiplier);
    after.push([text, bonus]);
  }
  if (result.robTaxPaid !== null) {
    const { amount, toUserId } = result.robTaxPaid;
    after.push([TEXT.rob.receiptRobTaxPaid(mention(toUserId), fmt(amount)), -amount]);
  }

  if (taken.length === 0 && after.length === 0) {
    return withMarks((result.victimBalance === 0 ? TEXT.rob.successEverything : TEXT.rob.success)(robber, victim, lost));
  }
  const lines = [TEXT.rob.receiptHeadline(robber, victim), '', TEXT.rob.receiptStole(fmt(result.rolled))];
  for (const [text] of taken) lines.push(text);
  lines.push(RULE);
  if (after.length === 0) {
    lines.push(TEXT.rob.receiptGotAway(lost));
    if (result.victimBalance === 0) lines.push(TEXT.rob.receiptLostEverything(victim, lost));
  } else {
    lines.push(result.victimBalance === 0 ? TEXT.rob.receiptLostEverything(victim, lost) : TEXT.rob.receiptLost(victim, lost));
    for (const [text] of after) lines.push(text);
    lines.push(RULE);
    const kept = result.stolen + after.reduce((sum, [, amount]) => sum + amount, 0);
    lines.push(TEXT.rob.receiptKept(fmt(kept)));
  }
  return withMarks(lines.join('\n'));
}

/** What caughtReceipt needs of a caught rob (services/economy/rob.ts). */
export interface RobCaughtResult {
  fine: number;
  owed: number;
  vulnerable: number | null;
  d20: D20Roll | null;
}

/**
 * A caught rob's text, `robber` and `victim` being mentions. With nothing but the base fine to it, one
 * sentence. Otherwise a receipt like robReceipt's: the base fine, every effect on it in the order it
 * was applied, and what the robber paid. Marks left on the robber for later go last.
 */
export function caughtReceipt(robber: string, victim: string, result: RobCaughtResult): string {
  // Thoccy Keyboard: a failed rob leaves its wearer vulnerable.
  const withMarks = (text: string): string =>
    result.vulnerable !== null ? `${text}\n\n${TEXT.rob.nowVulnerable(robber, formatPercent(result.vulnerable))}` : text;

  const base = CONFIG.rob.failFine;
  const steps: ReceiptLine[] = [];
  const gear = result.owed - base;
  if (gear > 0) steps.push([TEXT.rob.receiptGearAdded(fmt(gear)), gear]);
  if (gear < 0) steps.push([TEXT.rob.receiptGearCut(fmt(-gear)), gear]);
  const { d20 } = result;
  if (d20?.kind === 'fail' && d20.bonus !== null) {
    const added = d20Penalty(result.owed, d20) - result.owed;
    if (added > 0) steps.push([TEXT.rob.receiptD20Fail(formatMultiplier(d20.bonus), fmt(added)), added]);
  }
  // A robber who couldn't pay it all.
  const short = result.fine - steps.reduce((sum, [, amount]) => sum + amount, base);
  if (short < 0) steps.push([TEXT.rob.receiptShort(robber, fmt(-short)), short]);

  if (steps.length === 0) {
    return withMarks(result.fine === 0 ? TEXT.rob.caughtNothingToFine(robber, victim) : TEXT.rob.caughtFined(robber, victim, fmt(result.fine)));
  }
  const lines = [TEXT.rob.receiptCaughtHeadline(robber, victim), '', TEXT.rob.receiptFine(fmt(base))];
  for (const [text] of steps) lines.push(text);
  lines.push(RULE);
  lines.push(result.fine === 0 ? TEXT.rob.receiptGearSaved : TEXT.rob.receiptPaid(victim, fmt(result.fine)));
  return withMarks(lines.join('\n'));
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
        .setDescription(d20Line(result) + rollsLine(result) + robReceipt(ctx.user.toString(), target.toString(), result));
    } else {
      embed
        .setTitle(result.d20?.kind === 'fail' ? TEXT.d20.failTitle : pickRandom(FAILURE_TITLES))
        .setDescription(d20Line(result) + rollsLine(result) + caughtReceipt(ctx.user.toString(), target.toString(), result));
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
