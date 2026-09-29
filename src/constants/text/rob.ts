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
  success: (robber: string, victim: string, stolen: string) =>
    `${robber} robbed ${victim} and got away with ${boldMoney(stolen)}`,
  /** Added to a successful rob when the robber's gear made the take bigger. `amount` is how many points more. */
  gearAdded: (amount: string) => `Your gear added ${boldMoney(amount)} to it.`,
  /** Added when the robber's gear made the take smaller (a cut, like the Coughing Baby's). */
  gearCut: (amount: string) => `Your gear took ${boldMoney(amount)} off it.`,
  /** Thoccy Keyboard: the robber's streak added to the take. `count` robs in the last `hours` hours, this one included. */
  streak: (count: number, hours: number, rate: string, amount: string) =>
    `⌨️ **Hot streak!** ${count} rob${count === 1 ? '' : 's'} in ${hours} hours: +${rate}, ${boldMoney(amount)} more.`,
  /** Thoccy Keyboard: the victim was vulnerable (they failed a rob), so this rob took more. */
  vulnerableTaken: (victim: string, amount: string) => `⌨️ ${victim} was vulnerable: you took ${boldMoney(amount)} more.`,
  /** Thoccy Keyboard: the robber failed and is vulnerable now. */
  nowVulnerable: (robber: string, rate: string) => `⌨️ Streak broken. ${robber} is vulnerable: the next successful rob against them takes +${rate}.`,
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
  /**
   * Added last when the rob slipped (Piplup): `returned` went back to the victim, plus `penalty`
   * ('' when there was none). Placeholder wording.
   */
  slipped: (victim: string, returned: string, penalty: string) =>
    `<:piplupsmirk:1553135037120250046> ...but slipped! ${boldMoney(returned)} went back to ${victim}${penalty === '' ? '.' : `, plus ${boldMoney(penalty)} for the trouble.`}`,
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
