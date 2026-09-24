import { randomUUID } from 'node:crypto';
import { CONFIG } from '../../config.js';
import { MINUTE_MS, ROB_LOCK } from '../../constants/index.js';
import { collections } from '../../db.js';
import { gearEffects } from '../../lib/game/equipment.js';
import { chance, randInt } from '../../lib/random.js';
import {
  applyWheel,
  claimTaxRate,
  emptyTotals,
  robCooldownScale,
  robFine,
  robStolenAmount,
  robSuccessChance,
  robTaxAmount,
  robTaxRate,
  rollWheelDice,
  spinWheel,
  wheelChance,
  type WheelSpin,
} from '../../perks/index.js';
import { resolveGear } from '../gear.js';
import { addVaultLoss } from '../vault.js';
import { type LedgerInput, recordLedger, ensureMember, transferClamped } from './shared.js';
import { sleep } from '../../lib/time.js';

/*
 * Robbing another member.
 */

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
      await sleep(ROB_LOCK.retryMs);
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
