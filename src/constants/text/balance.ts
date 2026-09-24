import { boldMoney } from './currency.js';

export const balanceText = {
  title: (name: string) => `${name}'s balance`,
  points: (points: string) => `${boldMoney(points)}`,
  claimField: 'Hourly claim',
  claimReady: (p: string) => `Ready. Use \`${p}claim\`!`,
  /** A critical success on the D20 left one more claim this hour. */
  claimBonusReady: (p: string) => `Bonus claim ready. Use \`${p}claim\` before the hour ends!`,
  claimWait: (unix: number) => `Claimed. Next one <t:${unix}:R>`,
  robField: 'Rob cooldown',
  robReady: (p: string) => `Ready. Use \`${p}rob @user\`!`,
  robWait: (unix: number) => `Recovering. Ready <t:${unix}:R>`,
  /** Status effects on the member, one line each. The field only appears while there is one. */
  effectsField: 'Effects',
  /** Withered by a Coughing Baby wearer. `taker` is a mention, `rate` like "25%". */
  witheredSelf: (rate: string, taker: string) => `Withered: ${taker} takes ${rate} of your next claim.`,
  witheredOther: (rate: string, taker: string) => `Withered: ${taker} takes ${rate} of their next claim.`,
  /** Marked by a Frog wearer: part of their next successful rob goes to `taker` (a mention). */
  robTaxSelf: (rate: string, taker: string) => `Yowch, My Coins! ${taker} takes ${rate} of your next rob.`,
  robTaxOther: (rate: string, taker: string) => `Yowch, My Coins! ${taker} takes ${rate} of their next rob.`,
};
