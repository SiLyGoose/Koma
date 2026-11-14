import { boldMoney } from './currency.js';
export const claimText = {
    already: (unix) => `You already claimed this hour. Come back <t:${unix}:R>`,
    title: 'Hourly claim',
    /*
     * A claim always reads as a receipt (commands/claim.ts claimReceipt), like a rob's: the
     * headline, one line per effect in the order it was applied, what was claimed, what changed it after
     * that (a claim tax, a D20 penalty) and what the member kept. The lines it shares with a rob's are in
     * receipt.ts.
     */
    receiptHeadline: (user) => `**${user} claimed!**`,
    /** Instead of the headline when the D20 rolled a critical fail. */
    receiptFailHeadline: (user) => `**${user}'s claim fell through!**`,
    /** What was rolled before any gear. */
    receiptRolled: (amount) => `💸 Claimed ${boldMoney(amount)}`,
    /** The D20 rolled 2 or up: `multiplier` like "1.3x", or the bonus die's like "3x" on a critical success. */
    receiptD20Added: (roll, multiplier, amount) => `🎲 D20 rolled ${roll} (${multiplier}) added ${boldMoney(amount)}`,
    receiptD20Cut: (roll, multiplier, amount) => `🎲 D20 rolled ${roll} (${multiplier}) took ${boldMoney(amount)}`,
    receiptD20Nothing: (roll, multiplier) => `🎲 D20 rolled ${roll} (${multiplier}) changed nothing.`,
    /** The D20 rolled a critical fail: the whole claim is gone. */
    receiptD20Fail: (roll, amount) => `🎲 D20 rolled ${roll}, a critical fail, and took all ${boldMoney(amount)}`,
    /** STONKS!: `multiplier` from how long since the last claim, like "6.3x". */
    receiptStonks: (multiplier, amount) => `📈 STONKS! (${multiplier}) added ${boldMoney(amount)}`,
    /** A Coughing Baby wearer who robbed the member took part of this claim. `taker` is a mention. */
    receiptTaxPaid: (taker, amount) => `👶 Claim tax: ${taker} took ${boldMoney(amount)}`,
    receiptClaimed: (amount) => `You claimed ${boldMoney(amount)}`,
    receiptClaimedNothing: 'You claimed nothing.',
    /** After a critical fail: what the bonus die rolled (`multiplier` like "3x") and what the member paid the vault. */
    receiptPenalty: (bonus, multiplier, amount) => `🎲 The d3 rolled ${bonus} (${multiplier}): you paid the vault ${boldMoney(amount)}`,
    /** After a critical fail, when the member had nothing to pay the vault with. */
    receiptPenaltyNothing: (bonus) => `🎲 The d3 rolled ${bonus}, but you had nothing to pay the vault with.`,
    receiptKept: (amount) => `You kept ${boldMoney(amount)}`,
    receiptLost: (amount) => `You lost ${boldMoney(amount)}`,
    balanceField: 'Balance',
    nextField: 'Next claim',
    next: (unix) => `<t:${unix}:R>`,
};
//# sourceMappingURL=claim.js.map