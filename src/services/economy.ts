import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config.js';
import { MINUTE_MS, MULTI_PULLS, ROB_LOCK } from '../constants.js';
import { collections } from '../db.js';
import { emptyTotals } from '../data/effects.js';
import { applyD20, rollD20, rollD20Dice, type D20Dice, type D20Roll } from '../lib/game/d20.js';
import { groupCopies, newCopyId, type InventoryEntry } from '../lib/game/copies.js';
import { gearEffects } from '../lib/game/equipment.js';
import { rollPulls, topChance } from '../lib/game/gacha.js';
import {
  applyStonks,
  claimAmount,
  claimGapHours,
  claimTaxAmount,
  claimTaxRate,
  d20Chance,
  pullCost,
  robCooldownScale,
  robFine,
  robStolenAmount,
  robSuccessChance,
  robTaxAmount,
  robTaxRate,
  stonksMultiplier,
  wheelChance,
} from '../lib/game/perks.js';
import { checkBet, payoutFor, rollPath, slotMultiplier, slotOf } from '../lib/game/plinko.js';
import { chance, randInt } from '../lib/random.js';
import { currentHour, nextHourUnix } from '../lib/time.js';
import { applyWheel, rollWheelDice, spinWheel, type WheelSpin } from '../lib/game/wheel.js';
import type { ItemCopyDoc, ItemDef, LedgerDoc, MemberDoc } from '../types.js';
import { resolveGear } from './gear.js';
import { addVaultLoss } from './vault.js';

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
          guaranteed: false,
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

// ---------------------------------------------------------------------------
// Hourly claim
// ---------------------------------------------------------------------------

export type ClaimResult =
  | {
      ok: true;
      /** What the claim was worth, after the gear bonus and the wheel, before any tax. */
      amount: number;
      /** How much the member's gear added to the roll (not counting the wheel). */
      bonus: number;
      /** Set when the wheel (wheelSpin gear) spun for this claim and multiplied `amount`. */
      wheel: WheelSpin | null;
      /** How many points the wheel added (negative if it took some away); 0 when it didn't spin. */
      wheelBonus: number;
      /**
       * Set when the D20 (d20 gear) rolled for this claim. A fail makes `amount` 0 (and the hour is
       * used up), a success doubled it and left one more claim this hour (`bonusLeft`).
       */
      d20: D20Roll | null;
      /** How many points the D20 added (negative if it took some away, all of them on a fail); 0 when it didn't roll. */
      d20Bonus: number;
      /**
       * The multiplier STONKS! (stonks gear) applied, from how many hours passed since the last
       * claim: null when the member has none equipped or it changed nothing (1x, right after a
       * claim). Only one unique treasure can be equipped at a time, so this and `wheel`/`d20` are
       * never both set for a real member.
       */
      stonks: number | null;
      /** How many points STONKS! added; 0 when it didn't apply. */
      stonksBonus: number;
      /** This claim was the extra one earned by a critical success earlier in the hour. */
      extra: boolean;
      /** One more claim can be made this hour (this claim was a critical success). */
      bonusLeft: boolean;
      /** Set when a member who robbed them took part of this claim (see the claimTax effect). */
      taxed: { amount: number; toUserId: string } | null;
      balance: number;
      nextClaimUnix: number;
    }
  | { ok: false; nextClaimUnix: number };

/**
 * The first clock hour in which the member can make a normal claim: the hour after their last
 * claim, or later if that claim was made in gear that lengthens the wait (claimGapHours).
 */
function claimReadyHour(member: Pick<MemberDoc, 'lastClaimHour' | 'claimGapHours'>): number {
  return member.lastClaimHour + Math.max(1, member.claimGapHours ?? 1);
}

/** True when the member earned one more claim for this hour (a critical success on the D20) and hasn't used it. */
function hasBonusClaim(member: Pick<MemberDoc, 'lastClaimHour' | 'bonusClaimHour'>, hour: number): boolean {
  return member.lastClaimHour === hour && member.bonusClaimHour === hour;
}

/**
 * Makes the member's hourly claim. `d20Dice` is the random numbers the D20 uses; leave it out (only
 * tests set it, to force a roll).
 */
export async function claimHourly(guildId: string, userId: string, d20Dice: D20Dice = rollD20Dice()): Promise<ClaimResult> {
  await ensureMember(guildId, userId);

  const hour = currentHour();
  const nextClaimUnix = nextHourUnix(hour);

  const { members } = collections();
  const rolled = randInt(CONFIG.claim.min, CONFIG.claim.max);
  // Thrown once, before the loop, so a retry below keeps the same spin (and the same roll of the D20).
  const wheelDice = rollWheelDice();

  // A tax left on this member by a robbery (claimTax gear) is taken out of this claim, in the
  // same update that records the claim, so it applies exactly once. The update only goes through
  // if the tax is still what we read; if someone set one in between, read again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const member = await members.findOne({ guildId, userId });
    // A member who rolled a critical success can claim once more in the same hour.
    const extra = member !== null && hasBonusClaim(member, hour);
    // Otherwise they have to wait out the last claim: an hour, or longer if it was made in gear
    // that slows them down (the wait is fixed when the claim is made, so taking the gear off
    // doesn't skip it).
    const readyHour = member ? claimReadyHour(member) : hour;
    if (!extra && readyHour > hour) return { ok: false, nextClaimUnix: nextHourUnix(readyHour - 1) };

    // Equipped gear can add a bonus on top of the roll, the wheel can then multiply it, and the
    // D20 comes last: it can wipe the claim out, double it or scale it by the number rolled.
    const gear = gearEffects(await resolveGear(guildId, userId, member?.equipment), userId);
    const gap = claimGapHours(gear);
    const withGear = claimAmount(rolled, gear);
    const wheel = spinWheel(wheelChance(gear), wheelDice);
    const afterWheel = wheel ? applyWheel(withGear, wheel.multiplier) : withGear;
    const d20 = rollD20(d20Chance(gear), d20Dice);
    const afterD20 = d20 ? applyD20(afterWheel, d20) : afterWheel;
    const failed = d20?.kind === 'fail';
    const bonusLeft = d20?.kind === 'success';
    // STONKS!: the longer since the member's last claim, the bigger the multiplier (capped; see
    // stonksMultiplier). Only one unique treasure can be worn at a time, so this never actually
    // runs alongside the wheel or the D20 for a real member, but it is harmless either way (a
    // fail's 0 stays 0, and applyStonks is a no-op at 1x).
    const hoursUnclaimed = member ? hour - member.lastClaimHour : 0;
    const stonksMult = stonksMultiplier(hoursUnclaimed, gear, CONFIG.stonks.capHours);
    const amount = applyStonks(afterD20, stonksMult);

    // A critical fail pays nothing, so it leaves a waiting tax alone for the next claim that pays.
    const taxRate = member?.claimTaxRate ?? null;
    const taxBy = member?.claimTaxBy ?? null;
    const tax = !failed && taxRate !== null && taxBy !== null ? claimTaxAmount(amount, taxRate) : 0;
    const kept = amount - tax;

    // Only matches if this member has not claimed during the current hour (or is using the extra
    // claim they earned this hour).
    const updated = await members.findOneAndUpdate(
      {
        guildId,
        userId,
        ...(extra ? { lastClaimHour: hour, bonusClaimHour: hour } : { lastClaimHour: { $lte: hour - Math.max(1, member?.claimGapHours ?? 1) } }),
        claimTaxRate: taxRate,
        claimTaxBy: taxBy,
      },
      {
        $inc: { points: kept },
        $set: {
          lastClaimHour: hour,
          // How long until the next normal claim (2 = every second hour, with sloth gear).
          claimGapHours: gap,
          // A critical success earns one more claim this hour; any other claim uses up the one it made.
          bonusClaimHour: bonusLeft ? hour : null,
          ...(failed ? {} : { claimTaxRate: null, claimTaxBy: null }),
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      const current = await members.findOne({ guildId, userId });
      if (current && (claimReadyHour(current) <= hour || hasBonusClaim(current, hour))) continue; // only the tax changed: try again
      return { ok: false, nextClaimUnix: nextHourUnix(current ? Math.max(hour, claimReadyHour(current) - 1) : hour) };
    }

    // Pay the tax to whoever robbed them. If that fails, the member gets it back instead.
    let paid = 0;
    if (tax > 0 && taxBy !== null) {
      try {
        await ensureMember(guildId, taxBy);
        await members.updateOne({ guildId, userId: taxBy }, { $inc: { points: tax } });
        paid = tax;
      } catch (err) {
        console.error('Could not pay out a claim tax, giving it back:', err);
        await members.updateOne({ guildId, userId }, { $inc: { points: tax } });
      }
    }

    const entries: LedgerInput[] = amount > 0 ? [{ guildId, userId, delta: amount, reason: 'claim' }] : [];
    if (paid > 0 && taxBy !== null) {
      entries.push(
        { guildId, userId, delta: -paid, reason: 'claim_tax_paid', otherUserId: taxBy },
        { guildId, userId: taxBy, delta: paid, reason: 'claim_tax_received', otherUserId: userId },
      );
    }
    await recordLedger(entries);

    return {
      ok: true,
      amount,
      bonus: withGear - rolled,
      wheel,
      wheelBonus: afterWheel - withGear,
      d20,
      d20Bonus: afterD20 - afterWheel,
      stonks: stonksMult > 1 ? stonksMult : null,
      stonksBonus: amount - afterD20,
      extra,
      bonusLeft,
      taxed: paid > 0 && taxBy !== null ? { amount: paid, toUserId: taxBy } : null,
      balance: updated.points + (tax > 0 && paid === 0 ? tax : 0),
      nextClaimUnix: nextHourUnix(hour + gap - 1),
    };
  }
  return { ok: false, nextClaimUnix };
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

/** One pull inside a multi pull. */
export interface PulledItem {
  item: ItemDef;
  /** True when it is the first copy of this item the member has ever owned. */
  isNew: boolean;
  /** How many copies of the item they own after this pull. */
  count: number;
}

export type MultiPullResult =
  | {
      ok: true;
      /** In the order they were pulled. */
      pulls: PulledItem[];
      balance: number;
      /** What all the pulls cost together, after gear. */
      cost: number;
      /** What they would have cost without gear. */
      baseCost: number;
      pity: { count: number; hardPity: number } | null;
    }
  | { ok: false; balance: number; cost: number };

/**
 * Pulls `times` items in one go, paid for together. Each pull counts toward pity in order, so a
 * top-tier item part way through starts the count again for the pulls after it. Either every
 * pull is made and paid for, or nothing is.
 */
async function pullMany(guildId: string, userId: string, times: number): Promise<MultiPullResult> {
  const { members, items } = collections();
  const baseCost = CONFIG.gacha.cost;
  await ensureMember(guildId, userId);

  // Equipped gear can discount each pull.
  const member = await members.findOne({ guildId, userId });
  const cost = pullCost(baseCost, gearEffects(await resolveGear(guildId, userId, member?.equipment), userId));
  const total = cost * times;

  // Pity only counts while it is in effect (turned on, and the top tier can actually be pulled),
  // so pulls made before an admin switches it on don't build up a guarantee.
  const { hardPity } = CONFIG.gacha.pity;
  const pityOn = hardPity > 0 && topChance(1) > 0;

  // Take the payment first, only if the member can afford all of it. The same update counts
  // these pulls toward pity, and what it returns tells us which pulls these are since their last
  // top-tier item, so pulls at the same moment can never be given the same numbers.
  const debited = await members.findOneAndUpdate(
    { guildId, userId, points: { $gte: total } },
    { $inc: { points: -total, totalPulls: times, ...(pityOn ? { pity: times } : {}) } },
    { returnDocument: 'after' },
  );
  if (!debited) {
    const current = await members.findOne({ guildId, userId });
    return { ok: false, balance: current?.points ?? 0, cost: total };
  }

  // Roll every pull in order, counting pity as we go.
  const counted = pityOn ? (debited.pity ?? times) : 0; // the counter after paying, counting all of these pulls
  // The guarantee: after someone else's treasure, the member's next treasure is their own.
  const wasGuaranteed = debited.guaranteed ?? false;
  const { items: rolled, counter, guaranteed } = rollPulls(counted - times, times, pityOn, undefined, {
    userId,
    guaranteed: wasGuaranteed,
  });
  // The payment counted every pull; take back what the resets undo. Subtracting (instead of
  // setting the counter) keeps any pull that was counted at the same moment.
  const pityReset = pityOn ? counter - counted : 0;

  // What these pulls have added to the pity counter so far, so a failure can undo exactly that.
  let pityChange = pityOn ? times : 0;
  let guaranteeChanged = false;
  const pulls: PulledItem[] = [];
  const addedIds: string[] = [];
  try {
    if (pityReset !== 0) {
      await members.updateOne({ guildId, userId }, { $inc: { pity: pityReset } });
      pityChange += pityReset;
    }
    if (guaranteed !== wasGuaranteed) {
      await members.updateOne({ guildId, userId }, { $set: { guaranteed } });
      guaranteeChanged = true;
    }
    for (const item of rolled) {
      const owned = await addCopy(guildId, userId, item.id);
      addedIds.push(owned.copy._id);
      pulls.push({ item, isNew: owned.count === 1, count: owned.count });
    }
  } catch (err) {
    // Could not hand everything over, so take back the copies already given and refund it all.
    if (addedIds.length > 0) {
      try {
        await items.deleteMany({ _id: { $in: addedIds } });
      } catch (deleteErr) {
        console.error('Could not remove the copies of a failed pull:', deleteErr);
      }
    }
    await members.updateOne(
      { guildId, userId },
      {
        $inc: { points: total, totalPulls: -times, ...(pityChange !== 0 ? { pity: -pityChange } : {}) },
        ...(guaranteeChanged ? { $set: { guaranteed: wasGuaranteed } } : {}),
      },
    );
    throw err;
  }

  await recordLedger(rolled.map((item) => ({ guildId, userId, delta: -cost, reason: 'gacha' as const, itemId: item.id })));
  return {
    ok: true,
    pulls,
    balance: debited.points,
    cost: total,
    baseCost: baseCost * times,
    pity: pityOn ? { count: counter, hardPity } : null,
  };
}

/** One pull. */
export async function pullGacha(guildId: string, userId: string): Promise<PullResult> {
  const result = await pullMany(guildId, userId, 1);
  if (!result.ok) return result;
  const [pull] = result.pulls as [PulledItem];
  return {
    ok: true,
    item: pull.item,
    isNew: pull.isNew,
    count: pull.count,
    balance: result.balance,
    cost: result.cost,
    baseCost: result.baseCost,
    pity: result.pity,
  };
}

/** A multi pull: MULTI_PULLS pulls, paid for together. */
export async function pullMulti(guildId: string, userId: string): Promise<MultiPullResult> {
  return pullMany(guildId, userId, MULTI_PULLS);
}

// ---------------------------------------------------------------------------
// Robbing
// ---------------------------------------------------------------------------

export type RobResult =
  | { ok: false; reason: 'cooldown'; availableAtUnix: number }
  /** The robber has fewer points than rob.failFine, so they can't afford to be caught. */
  | { ok: false; reason: 'robber_too_poor'; fine: number; balance: number }
  | { ok: false; reason: 'victim_too_poor'; minBalance: number }
  /** Another robber has held the victim for longer than a rob takes; nothing happened, try again. */
  | { ok: false; reason: 'victim_busy' }
  | {
      ok: true;
      success: true;
      chance: number;
      stolen: number;
      robberBalance: number;
      victimBalance: number;
      /** The share of the victim's next claim now set aside for the robber, or null if none was. */
      claimTax: number | null;
      /** The share of the victim's next successful rob now set aside for the robber, or null if none was. */
      robTax: number | null;
      /** Set when a Jew Frog wearer who robbed the robber earlier took part of this rob. */
      robTaxPaid: { amount: number; toUserId: string } | null;
      /** Set when the wheel (wheelSpin gear) spun for this rob and multiplied what was stolen. */
      wheel: WheelSpin | null;
      /** How many points the robber's gear added to what was taken (negative when it cut it, like a robAmountCut). */
      gearBonus: number;
      /** How many points the victim's armor kept from the robber. */
      shielded: number;
      /** How many points the wheel added to what was taken (negative if it took some away); 0 when it didn't spin. */
      wheelBonus: number;
    }
  | {
      ok: true;
      success: false;
      chance: number;
      /** What the robber paid (capped at what they had). */
      fine: number;
      /** The fine after the robber's gear, before checking what they could afford. */
      owed: number;
      /** How much of the fine the robber's gear cancelled. */
      waived: number;
      /** How much more than the base fine the robber paid because of their gear (a glass cannon). 0 when gear made it smaller or did nothing, or when they couldn't afford more than the base fine. */
      raised: number;
      robberBalance: number;
      victimBalance: number;
    };

export async function rob(guildId: string, robberId: string, victimId: string): Promise<RobResult> {
  const { members } = collections();
  const cfg = CONFIG.rob;

  await Promise.all([ensureMember(guildId, robberId), ensureMember(guildId, victimId)]);

  // Robbing no longer checks how recently a member was robbed (the user removed the once-an-hour
  // protection), but the timestamp is still recorded below, in case it's wanted again later.
  const now = Date.now();
  let victim = await members.findOne({ guildId, userId: victimId });

  // Not worth a cooldown if there is nothing to take.
  if ((victim?.points ?? 0) < cfg.minVictimBalance) {
    return { ok: false, reason: 'victim_too_poor', minBalance: cfg.minVictimBalance };
  }

  // Start the robber's cooldown atomically. Only one of several rapid attempts can win this. The
  // robber also has to hold at least the base fine, so a rob never starts from less than they
  // could be fined.
  //
  // The cooldown a rob starts is fixed at that moment: a robber in gear that slows them down
  // (slothCooldown) waits longer, and taking the gear off doesn't skip it. So the length that
  // applies now is the one the last rob started, and the one this rob starts comes from the
  // robber's gear right now.
  const robberDoc = await members.findOne({ guildId, userId: robberId });
  const robberGear = gearEffects(await resolveGear(guildId, robberId, robberDoc?.equipment), robberId);
  const cooldownMs = cfg.cooldownMinutes * MINUTE_MS * (robberDoc?.robCooldownScale ?? 1);
  const before = await members.findOneAndUpdate(
    {
      guildId,
      userId: robberId,
      points: { $gte: cfg.failFine },
      $or: [{ lastRobAt: null }, { lastRobAt: { $lte: new Date(now - cooldownMs) } }],
    },
    { $set: { lastRobAt: new Date(now), robCooldownScale: robCooldownScale(robberGear) } },
    { returnDocument: 'before' },
  );
  if (!before) {
    const latest = await members.findOne({ guildId, userId: robberId });
    const last = latest?.lastRobAt?.getTime();
    if (last !== undefined && last > now - cooldownMs) {
      return { ok: false, reason: 'cooldown', availableAtUnix: Math.ceil((last + cooldownMs) / 1000) };
    }
    return { ok: false, reason: 'robber_too_poor', fine: cfg.failFine, balance: latest?.points ?? 0 };
  }

  const restoreCooldown = () =>
    members.updateOne(
      { guildId, userId: robberId },
      { $set: { lastRobAt: before.lastRobAt, robCooldownScale: before.robCooldownScale ?? null } },
    );

  // The victim's armor protects them even while they're offline.
  const victimGear = gearEffects(await resolveGear(guildId, victimId, victim?.equipment), victimId);
  const successChance = robSuccessChance(cfg.successChance, cfg, robberGear, victimGear);

  // Set once this rob has started the victim's protection timer, so it can be undone on failure.
  let releaseVictimSlot: (() => Promise<unknown>) | null = null;
  // Set once this rob holds the victim's lock, and released when the rob is over, however it ends.
  let lockToken: string | null = null;

  try {
    // Only one rob at a time acts on a victim. Without this, two robbers who both read the victim
    // before either had finished would both roll: one could win while the other, who should have
    // found the victim protected, was fined or robbed them too. A second robber waits here, and
    // once the first is done they are judged against what really happened: a victim who was just
    // robbed is protected, one whose robber was caught is not.
    const token = randomUUID();
    for (let attempt = 0; lockToken === null; attempt++) {
      const held = await members.findOneAndUpdate(
        {
          guildId,
          userId: victimId,
          $or: [{ robLockUntil: null }, { robLockUntil: { $lte: new Date(Date.now()) } }],
        },
        { $set: { robLockUntil: new Date(Date.now() + ROB_LOCK.holdMs), robLockBy: token } },
        { returnDocument: 'before' },
      );
      if (held) {
        lockToken = token;
        break;
      }
      if (attempt + 1 >= ROB_LOCK.attempts) {
        await restoreCooldown();
        return { ok: false, reason: 'victim_busy' };
      }
      await new Promise((resolve) => setTimeout(resolve, ROB_LOCK.retryMs));
    }

    // The victim may have spent their points since the first look, so look again.
    victim = await members.findOne({ guildId, userId: victimId });
    if ((victim?.points ?? 0) < cfg.minVictimBalance) {
      await restoreCooldown();
      return { ok: false, reason: 'victim_too_poor', minBalance: cfg.minVictimBalance };
    }

    if (chance(successChance)) {
      // Start the victim's protection timer first, so two simultaneous robbers can't both get through.
      // Recorded for its own sake (not used to block anything any more): if the steal below
      // doesn't end up happening, releaseVictimSlot puts the old value back.
      const robbedAt = new Date(now);
      const slot = await members.findOneAndUpdate(
        { guildId, userId: victimId },
        { $set: { lastRobbedAt: robbedAt } },
        { returnDocument: 'before' },
      );
      releaseVictimSlot = () =>
        members.updateOne(
          { guildId, userId: victimId, lastRobbedAt: robbedAt },
          { $set: { lastRobbedAt: slot?.lastRobbedAt ?? null } },
        );

      // The wheel multiplies what is taken, so the victim loses exactly what the robber gets.
      const rolled = randInt(cfg.minStolen, cfg.maxStolen);
      const stolen = robStolenAmount(rolled, robberGear, victimGear);
      // What each effect did, so the reply can show it: the robber's gear, then the victim's armor,
      // then the wheel. Each step is the difference between two whole numbers, so they add up.
      const beforeArmor = robStolenAmount(rolled, robberGear, emptyTotals());
      const wheel = spinWheel(wheelChance(robberGear), rollWheelDice());
      const wanted = wheel ? applyWheel(stolen, wheel.multiplier) : stolen;
      const transfer = await transferClamped(guildId, victimId, robberId, wanted, cfg.minVictimBalance);
      if (!transfer) {
        // The victim spent their points between the check and the steal, so nothing was robbed.
        await releaseVictimSlot();
        await restoreCooldown();
        return { ok: false, reason: 'victim_too_poor', minBalance: cfg.minVictimBalance };
      }
      const ledger: LedgerInput[] = [
        { guildId, userId: robberId, delta: transfer.moved, reason: 'rob_won', otherUserId: victimId },
        { guildId, userId: victimId, delta: -transfer.moved, reason: 'rob_lost', otherUserId: robberId },
      ];
      let robberBalance = transfer.toBalance;

      // If a Jew Frog wearer marked the robber earlier, part of this rob is theirs. The mark is
      // cleared in one conditional update, so it is taken at most once, and put back if the payout
      // could not be made.
      let robTaxPaid: { amount: number; toUserId: string } | null = null;
      const owedRate = before.robTaxRate ?? null;
      const owedTo = before.robTaxBy ?? null;
      if (owedRate !== null && owedTo !== null) {
        try {
          const taken = await members.findOneAndUpdate(
            { guildId, userId: robberId, robTaxRate: owedRate, robTaxBy: owedTo },
            { $set: { robTaxRate: null, robTaxBy: null } },
            { returnDocument: 'before' },
          );
          if (taken) {
            const tax = robTaxAmount(transfer.moved, owedRate);
            let paid: { moved: number; fromBalance: number } | null = null;
            try {
              await ensureMember(guildId, owedTo);
              paid = tax > 0 ? await transferClamped(guildId, robberId, owedTo, tax, 1) : null;
            } catch (err) {
              console.error('Could not pay out a rob tax:', err);
            }
            if (paid) {
              robTaxPaid = { amount: paid.moved, toUserId: owedTo };
              robberBalance = paid.fromBalance;
              ledger.push(
                { guildId, userId: robberId, delta: -paid.moved, reason: 'rob_tax_paid', otherUserId: owedTo },
                { guildId, userId: owedTo, delta: paid.moved, reason: 'rob_tax_received', otherUserId: robberId },
              );
            } else if (tax > 0) {
              // Nothing was paid, so the mark stays for the next successful rob.
              await members.updateOne(
                { guildId, userId: robberId, robTaxRate: null },
                { $set: { robTaxRate: owedRate, robTaxBy: owedTo } },
              );
            }
          }
        } catch (err) {
          console.error('Could not apply a rob tax:', err);
        }
      }
      await recordLedger(ledger);

      // The robber's gear can also tax the victim's next claim. Only one tax waits at a time, so
      // if they already have one this rob doesn't add another.
      let claimTax: number | null = null;
      const taxRate = claimTaxRate(robberGear);
      if (taxRate > 0) {
        try {
          const set = await members.findOneAndUpdate(
            { guildId, userId: victimId, claimTaxRate: null },
            { $set: { claimTaxRate: taxRate, claimTaxBy: robberId } },
            { returnDocument: 'after' },
          );
          if (set) claimTax = taxRate;
        } catch (err) {
          // The steal already happened; don't undo it over the tax.
          console.error('Could not set a claim tax:', err);
        }
      }

      // The robber's gear can also mark the victim, so part of their next successful rob comes
      // back to this robber. Same rule: one mark waits at a time.
      let robTax: number | null = null;
      const markRate = robTaxRate(robberGear);
      if (markRate > 0) {
        try {
          const set = await members.findOneAndUpdate(
            { guildId, userId: victimId, robTaxRate: null },
            { $set: { robTaxRate: markRate, robTaxBy: robberId } },
            { returnDocument: 'after' },
          );
          if (set) robTax = markRate;
        } catch (err) {
          console.error('Could not set a rob tax:', err);
        }
      }

      return {
        ok: true,
        success: true,
        chance: successChance,
        stolen: transfer.moved,
        robberBalance,
        victimBalance: transfer.fromBalance,
        claimTax,
        robTax,
        robTaxPaid,
        wheel,
        gearBonus: beforeArmor - rolled,
        shielded: Math.max(0, beforeArmor - stolen),
        wheelBonus: wanted - stolen,
      };
    }

    // Caught: the robber pays a fine to the victim (whatever they can afford, so their balance
    // never goes below 0), less any protection from their gear.
    const owed = robFine(cfg.failFine, robberGear);
    // Only counts what gear cancelled; a fine raised by gear (glassCannon) is not "waived".
    const waived = Math.max(0, cfg.failFine - owed);
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
        raised: 0,
        robberBalance: robber?.points ?? 0,
        victimBalance: victim?.points ?? 0,
      };
    }
    await recordLedger([
      { guildId, userId: robberId, delta: -transfer.moved, reason: 'rob_fine_paid', otherUserId: victimId },
      { guildId, userId: victimId, delta: transfer.moved, reason: 'rob_fine_received', otherUserId: robberId },
    ]);
    // The fine goes to the victim, not the house, but it still counts toward the vault (the user asked for this).
    if (transfer.moved > 0) await addVaultLoss(guildId, transfer.moved);
    return {
      ok: true,
      success: false,
      chance: successChance,
      fine: transfer.moved,
      owed,
      waived,
      // Only what was really paid above the base fine counts, so a fine cut short by what the robber had adds nothing.
      raised: Math.max(0, transfer.moved - cfg.failFine),
      robberBalance: transfer.fromBalance,
      victimBalance: transfer.toBalance,
    };
  } catch (err) {
    if (releaseVictimSlot) await releaseVictimSlot();
    await restoreCooldown();
    throw err;
  } finally {
    if (lockToken !== null) {
      try {
        await members.updateOne(
          { guildId, userId: victimId, robLockBy: lockToken },
          { $set: { robLockUntil: null, robLockBy: null } },
        );
      } catch (err) {
        // It lapses by itself after ROB_LOCK.holdMs.
        console.error('Could not release a rob lock:', err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Plinko
// ---------------------------------------------------------------------------

export type PlinkoResult =
  /** The bet is outside plinko.minBet .. plinko.maxBet; `limit` is the one it broke. Nothing was charged. */
  | { ok: false; reason: 'too_small' | 'too_big'; limit: number }
  | { ok: false; reason: 'too_poor'; balance: number }
  | {
      ok: true;
      bet: number;
      /** One entry per row of pegs: true when the ball bounced right. */
      path: boolean[];
      /** Where it landed, from the left starting at 0. */
      slot: number;
      multiplier: number;
      /** What the bet paid back, in whole points (0 if the slot pays nothing). */
      payout: number;
      /** payout - bet: positive when the member won points, negative when they lost some. */
      net: number;
      balance: number;
    };

/**
 * One game of plinko: the ball is dropped, the bet is taken in one conditional update (so nobody
 * can bet points they don't have, however fast they press), and the payout is added after. If
 * adding the payout fails, the bet is given back. The picture is only for show, and comes after.
 */
export async function playPlinko(
  guildId: string,
  userId: string,
  bet: number,
  goesRight: () => boolean = () => chance(0.5),
): Promise<PlinkoResult> {
  if (!Number.isSafeInteger(bet) || bet < 1) throw new Error(`A plinko bet must be a whole number of points, got ${bet}`);
  const cfg = CONFIG.plinko;
  const range = checkBet(bet, cfg.minBet, cfg.maxBet);
  if (!range.ok) return { ok: false, reason: range.reason, limit: range.limit };

  await ensureMember(guildId, userId);
  const { members } = collections();

  const path = rollPath(goesRight);
  const slot = slotOf(path);
  const multiplier = slotMultiplier(cfg.payout, slot);
  const payout = payoutFor(bet, multiplier);

  const charged = await members.findOneAndUpdate(
    { guildId, userId, points: { $gte: bet } },
    { $inc: { points: -bet } },
    { returnDocument: 'after' },
  );
  if (!charged) {
    const latest = await members.findOne({ guildId, userId });
    return { ok: false, reason: 'too_poor', balance: latest?.points ?? 0 };
  }

  let balance = charged.points;
  if (payout > 0) {
    try {
      const paid = await members.findOneAndUpdate({ guildId, userId }, { $inc: { points: payout } }, { returnDocument: 'after' });
      if (!paid) throw new Error(`Member ${userId} not found while paying a plinko win`);
      balance = paid.points;
    } catch (err) {
      // The game didn't happen: give the bet back.
      await members.updateOne({ guildId, userId }, { $inc: { points: bet } });
      throw err;
    }
  }

  const entries: LedgerInput[] = [{ guildId, userId, delta: -bet, reason: 'plinko_bet' }];
  if (payout > 0) entries.push({ guildId, userId, delta: payout, reason: 'plinko_payout' });
  await recordLedger(entries);

  const net = payout - bet;
  if (net < 0) await addVaultLoss(guildId, -net);

  return { ok: true, bet, path, slot, multiplier, payout, net, balance };
}
