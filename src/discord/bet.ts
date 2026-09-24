import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TEXT } from '../constants/index.js';
import { fmt } from '../lib/format.js';
import { allBet, buttonPlan, type BetButtonIds, type BetRefusal } from '../lib/game/bet.js';
import { getBalance } from '../services/economy/index.js';

/*
 * The Discord side of games that take a bet: the refusal message, "all" turned into a number,
 * and the again / double / half button row. The rules behind them are in lib/game/bet.ts.
 */

/** The smallest and biggest bet a game allows, like CONFIG.plinko. */
export interface BetLimits {
  minBet: number;
  maxBet: number;
}

/** Says why a bet was refused. */
export function refusalText(prefix: string, bet: number, result: BetRefusal): string {
  if (result.reason === 'too_poor') return TEXT.bet.cantAfford(prefix, fmt(bet), fmt(result.balance));
  return result.reason === 'too_small' ? TEXT.bet.tooSmall(fmt(result.limit)) : TEXT.bet.tooBig(fmt(result.limit));
}

/** The bet a member asked for in points: "all" is as much as they have, within the game's limits. */
export async function resolveBet(guildId: string, userId: string, wanted: number | 'all', limits: BetLimits): Promise<number> {
  if (wanted !== 'all') return wanted;
  const { points } = await getBalance(guildId, userId);
  return allBet(points, limits.minBet, limits.maxBet);
}

/**
 * The again / double / half buttons under a finished game with `bet`. A button is switched off
 * when its bet isn't possible. `doubleLabel` is for a game whose own "Double" means something else.
 */
export function betButtonRow(
  ids: BetButtonIds,
  bet: number,
  balance: number,
  limits: BetLimits,
  doubleLabel: (bet: string) => string = TEXT.bet.doubleButton,
): ActionRowBuilder<ButtonBuilder> {
  const plan = buttonPlan(bet, balance, limits.minBet, limits.maxBet);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ids.again).setLabel(TEXT.bet.againButton(fmt(plan.again.bet))).setStyle(ButtonStyle.Primary).setDisabled(!plan.again.enabled),
    new ButtonBuilder().setCustomId(ids.double).setLabel(doubleLabel(fmt(plan.double.bet))).setStyle(ButtonStyle.Secondary).setDisabled(!plan.double.enabled),
    new ButtonBuilder().setCustomId(ids.half).setLabel(TEXT.bet.halfButton(fmt(plan.half.bet))).setStyle(ButtonStyle.Secondary).setDisabled(!plan.half.enabled),
  );
}
