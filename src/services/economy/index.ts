/*
 * The economy: every way points change hands, one file per feature in this folder. Import from
 * here (services/economy/index.js).
 *
 * Every points change goes through a single conditional MongoDB update, so two people
 * spamming a command at once can never double-claim or push a balance below zero.
 * Robbing touches two documents, so it is a guarded debit followed by a credit (with a
 * refund if the credit fails) rather than a transaction. That keeps it working on a plain
 * standalone MongoDB as well as on Atlas.
 */

export { ensureMember } from './shared.js';
export { getBalance, getInventory, getLeaderboard } from './balance.js';
export type { BalanceInfo } from './balance.js';
export { claimHourly } from './claim.js';
export type { ClaimResult } from './claim.js';
export { giveTokens, pullGacha, pullMulti } from './gacha.js';
export { giveGems } from './gems.js';
export type { PullResult, PulledItem, MultiPullResult } from './gacha.js';
export { rob } from './rob.js';
export type { RobResult } from './rob.js';
export { playPlinko } from './plinko.js';
export type { PlinkoResult } from './plinko.js';
