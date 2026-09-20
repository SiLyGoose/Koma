import { CONFIG } from '../config.js';
import { MINUTE_MS, PITY_STARS } from '../constants.js';
import { collections } from '../db.js';
import { groupCopies, newCopyId, type InventoryEntry } from '../lib/copies.js';
import { gearEffects } from '../lib/equipment.js';
import { rollItem, topChance } from '../lib/gacha.js';
import { claimAmount, pullCost, robFine, robStolenAmount, robSuccessChance } from '../lib/perks.js';
import { chance, randInt } from '../lib/random.js';
import { currentHour, nextHourUnix } from '../lib/time.js';
import type { ItemCopyDoc, ItemDef, LedgerDoc, MemberDoc } from '../types.js';
import { resolveGear } from './gear.js';

/*
 * Every points change goes through a single conditional MongoDB update, so two people
 * spamming a command at once can never double-claim or push a balance below zero.
 * Robbing touches two documents, so it is a guarded debit followed by a credit (with a
 * refund if the credit fails) rather than a transaction. That keeps it working on a plain
 * standalone MongoDB as well as on Atlas.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

/** Update pipeline that subtracts min(points, amount) from points in one atomic step. */
function clampedDebit(amount: number) {
  return [{ $set: { points: { $subtract: ['$points', { $min: ['$points', amount] }] } } }];
}

type LedgerInput = Omit<LedgerDoc, 'createdAt'>;

/** Best effort: a ledger failure is logged but never undoes a completed action. */
async function recordLedger(entries: LedgerInput[]): Promise<void> {
  if (entries.length === 0) return;
  const createdAt = new Date();
  try {
    await collections().ledger.insertMany(entries.map((entry) => ({ ...entry, createdAt })));
  } catch (err) {
    console.error('Failed to write ledger entries:', err);
  }
}

/** Makes sure the member document exists. Two concurrent creators are fine. */
export async function ensureMember(guildId: string, userId: string): Promise<void> {
  try {
    await collections().members.updateOne(
      { guildId, userId },
      {
        $setOnInsert: {
          points: 0,
          lastClaimHour: -1,
          lastRobAt: null,
          lastRobbedAt: null,
          totalPulls: 0,
          pity: 0,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
}

/**
 * Moves up to `wanted` points from one member to another.
 * Returns null if the sender has fewer than `requireMinBalance` points (nothing moved).
 */
async function transferClamped(
  guildId: string,
  fromId: string,
  toId: string,
  wanted: number,
  requireMinBalance: number,
): Promise<{ moved: number; fromBalance: number; toBalance: number } | null> {
  const { members } = collections();

  const from = await members.findOneAndUpdate(
    { guildId, userId: fromId, points: { $gte: requireMinBalance } },
    clampedDebit(wanted),
    { returnDocument: 'before' },
  );
  if (!from) return null;

  const moved = Math.min(wanted, from.points);
  try {
    const to = await members.findOneAndUpdate(
      { guildId, userId: toId },
      { $inc: { points: moved } },
      { returnDocument: 'after' },
    );
    if (!to) throw new Error(`Member ${toId} not found while crediting a transfer`);
    return { moved, fromBalance: from.points - moved, toBalance: to.points };
  } catch (err) {
    // Give the points back so they are never lost.
    await members.updateOne({ guildId, userId: fromId }, { $inc: { points: moved } });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface BalanceInfo {
  points: number;
  canClaim: boolean;
  nextClaimUnix: number;
  /** When this member can rob again (unix seconds), or null if they can rob now. */
  robReadyAtUnix: number | null;
  /** Until when this member can't be robbed (unix seconds), or null if they can be robbed now. */
  robProtectedUntilUnix: number | null;
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
    canClaim: !member || member.lastClaimHour < hour,
    nextClaimUnix: nextHourUnix(hour),
    robReadyAtUnix: timerEndsAtUnix(member?.lastRobAt, CONFIG.rob.cooldownMinutes * MINUTE_MS, now),
    robProtectedUntilUnix: timerEndsAtUnix(member?.lastRobbedAt, CONFIG.rob.victimProtectionMinutes * MINUTE_MS, now),
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

// ---------------------------------------------------------------------------
// Hourly claim
// ---------------------------------------------------------------------------

export type ClaimResult =
  | { ok: true; amount: number; bonus: number; balance: number; nextClaimUnix: number }
  | { ok: false; nextClaimUnix: number };

export async function claimHourly(guildId: string, userId: string): Promise<ClaimResult> {
  await ensureMember(guildId, userId);

  const hour = currentHour();
  const nextClaimUnix = nextHourUnix(hour);

  // Equipped gear can add a bonus on top of the roll.
  const member = await collections().members.findOne({ guildId, userId });
  const rolled = randInt(CONFIG.claim.min, CONFIG.claim.max);
  const amount = claimAmount(rolled, gearEffects(await resolveGear(guildId, userId, member?.equipment)));

  // Only matches if this member has not claimed during the current hour.
  const updated = await collections().members.findOneAndUpdate(
    { guildId, userId, lastClaimHour: { $lt: hour } },
    { $inc: { points: amount }, $set: { lastClaimHour: hour } },
    { returnDocument: 'after' },
  );
  if (!updated) return { ok: false, nextClaimUnix };

  await recordLedger([{ guildId, userId, delta: amount, reason: 'claim' }]);
  return { ok: true, amount, bonus: amount - rolled, balance: updated.points, nextClaimUnix };
}

// ---------------------------------------------------------------------------
// Gacha
// ---------------------------------------------------------------------------

export type PullResult =
  | {
      ok: true;
      item: ItemDef;
      isNew: boolean;
      count: number;
      balance: number;
      cost: number;
      baseCost: number;
      /**
       * Where the member is on the pity counter after this pull (0 right after a top-tier item),
       * and the pull that is guaranteed. Null when pity isn't in effect (turned off, or the tier
       * can't be pulled).
       */
      pity: { count: number; hardPity: number } | null;
    }
  | { ok: false; balance: number; cost: number };

/** Gives the member a new copy of an item. `count` is how many copies of it they now have. */
async function addCopy(guildId: string, userId: string, itemId: string): Promise<{ copy: ItemCopyDoc; count: number }> {
  const { items } = collections();
  for (let attempt = 0; ; attempt++) {
    const copy: ItemCopyDoc = { _id: newCopyId(), guildId, userId, itemId, level: 0, obtainedAt: new Date() };
    try {
      await items.insertOne(copy);
      return { copy, count: await items.countDocuments({ guildId, userId, itemId }) };
    } catch (err) {
      // A random id colliding is practically impossible, but a retry costs nothing.
      if (isDuplicateKey(err) && attempt < 2) continue;
      throw err;
    }
  }
}

export async function pullGacha(guildId: string, userId: string): Promise<PullResult> {
  const { members } = collections();
  const baseCost = CONFIG.gacha.cost;
  await ensureMember(guildId, userId);

  // Equipped gear can discount the pull.
  const member = await members.findOne({ guildId, userId });
  const cost = pullCost(baseCost, gearEffects(await resolveGear(guildId, userId, member?.equipment)));

  // Pity only counts while it is in effect (turned on, and the top tier can actually be pulled),
  // so pulls made before an admin switches it on don't build up a guarantee.
  const { hardPity } = CONFIG.gacha.pity;
  const pityOn = hardPity > 0 && topChance(1) > 0;

  // Take the payment first, only if the member can afford it. The same update counts this pull
  // toward pity, and what it returns is which pull this is since their last top-tier item, so
  // two pulls at once can never be given the same number.
  const debited = await members.findOneAndUpdate(
    { guildId, userId, points: { $gte: cost } },
    { $inc: { points: -cost, totalPulls: 1, ...(pityOn ? { pity: 1 } : {}) } },
    { returnDocument: 'after' },
  );
  if (!debited) {
    const current = await members.findOne({ guildId, userId });
    return { ok: false, balance: current?.points ?? 0, cost };
  }

  const pullNumber = pityOn ? (debited.pity ?? 1) : 1;
  const item = rollItem(pullNumber);
  const resetsPity = pityOn && item.stars === PITY_STARS;

  // What this pull has added to the pity counter so far, so a failure can undo exactly that.
  let pityChange = pityOn ? 1 : 0;
  let owned: { copy: ItemCopyDoc; count: number };
  try {
    if (resetsPity) {
      // Start counting again. Subtracting (instead of setting 0) keeps any pull that was
      // counted at the same moment.
      await members.updateOne({ guildId, userId }, { $inc: { pity: -pullNumber } });
      pityChange -= pullNumber;
    }
    owned = await addCopy(guildId, userId, item.id);
  } catch (err) {
    // Could not hand over the item, so refund the pull.
    await members.updateOne({ guildId, userId }, { $inc: { points: cost, totalPulls: -1, ...(pityChange !== 0 ? { pity: -pityChange } : {}) } });
    throw err;
  }

  await recordLedger([{ guildId, userId, delta: -cost, reason: 'gacha', itemId: item.id }]);
  return {
    ok: true,
    item,
    isNew: owned.count === 1,
    count: owned.count,
    balance: debited.points,
    cost,
    baseCost,
    pity: pityOn ? { count: resetsPity ? 0 : pullNumber, hardPity } : null,
  };
}

// ---------------------------------------------------------------------------
// Robbing
// ---------------------------------------------------------------------------

export type RobResult =
  | { ok: false; reason: 'cooldown'; availableAtUnix: number }
  | { ok: false; reason: 'victim_too_poor'; minBalance: number }
  | { ok: false; reason: 'victim_recently_robbed'; availableAtUnix: number }
  | { ok: true; success: true; chance: number; stolen: number; robberBalance: number; victimBalance: number }
  | {
      ok: true;
      success: false;
      chance: number;
      /** What the robber actually paid (capped at what they had). */
      fine: number;
      /** The fine after the robber's gear, before checking what they could afford. */
      owed: number;
      /** How much of the fine the robber's gear cancelled. */
      waived: number;
      robberBalance: number;
      victimBalance: number;
    };

export async function rob(guildId: string, robberId: string, victimId: string): Promise<RobResult> {
  const { members } = collections();
  const cfg = CONFIG.rob;

  await Promise.all([ensureMember(guildId, robberId), ensureMember(guildId, victimId)]);

  // After being robbed, a member is protected for a while, counted from that robbery.
  const now = Date.now();
  const protectionMs = cfg.victimProtectionMinutes * MINUTE_MS;
  const recentlyRobbed = (protectedUntilMs: number): RobResult => ({
    ok: false,
    reason: 'victim_recently_robbed',
    availableAtUnix: Math.ceil(protectedUntilMs / 1000),
  });
  const victim = await members.findOne({ guildId, userId: victimId });
  const lastRobbed = victim?.lastRobbedAt?.getTime();
  if (lastRobbed !== undefined && lastRobbed > now - protectionMs) return recentlyRobbed(lastRobbed + protectionMs);

  // Not worth a cooldown if there is nothing to take.
  if ((victim?.points ?? 0) < cfg.minVictimBalance) {
    return { ok: false, reason: 'victim_too_poor', minBalance: cfg.minVictimBalance };
  }

  // Start the robber's cooldown atomically. Only one of several rapid attempts can win this.
  const before = await members.findOneAndUpdate(
    {
      guildId,
      userId: robberId,
      $or: [{ lastRobAt: null }, { lastRobAt: { $lte: new Date(now - cfg.cooldownMinutes * MINUTE_MS) } }],
    },
    { $set: { lastRobAt: new Date(now) } },
    { returnDocument: 'before' },
  );
  if (!before) {
    const robber = await members.findOne({ guildId, userId: robberId });
    const last = robber?.lastRobAt?.getTime() ?? now;
    return { ok: false, reason: 'cooldown', availableAtUnix: Math.ceil((last + cfg.cooldownMinutes * MINUTE_MS) / 1000) };
  }

  const restoreCooldown = () =>
    members.updateOne({ guildId, userId: robberId }, { $set: { lastRobAt: before.lastRobAt } });

  // Gear: the robber's weapon and the victim's armor (which protects even while they're offline).
  const [robberGear, victimGear] = await Promise.all([
    resolveGear(guildId, robberId, before.equipment).then(gearEffects),
    resolveGear(guildId, victimId, victim?.equipment).then(gearEffects),
  ]);
  const successChance = robSuccessChance(cfg.successChance, cfg, robberGear, victimGear);

  // Set once this rob has started the victim's protection timer, so it can be undone on failure.
  let releaseVictimSlot: (() => Promise<unknown>) | null = null;

  try {
    if (chance(successChance)) {
      // Start the victim's protection timer first, so two simultaneous robbers can't both get through.
      const robbedAt = new Date(now);
      const slot = await members.findOneAndUpdate(
        {
          guildId,
          userId: victimId,
          $or: [{ lastRobbedAt: null }, { lastRobbedAt: { $lte: new Date(now - protectionMs) } }],
        },
        { $set: { lastRobbedAt: robbedAt } },
        { returnDocument: 'before' },
      );
      if (!slot) {
        // Someone else robbed them a moment ago. This attempt doesn't count against the robber.
        await restoreCooldown();
        const latest = await members.findOne({ guildId, userId: victimId });
        return recentlyRobbed((latest?.lastRobbedAt?.getTime() ?? now) + protectionMs);
      }
      releaseVictimSlot = () =>
        members.updateOne(
          { guildId, userId: victimId, lastRobbedAt: robbedAt },
          { $set: { lastRobbedAt: slot.lastRobbedAt ?? null } },
        );

      const wanted = robStolenAmount(randInt(cfg.minStolen, cfg.maxStolen), robberGear, victimGear);
      const transfer = await transferClamped(guildId, victimId, robberId, wanted, cfg.minVictimBalance);
      if (!transfer) {
        // The victim spent their points between the check and the steal, so nothing was robbed.
        await releaseVictimSlot();
        await restoreCooldown();
        return { ok: false, reason: 'victim_too_poor', minBalance: cfg.minVictimBalance };
      }
      await recordLedger([
        { guildId, userId: robberId, delta: transfer.moved, reason: 'rob_won', otherUserId: victimId },
        { guildId, userId: victimId, delta: -transfer.moved, reason: 'rob_lost', otherUserId: robberId },
      ]);
      return {
        ok: true,
        success: true,
        chance: successChance,
        stolen: transfer.moved,
        robberBalance: transfer.toBalance,
        victimBalance: transfer.fromBalance,
      };
    }

    // Caught: the robber pays a fine to the victim (whatever they can afford), less any
    // protection from their gear.
    const owed = robFine(cfg.failFine, robberGear);
    const waived = cfg.failFine - owed;
    const transfer = owed > 0 ? await transferClamped(guildId, robberId, victimId, owed, 1) : null;
    if (!transfer) {
      const robber = await members.findOne({ guildId, userId: robberId });
      return {
        ok: true,
        success: false,
        chance: successChance,
        fine: 0,
        owed,
        waived,
        robberBalance: robber?.points ?? 0,
        victimBalance: victim?.points ?? 0,
      };
    }
    await recordLedger([
      { guildId, userId: robberId, delta: -transfer.moved, reason: 'rob_fine_paid', otherUserId: victimId },
      { guildId, userId: victimId, delta: transfer.moved, reason: 'rob_fine_received', otherUserId: robberId },
    ]);
    return {
      ok: true,
      success: false,
      chance: successChance,
      fine: transfer.moved,
      owed,
      waived,
      robberBalance: transfer.fromBalance,
      victimBalance: transfer.toBalance,
    };
  } catch (err) {
    if (releaseVictimSlot) await releaseVictimSlot();
    await restoreCooldown();
    throw err;
  }
}
