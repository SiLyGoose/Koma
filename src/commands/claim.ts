import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, mention, money } from '../lib/format.js';
import { gearLines, type ReceiptLine, type TreasureStep, wheelLine } from '../lib/receipt.js';
import type { D20Roll, WheelSpin } from '../perks/index.js';
import { claimHourly } from '../services/economy/index.js';
import { claimSkip } from '../services/skips.js';
import { commandPrefix } from '../discord/slash.js';
import { replyWithDice } from '../animations/dice-reply.js';
import { replyWithWheel } from '../animations/wheel-reply.js';
import type { Command } from '../discord/types.js';

/** What claimReceipt needs of a claim (services/economy/claim.ts). */
export interface ClaimReceiptResult {
  amount: number;
  rolled: number;
  bonus: number;
  treasure: TreasureStep | null;
  wheel: Pick<WheelSpin, 'multiplier'> | null;
  wheelBonus: number;
  d20: D20Roll | null;
  d20Bonus: number;
  d20Penalty: number;
  stonks: number | null;
  stonksBonus: number;
  taxed: { amount: number; toUserId: string } | null;
}

/** The D20's line: what it did to the claim, or that a critical fail took all of it. */
function d20Step(d20: D20Roll, bonus: number): ReceiptLine {
  if (d20.kind === 'fail') return [TEXT.claim.receiptD20Fail(d20.roll, fmt(-bonus)), bonus];
  const multiplier = formatMultiplier(d20.multiplier);
  const text =
    bonus > 0
      ? TEXT.claim.receiptD20Added(d20.roll, multiplier, fmt(bonus))
      : bonus < 0
        ? TEXT.claim.receiptD20Cut(d20.roll, multiplier, fmt(-bonus))
        : TEXT.claim.receiptD20Nothing(d20.roll, multiplier);
  return [text, bonus];
}

/**
 * A claim's text, `user` being a mention. With nothing but the roll to it, one sentence. Otherwise a
 * receipt like a rob's: every effect on the claim, in the order it was applied (gear, the wheel, the
 * D20, STONKS!), what was claimed, then what changed it after that (a claim tax, or on a critical
 * fail what the d3 made the member pay the vault) and what they kept or lost.
 */
export function claimReceipt(user: string, result: ClaimReceiptResult): string {
  const { d20, taxed } = result;
  const RULE = TEXT.receipt.rule;

  const steps = gearLines(result.bonus, result.treasure);
  if (result.wheel) steps.push(wheelLine(result.wheel.multiplier, result.wheelBonus));
  if (d20) steps.push(d20Step(d20, result.d20Bonus));
  if (result.stonks !== null && result.stonksBonus > 0) {
    steps.push([TEXT.claim.receiptStonks(formatMultiplier(result.stonks), fmt(result.stonksBonus)), result.stonksBonus]);
  }
  if (steps.length === 0 && taxed === null) return TEXT.claim.claimed(user, fmt(result.amount));

  const failed = d20?.kind === 'fail';
  const lines = [failed ? TEXT.claim.receiptFailHeadline(user) : TEXT.claim.receiptHeadline(user), '', TEXT.claim.receiptRolled(fmt(result.rolled))];
  for (const [text] of steps) lines.push(text);
  lines.push(RULE);

  // A critical fail claims nothing, and the d3 sets what the member pays the vault.
  if (failed) {
    const bonus = d20.bonus ?? 1;
    lines.push(TEXT.claim.receiptClaimedNothing);
    if (result.d20Penalty > 0) {
      lines.push(TEXT.claim.receiptPenalty(bonus, formatMultiplier(bonus), fmt(result.d20Penalty)), RULE, TEXT.claim.receiptLost(fmt(result.d20Penalty)));
    } else {
      lines.push(TEXT.claim.receiptPenaltyNothing(bonus));
    }
    return lines.join('\n');
  }

  lines.push(TEXT.claim.receiptClaimed(fmt(result.amount)));
  if (taxed !== null) {
    lines.push(TEXT.claim.receiptTaxPaid(mention(taxed.toUserId), fmt(taxed.amount)), RULE, TEXT.claim.receiptKept(fmt(result.amount - taxed.amount)));
  }
  return lines.join('\n');
}

export const claim: Command = {
  name: 'claim',
  category: 'economy',
  description: `Claim your ${CURRENCY_NAME} for this hour.`,

  async execute(ctx) {
    const result = await claimHourly(ctx.guildId, ctx.user.id);

    if (!result.ok) {
      const { price } = await claimSkip.quote(ctx.guildId, ctx.user.id, Date.now());
      await ctx.reply(`${TEXT.claim.already(result.nextClaimUnix)}\n${TEXT.skip.claimHint(commandPrefix(ctx, 'skip'), fmt(price))}`);
      return;
    }

    const { d20, wheel } = result;
    const failed = d20?.kind === 'fail';

    const embed = createEmbed()
      .setTitle(failed ? TEXT.d20.failTitle : d20?.kind === 'success' ? TEXT.d20.successTitle : TEXT.claim.title)
      .setDescription(claimReceipt(ctx.user.toString(), result))
      .addFields(
        { name: TEXT.claim.balanceField, value: money(result.balance), inline: true },
        { name: TEXT.claim.nextField, value: TEXT.claim.next(result.nextClaimUnix), inline: true },
      );

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
