import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TEXT } from '../constants/index.js';
import { fmt } from '../lib/format.js';
import { allBet, buttonPlan } from '../lib/game/casino/bet.js';
import { getBalance } from '../services/economy/index.js';
/** Says why a bet was refused. */
export function refusalText(prefix, bet, result) {
    if (result.reason === 'too_poor')
        return TEXT.bet.cantAfford(prefix, fmt(bet), fmt(result.balance));
    return result.reason === 'too_small' ? TEXT.bet.tooSmall(fmt(result.limit)) : TEXT.bet.tooBig(fmt(result.limit));
}
/** The bet a member asked for in points: "all" is as much as they have, within the game's limits. */
export async function resolveBet(guildId, userId, wanted, limits) {
    if (wanted !== 'all')
        return wanted;
    const { points } = await getBalance(guildId, userId);
    return allBet(points, limits.minBet, limits.maxBet);
}
/**
 * The again / double / half buttons under a finished game with `bet`. A button is switched off
 * when its bet isn't possible. `doubleLabel` is for a game whose own "Double" means something else.
 */
export function betButtonRow(ids, bet, balance, limits, doubleLabel = TEXT.bet.doubleButton) {
    const plan = buttonPlan(bet, balance, limits.minBet, limits.maxBet);
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(ids.again).setLabel(TEXT.bet.againButton(fmt(plan.again.bet))).setStyle(ButtonStyle.Primary).setDisabled(!plan.again.enabled), new ButtonBuilder().setCustomId(ids.double).setLabel(doubleLabel(fmt(plan.double.bet))).setStyle(ButtonStyle.Secondary).setDisabled(!plan.double.enabled), new ButtonBuilder().setCustomId(ids.half).setLabel(TEXT.bet.halfButton(fmt(plan.half.bet))).setStyle(ButtonStyle.Secondary).setDisabled(!plan.half.enabled));
}
//# sourceMappingURL=bet.js.map