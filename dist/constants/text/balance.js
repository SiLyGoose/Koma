import { boldGems, boldMoney, boldTokens } from './currency.js';
export const balanceText = {
    title: (name) => `${name}'s balance`,
    points: (points) => `${boldMoney(points)}`,
    /** Under the points: the member's komaTokens (shown even at 0). */
    tokens: (tokens) => boldTokens(tokens),
    /** Under the komaTokens: the member's komaGems (shown even at 0). */
    gems: (gems) => boldGems(gems),
    claimField: 'Hourly claim',
    claimReady: (p) => `Ready. Use \`${p}claim\`!`,
    claimWait: (unix) => `Claimed. Next one <t:${unix}:R>`,
    /** STONKS!: what a claim now would be multiplied by, and when it tops out (`cap`, like "7.5x"). */
    stonksClimbing: (multiplier, cap, unix) => `STONKS! **${multiplier}**, climbing to **${cap}** <t:${unix}:R>`,
    stonksMaxed: (multiplier) => `STONKS! **${multiplier}** (maxed)`,
    robField: 'Rob cooldown',
    robReady: (p) => `Ready. Use \`${p}rob @user\`!`,
    robWait: (unix) => `Recovering. Ready <t:${unix}:R>`,
    /** Status effects on the member, one line each. The field only appears while there is one. */
    effectsField: 'Effects',
    /** Withered by a Coughing Baby wearer. `taker` is a mention, `rate` like "25%". */
    witheredSelf: (rate, taker) => `Withered: ${taker} takes ${rate} of your next claim.`,
    witheredOther: (rate, taker) => `Withered: ${taker} takes ${rate} of their next claim.`,
    /** Marked by a Frog wearer: part of their next successful rob goes to `taker` (a mention). */
    robTaxSelf: (rate, taker) => `Yowch, My Coins! ${taker} takes ${rate} of your next rob (unless you rob them).`,
    robTaxOther: (rate, taker) => `Yowch, My Coins! ${taker} takes ${rate} of their next rob (unless they rob ${taker}).`,
};
//# sourceMappingURL=balance.js.map