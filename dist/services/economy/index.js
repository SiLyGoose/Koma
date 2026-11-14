/*
 * The economy: every way points change hands, one file per feature in this folder (and the casino
 * games' rounds, in services/casino/). Import from here (services/economy/index.js).
 *
 * Every points change goes through a single conditional MongoDB update, so two people
 * spamming a command at once can never double-claim or push a balance below zero.
 * Robbing touches two documents, so it is a guarded debit followed by a credit (with a
 * refund if the credit fails) rather than a transaction. That keeps it working on a plain
 * standalone MongoDB as well as on Atlas.
 */
export { ensureMember } from './shared.js';
export { getBalance, getInventory, getInventoryStacks, getLeaderboard, getStonks } from './balance.js';
export { claimHourly } from './claim.js';
export { addCopy, newCopy, getPity, giveTokens, guaranteePick, isGuaranteed, pityCount, pullGacha, pullMulti, setGuaranteePick } from './gacha.js';
export { giveGems } from './gems.js';
export { craftGems, craftSelectors, heldSelectors, useSelector } from './powder.js';
export { pay } from './pay.js';
export { rob } from './rob.js';
export { playPlinko } from '../casino/plinko.js';
export { playBaccarat } from '../casino/baccarat.js';
export { playRoulette } from '../casino/roulette.js';
//# sourceMappingURL=index.js.map