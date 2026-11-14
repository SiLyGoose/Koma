import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';
export const robText = {
    usage: (p) => `Use \`${p}rob @user\`.`,
    botTarget: 'You thought...',
    selfTarget: 'Vro..',
    cooldown: (unix) => `You can rob again <t:${unix}:R>.`,
    victimBroke: (victim) => `${victim} has no ${CURRENCY_EMOJI} to steal.`,
    victimBusy: (victim) => `Someone else is robbing ${victim} right now. Try again in a moment.`,
    footer: (chance) => `Success chance: ${chance}`,
    /** MP5: the footer when a rob had more than one roll. `chance` is each roll's, `overall` at least one hit. */
    footerRolls: (chance, rolls, overall) => `Success chance: ${chance} x${rolls} (${overall} overall)`,
    /** MP5: which roll of the burst hit. */
    rollHit: (used, of) => `🔫 Hit on shot ${used} of ${of}.`,
    /** MP5: every roll of the burst missed. */
    rollsMissed: (of) => `🔫 All ${of} shots missed.`,
    /** A successful rob with nothing but the roll to it. */
    success: (robber, victim, stolen) => `${robber} robbed ${victim} and got away with ${boldMoney(stolen)}`,
    /** Used instead of `success` when the victim was left with nothing. */
    successEverything: (robber, victim, stolen) => `${robber} robbed ${victim} and got away with ${boldMoney(stolen)} That was everything they had...`,
    /*
     * A successful rob with effects on it reads as a receipt (commands/rob.ts robReceipt): the headline,
     * one line per effect in the order it was applied, what the victim lost, what changed the robber's
     * take after that, and what they kept. Each line is a sentence with its amount in it; a line ending
     * in an emoji or a parenthesis gets no period. The lines it shares with a claim's are in receipt.ts.
     */
    receiptHeadline: (robber, victim) => `**${robber} robbed ${victim}!**`,
    /** What was rolled before anyone's gear. */
    receiptStole: (amount) => `💸 Stole ${boldMoney(amount)}`,
    receiptArmor: (victim, amount) => `🛡️ ${victim}'s armor reduced ${boldMoney(amount)}`,
    /** Thoccy Keyboard: `count` robs in the last `hours` hours, this one included, for `rate` more. */
    receiptStreak: (count, hours, rate, amount) => `⌨️ Hot streak (${count} rob${count === 1 ? '' : 's'} in ${hours} hours, +${rate}) added ${boldMoney(amount)}`,
    /** Thoccy Keyboard: the victim had failed a rob, so this one took more. */
    receiptVulnerable: (victim, amount) => `⌨️ ${victim} was vulnerable, adding ${boldMoney(amount)}`,
    /** The D20 rolled a 20: everything so far but the wealth tax, times `multiplier`. */
    receiptD20: (multiplier, amount) => `🎲 D20 critical (${multiplier}) added ${boldMoney(amount)}`,
    /** The victim held more than `line`, so the rob also took `rate` of what they held over it. */
    receiptWealthTax: (victim, line, rate, amount) => `💰 Wealth tax (${rate} of what ${victim} held over ${boldMoney(line)}) added ${boldMoney(amount)}`,
    /** The victim couldn't lose all of it (a rob always leaves them rob.minVictimBalance). */
    receiptShort: (victim, amount) => `${victim} was short ${boldMoney(amount)}`,
    receiptLost: (victim, amount) => `${victim} lost ${boldMoney(amount)}`,
    receiptLostEverything: (victim, amount) => `${victim} lost ${boldMoney(amount)}, everything they had...`,
    /** A Jew Frog wearer who robbed the robber earlier took their share of this rob. `taker` is a mention. */
    receiptRobTaxPaid: (taker, amount) => `🐸 Rob tax: ${taker} took ${boldMoney(amount)}`,
    /** The last line when nothing changed the take after the victim paid. */
    receiptGotAway: (amount) => `You got away with ${boldMoney(amount)}`,
    receiptKept: (amount) => `You kept ${boldMoney(amount)}`,
    /** After a slip (Piplup): the penalty the robber paid, or nothing when there was none. */
    receiptSlipLost: (amount) => `You lost ${boldMoney(amount)}`,
    receiptSlipNothing: 'You kept nothing.',
    /** Marks left on the victim for later. */
    claimTaxed: (victim, rate) => `📌 ${victim}'s next claim will be taxed ${rate}.`,
    robTaxed: (victim, rate) => `📌 ${victim}'s next rob will be taxed ${rate}.`,
    /*
     * A caught rob always reads as a receipt (commands/rob.ts caughtReceipt): the headline, the base
     * fine, one line per effect on it, and what the robber paid.
     */
    receiptCaughtHeadline: (robber, victim) => `**${robber} got caught robbing ${victim}!**`,
    receiptFine: (amount) => `🚨 Fine of ${boldMoney(amount)}`,
    /** The D20 rolled a 1: the fine after gear, times what the d3 rolled (`multiplier`). */
    receiptD20Fail: (multiplier, amount) => `🎲 D20 critical fail (${multiplier}) added ${boldMoney(amount)}`,
    receiptPaid: (victim, amount) => `You paid ${victim} ${boldMoney(amount)}`,
    /** Gear cancelled the whole fine. */
    receiptGearSaved: 'Your gear got you out of the fine.',
    /** The base fine is set to 0, so there was nothing to pay. */
    receiptNoFine: 'There was no fine to pay.',
    /** Thoccy Keyboard: the robber failed and is vulnerable now. */
    nowVulnerable: (robber, rate) => `⌨️ Streak broken. ${robber} is vulnerable: the next successful rob against them takes +${rate}.`,
    /**
     * The rob slipped (Piplup): `returned` went back to the victim, plus `penalty` ('' when there was
     * none). Placeholder wording.
     */
    slipped: (victim, returned, penalty) => `<:piplupsmirk:1553135037120250046> ...but slipped! ${boldMoney(returned)} went back to ${victim}${penalty === '' ? '.' : `, plus ${boldMoney(penalty)} for the trouble.`}`,
    /** The robber has fewer points than the base fine. */
    robberTooPoor: (p, fine, balance) => `You need at least ${boldMoney(fine)} to rob, in case you get caught. You have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
};
//# sourceMappingURL=rob.js.map