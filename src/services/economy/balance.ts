import { CONFIG } from '../../config.js';
import { MINUTE_MS } from '../../constants/index.js';
import { collections } from '../../db.js';
import { groupCopies, type InventoryEntry } from '../../lib/game/copies.js';
import { currentHour, nextHourUnix } from '../../lib/time.js';
import type { MemberDoc } from '../../types.js';
import { claimReadyHour, hasBonusClaim } from './claim.js';

/*
 * Reads: balances, inventories and the leaderboard.
 */

export interface BalanceInfo {
  points: number;
  canClaim: boolean;
  /** True when the claim that can be made now is the extra one earned by a critical success on the D20 this hour. */
  bonusClaim: boolean;
  nextClaimUnix: number;
  /** When this member can rob again (unix seconds), or null if they can rob now. */
  robReadyAtUnix: number | null;
  /**
   * Set while a Coughing Baby wearer has withered this member (Wither): the share of their next
   * claim that will be taken, and who it will be paid to. Null when they are not withered.
   */
  withered: { rate: number; byUserId: string } | null;
  /**
   * Set while a Jew Frog wearer has marked this member: the share of their next successful rob
   * that will be taken, and who it will be paid to. Null when they are not marked.
   */
  robTax: { rate: number; byUserId: string } | null;
}

/** The moment a timer that started at `startedAt` runs out (unix seconds), or null if it already has. */
function timerEndsAtUnix(startedAt: Date | null | undefined, lengthMs: number, now: number): number | null {
  if (!startedAt) return null;
  const endsAt = startedAt.getTime() + lengthMs;
  return endsAt > now ? Math.ceil(endsAt / 1000) : null;
}

export async function getBalance(guildId: string, userId: string): Promise<BalanceInfo> {
  const member = await collections().members.findOne({ guildId, userId });
  const now = Date.now();
  const hour = currentHour(now);
  return {
    points: member?.points ?? 0,
    canClaim: !member || claimReadyHour(member) <= hour || hasBonusClaim(member, hour),
    bonusClaim: member !== null && hasBonusClaim(member, hour),
    // The end of the hour before the one they can claim in (the end of this hour, normally).
    nextClaimUnix: nextHourUnix(Math.max(hour, member ? claimReadyHour(member) - 1 : hour)),
    robReadyAtUnix: timerEndsAtUnix(member?.lastRobAt, CONFIG.rob.cooldownMinutes * MINUTE_MS * (member?.robCooldownScale ?? 1), now),
    withered:
      member?.claimTaxRate && member.claimTaxBy ? { rate: member.claimTaxRate, byUserId: member.claimTaxBy } : null,
    robTax: member?.robTaxRate && member.robTaxBy ? { rate: member.robTaxRate, byUserId: member.robTaxBy } : null,
  };
}

/** What a member owns, one entry per kind of item, with how many copies they have. */
export async function getInventory(guildId: string, userId: string): Promise<InventoryEntry[]> {
  const copies = await collections().items.find({ guildId, userId }).toArray();
  return groupCopies(copies);
}

export async function getLeaderboard(guildId: string, limit: number): Promise<MemberDoc[]> {
  return collections()
    .members.find({ guildId, points: { $gt: 0 } })
    .sort({ points: -1, createdAt: 1 })
    .limit(limit)
    .toArray();
}
