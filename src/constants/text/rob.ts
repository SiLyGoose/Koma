import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';

export const robText = {
  usage: (p: string) => `Use \`${p}rob @user\`.`,
  botTarget: 'You thought...',
  selfTarget: 'Vro..',
  cooldown: (unix: number) => `You can rob again <t:${unix}:R>.`,
  victimBroke: (victim: string) => `${victim} has no ${CURRENCY_EMOJI} to steal.`,
  victimBusy: (victim: string) => `Someone else is robbing ${victim} right now. Try again in a moment.`,
  footer: (chance: string) => `Success chance: ${chance}`,
  /** MP5: the footer when a rob had more than one roll. `chance` is each roll's, `overall` at least one hit. */
  footerRolls: (chance: string, rolls: number, overall: string) => `Success chance: ${chance} x${rolls} (${overall} overall)`,
  /** MP5: which roll of the burst hit. */
  rollHit: (used: number, of: number) => `🔫 Hit on shot ${used} of ${of}.`,
  /** MP5: every roll of the burst missed. */
  rollsMissed: (of: number) => `🔫 All ${of} shots missed.`,
  /** A successful rob with nothing but the roll to it. */
  success: (robber: string, victim: string, stolen: string) =>
    `${robber} robbed ${victim} and got away with ${boldMoney(stolen)}`,
  /** Used instead of `success` when the victim was left with nothing. */
  successEverything: (robber: string, victim: string, stolen: string) =>
    `${robber} robbed ${victim} and got away with ${boldMoney(stolen)} That was everything they had...`,

  /*
   * A successful rob with effects on it reads as a receipt (commands/rob.ts robReceipt): the headline,
   * one line per effect in the order it was applied, what the victim lost, what changed the robber's
   * take after that, and what they kept. Each line is a sentence with its amount in it; a line ending
   * in an emoji or a parenthesis gets no period. The lines it shares with a claim's are in receipt.ts.
   */
  receiptHeadline: (robber: string, victim: string) => `**${robber} robbed ${victim}!**`,
  /** What was rolled before anyone's gear. */
  receiptStole: (amount: string) => `💸 Stole ${boldMoney(amount)}`,
  receiptArmor: (victim: string, amount: string) => `🛡️ ${victim}'s armor reduced by ${boldMoney(amount)}`,
  /** Thoccy Keyboard: `count` robs in the last `hours` hours, this one included, for `rate` more. */
  receiptStreak: (count: number, hours: number, rate: string, amount: string) =>
    `⌨️ Hot streak (${count} rob${count === 1 ? '' : 's'} in ${hours} hours, +${rate}) added ${boldMoney(amount)}`,
  /** Thoccy Keyboard: the victim had failed a rob, so this one took more. */
  receiptVulnerable: (victim: string, amount: string) => `⌨️ ${victim} was vulnerable, adding ${boldMoney(amount)}`,
  /** The D20 rolled a 20: everything so far but the wealth tax, times `multiplier`. */
  receiptD20: (multiplier: string, amount: string) => `🎲 D20 critical (${multiplier}) added ${boldMoney(amount)}`,
  /** The victim held more than `line`, so the rob also took `rate` of what they held over it. */
  receiptWealthTax: (victim: string, line: string, rate: string, amount: string) =>
    `💰 Wealth tax (${rate} of what ${victim} held over ${boldMoney(line)}) added ${boldMoney(amount)}`,
  /** The victim couldn't lose all of it (a rob always leaves them rob.minVictimBalance). */
  receiptShort: (victim: string, amount: string) => `${victim} was short ${boldMoney(amount)}`,
  receiptLost: (victim: string, amount: string) => `${victim} lost ${boldMoney(amount)}`,
  receiptLostEverything: (victim: string, amount: string) => `${victim} lost ${boldMoney(amount)}, everything they had...`,
  /** A Jew Frog wearer who robbed the robber earlier took their share of this rob. `taker` is a mention. */
  receiptRobTaxPaid: (taker: string, amount: string) => `🐸 Rob tax: ${taker} took ${boldMoney(amount)}`,
  /** The last line when nothing changed the take after the victim paid. */
  receiptGotAway: (amount: string) => `You got away with ${boldMoney(amount)}`,
  receiptKept: (amount: string) => `You kept ${boldMoney(amount)}`,
  /** After a slip (Piplup): the penalty the robber paid, or nothing when there was none. */
  receiptSlipLost: (amount: string) => `You lost ${boldMoney(amount)}`,
  receiptSlipNothing: 'You kept nothing.',
  /** Marks left on the victim for later. */
  claimTaxed: (victim: string, rate: string) => `📌 ${victim}'s next claim will be taxed ${rate}.`,
  robTaxed: (victim: string, rate: string) => `📌 ${victim}'s next rob will be taxed ${rate}.`,
  /*
   * A caught rob with effects on its fine reads as a receipt too (commands/rob.ts caughtReceipt): the
   * headline, the base fine, one line per effect on it, and what the robber paid.
   */
  receiptCaughtHeadline: (robber: string, victim: string) => `**${robber} got caught robbing ${victim}!**`,
  receiptFine: (amount: string) => `🚨 Fine of ${boldMoney(amount)}`,
  /** The D20 rolled a 1: the fine after gear, times what the d3 rolled (`multiplier`). */
  receiptD20Fail: (multiplier: string, amount: string) => `🎲 D20 critical fail (${multiplier}) added ${boldMoney(amount)}`,
  receiptPaid: (victim: string, amount: string) => `You paid ${victim} ${boldMoney(amount)}`,
  /** Gear cancelled the whole fine. */
  receiptGearSaved: 'Your gear got you out of the fine.',
  /** Thoccy Keyboard: the robber failed and is vulnerable now. */
  nowVulnerable: (robber: string, rate: string) => `⌨️ Streak broken. ${robber} is vulnerable: the next successful rob against them takes +${rate}.`,
  /**
   * The rob slipped (Piplup): `returned` went back to the victim, plus `penalty` ('' when there was
   * none). Placeholder wording.
   */
  slipped: (victim: string, returned: string, penalty: string) =>
    `<:piplupsmirk:1553135037120250046> ...but slipped! ${boldMoney(returned)} went back to ${victim}${penalty === '' ? '.' : `, plus ${boldMoney(penalty)} for the trouble.`}`,
  /** A caught rob with nothing but the base fine to it. */
  caughtFined: (robber: string, victim: string, fine: string) =>
    `${robber} tried to rob ${victim} but got caught, and paid them a fine of ${boldMoney(fine)}`,
  /** The fine is set to 0, so there was nothing to pay. */
  caughtNothingToFine: (robber: string, victim: string) =>
    `${robber} tried to rob ${victim} but got caught. There was no fine to pay.`,
  /** The robber has fewer points than the base fine. */
  robberTooPoor: (p: string, fine: string, balance: string) =>
    `You need at least ${boldMoney(fine)} to rob, in case you get caught. You have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
};
