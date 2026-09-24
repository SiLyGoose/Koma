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
  success: (robber: string, victim: string, stolen: string) =>
    `${robber} robbed ${victim} and got away with ${boldMoney(stolen)}`,
  /** Added to a successful rob when the robber's gear made the take bigger. `amount` is how many points more. */
  gearAdded: (amount: string) => `Your gear added ${boldMoney(amount)} to it.`,
  /** Added when the robber's gear made the take smaller (a cut, like the Coughing Baby's). */
  gearCut: (amount: string) => `Your gear took ${boldMoney(amount)} off it.`,
  /** Added when the victim's armor kept part of the take from the robber. */
  shielded: (victim: string, amount: string) => `${victim}'s armor blocked ${boldMoney(amount)} of it.`,
  /** Added to a caught rob when the robber's gear made the fine bigger (a glass cannon). */
  fineRaised: (amount: string) => `Your gear added ${boldMoney(amount)} to the fine.`,
  /** Added to a successful rob when the wearer's gear taxes the victim's next claim. */
  claimTaxed: (victim: string, rate: string) => `${victim}'s next claim will be taxed ${rate}.`,
  /** Added to a successful rob when the wearer's gear taxes the victim's next successful rob. */
  robTaxed: (victim: string, rate: string) => `${victim}'s next rob will be taxed ${rate}.`,
  /** Added when part of this rob went to a Jew Frog wearer who robbed the robber earlier. `taker` is a mention. */
  robTaxPaid: (taker: string, tax: string, kept: string) => `${taker} took ${boldMoney(tax)} of it. You kept ${boldMoney(kept)}`,
  /** Used instead of `success` when the victim was left with nothing. */
  successEverything: (robber: string, victim: string, stolen: string) =>
    `${robber} robbed ${victim} and got away with ${boldMoney(stolen)} That was everything they had...`,
  caughtFined: (robber: string, victim: string, fine: string) =>
    `${robber} tried to rob ${victim} but got caught, and paid them a fine of ${boldMoney(fine)}`,
  caughtFinedWithGear: (robber: string, victim: string, fine: string, waived: string) =>
    `${robber} tried to rob ${victim} but got caught, and paid them a fine of ${boldMoney(fine)} (their gear cancelled ${waived} ${CURRENCY_EMOJI}).`,
  /** Gear cancelled the whole fine. */
  caughtGearSaved: (robber: string, victim: string) =>
    `${robber} tried to rob ${victim} but got caught, though their gear got them out of the fine.`,
  /** The fine is set to 0, so there was nothing to pay. */
  caughtNothingToFine: (robber: string, victim: string) =>
    `${robber} tried to rob ${victim} but got caught. There was no fine to pay.`,
  /** The robber has fewer points than the base fine. */
  robberTooPoor: (p: string, fine: string, balance: string) =>
    `You need at least ${boldMoney(fine)} to rob, in case you get caught. You have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
};
