import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { gearEffects } from '../../lib/game/items/equipment.js';
import { randInt } from '../../lib/random.js';
import { currentHour, HOUR_MS, nextHourUnix } from '../../lib/time.js';
import {
  applyD20,
  applyStonks,
  applyWheel,
  claimAmount,
  claimGapHours,
  claimTaxAmount,
  claimTaxRate,
  d20Chance,
  d20Penalty,
  rollD20,
  rollD20Dice,
  rollWheelDice,
  spinWheel,
  stonksMultiplier,
  wheelChance,
  wheelSlices,
  type D20Dice,
  type D20Roll,
  type EffectTotals,
  type WheelSpin,
} from '../../perks/index.js';
import type { MemberDoc } from '../../types.js';
import { resolveGear } from '../items/gear.js';
import { addVaultLoss } from '../vault.js';
import { type LedgerInput, clampedDebit, recordLedger, ensureMember } from './shared.js';

/*
 * The hourly claim, with every claim perk (claim bonus, wheel, D20, STONKS!, claim tax).
 */

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
       * used up), a success multiplied it by the bonus die.
       */
      d20: D20Roll | null;
      /** How many points the D20 added (negative if it took some away, all of them on a fail); 0 when it didn't roll. */
      d20Bonus: number;
      /** On a critical fail, what the member paid the vault: the claim's worth times the bonus die, capped at what they had. 0 otherwise. */
      d20Penalty: number;
      /**
       * The multiplier STONKS! (stonks gear) applied, from how many hours passed since the last
       * claim: null when the member has none equipped or it changed nothing (1x, right after a
       * claim). Only one unique treasure can be equipped at a time, so this and `wheel`/`d20` are
       * never both set for a real member.
       */
      stonks: number | null;
      /** How many points STONKS! added; 0 when it didn't apply. */
      stonksBonus: number;
      /** Set when a member who robbed them took part of this claim (see the claimTax effect). */
      taxed: { amount: number; toUserId: string } | null;
      balance: number;
      nextClaimUnix: number;
    }
  | { ok: false; nextClaimUnix: number };

/** Where a STONKS! wearer's claim multiplier stands (the balance shows it). */
export interface StonksStatus {
  /** What a claim made now would be multiplied by. */
  multiplier: number;
  /** The most it climbs to. */
  cap: number;
  /** When it reaches the cap (unix seconds), or null once it has. */
  maxAtUnix: number | null;
}

/**
 * The STONKS! multiplier a claim in `hour` would get with `gear`, worked out as claimHourly does, and
 * when it tops out; null when the gear has no STONKS! to climb.
 */
export function stonksStatus(lastClaimHour: number, gear: EffectTotals, hour: number, capHours = CONFIG.stonks.capHours): StonksStatus | null {
  const cap = stonksMultiplier(Number.POSITIVE_INFINITY, gear, capHours);
  if (!(cap > 1)) return null;
  const multiplier = stonksMultiplier(hour - lastClaimHour, gear, capHours);
  // Claims go by whole clock hours: the cap is reached at the start of the first hour far enough out.
  const maxHour = Math.ceil(lastClaimHour + claimGapHours(gear) + capHours);
  return { multiplier, cap, maxAtUnix: multiplier < cap ? (maxHour * HOUR_MS) / 1000 : null };
}

/**
 * The first clock hour in which the member can make a normal claim: the hour after their last
 * claim, or later if that claim was made in gear that lengthens the wait (claimGapHours).
 */
export function claimReadyHour(member: Pick<MemberDoc, 'lastClaimHour' | 'claimGapHours'>): number {
  return member.lastClaimHour + Math.max(1, member.claimGapHours ?? 1);
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
    // The member has to wait out the last claim: an hour, or longer if it was made in gear that
    // slows them down (the wait is fixed when the claim is made, so taking the gear off doesn't
    // skip it).
    const readyHour = member ? claimReadyHour(member) : hour;
    if (readyHour > hour) return { ok: false, nextClaimUnix: nextHourUnix(readyHour - 1) };

    // Equipped gear can add a bonus on top of the roll, the wheel can then multiply it, and the
    // D20 comes last: it can wipe the claim out, multiply it by its bonus die or scale it by the number rolled.
    const gear = gearEffects(await resolveGear(guildId, userId, member?.equipment), userId);
    const gap = claimGapHours(gear);
    const withGear = claimAmount(rolled, gear);
    const wheel = spinWheel(wheelChance(gear), wheelDice, wheelSlices(CONFIG.wheel.maxMultiplier));
    const afterWheel = wheel ? applyWheel(withGear, wheel.multiplier) : withGear;
    const d20 = rollD20(d20Chance(gear), d20Dice);
    const afterD20 = d20 ? applyD20(afterWheel, d20) : afterWheel;
    const failed = d20?.kind === 'fail';
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

    // Only matches if this member has not claimed during the current hour.
    const updated = await members.findOneAndUpdate(
      {
        guildId,
        userId,
        lastClaimHour: { $lte: hour - Math.max(1, member?.claimGapHours ?? 1) },
        claimTaxRate: taxRate,
        claimTaxBy: taxBy,
      },
      {
        $inc: { points: kept },
        $set: {
          lastClaimHour: hour,
          // How long until the next normal claim (2 = every second hour, with sloth gear).
          claimGapHours: gap,
          ...(failed ? {} : { claimTaxRate: null, claimTaxBy: null }),
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      const current = await members.findOne({ guildId, userId });
      if (current && claimReadyHour(current) <= hour) continue; // only the tax changed: try again
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
    // A critical fail also costs the member what the claim would have paid, times the bonus die,
    // paid into the vault. Taken after the claim is recorded, capped at what they have.
    let penaltyPaid = 0;
    const penalty = d20Penalty(afterWheel, d20);
    if (penalty > 0) {
      try {
        const before = await members.findOneAndUpdate({ guildId, userId }, clampedDebit(penalty), { returnDocument: 'before' });
        penaltyPaid = before ? Math.min(penalty, before.points) : 0;
      } catch (err) {
        // The claim already happened; if the penalty can't be taken, it simply isn't.
        console.error('Could not take a D20 critical fail penalty:', err);
      }
      if (penaltyPaid > 0) {
        entries.push({ guildId, userId, delta: -penaltyPaid, reason: 'd20_penalty' });
        await addVaultLoss(guildId, penaltyPaid);
      }
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
      d20Penalty: penaltyPaid,
      stonks: stonksMult > 1 ? stonksMult : null,
      stonksBonus: amount - afterD20,
      taxed: paid > 0 && taxBy !== null ? { amount: paid, toUserId: taxBy } : null,
      balance: updated.points + (tax > 0 && paid === 0 ? tax : 0) - penaltyPaid,
      nextClaimUnix: nextHourUnix(hour + gap - 1),
    };
  }
  return { ok: false, nextClaimUnix };
}
