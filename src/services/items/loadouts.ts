import { collections } from '../../db.js';
import { activeLoadoutOf, checkLoadoutName, loadoutCountOf, loadoutName, loadoutsOf, lockedLoadoutsOf, type LoadoutView, type LockedLoadout, type NameCheck } from '../../lib/game/items/loadouts.js';
import type { GearIds } from '../../types.js';
import { ensureMember } from '../economy/index.js';
import { recordLedger } from '../economy/shared.js';
import { gearChanged } from './gear-events.js';
import { resolveGear } from './gear.js';

/*
 * Gear loadouts (constants/items/loadouts.ts, rules in lib/game/items/loadouts.ts). The active loadout's gear
 * is the member's `equipment`, so equip, unequip and every perk keep working on it unchanged.
 * Switching moves that gear into the loadout being left and the new loadout's gear into
 * `equipment`, in one update. Loadouts after the free ones are unlocked for points, one at a time.
 */

/** A loadout with its gear as item ids and levels, counting only copies the member still owns. */
export interface ResolvedLoadout extends LoadoutView {
  gear: GearIds;
}

/** A member's loadouts, with their copy ids as stored. */
export async function getLoadoutViews(guildId: string, userId: string): Promise<LoadoutView[]> {
  return loadoutsOf(await collections().members.findOne({ guildId, userId }));
}

/** The loadouts a member hasn't unlocked yet, with their prices: the first is the one to unlock next. */
export async function getLockedLoadouts(guildId: string, userId: string): Promise<LockedLoadout[]> {
  return lockedLoadoutsOf(await collections().members.findOne({ guildId, userId }, { projection: { loadoutSlots: 1 } }));
}

/** A member's loadouts, with the items and levels in each. */
export async function getLoadouts(guildId: string, userId: string): Promise<ResolvedLoadout[]> {
  return Promise.all(
    (await getLoadoutViews(guildId, userId)).map(async (loadout) => ({ ...loadout, gear: await resolveGear(guildId, userId, loadout.equipment) })),
  );
}

export type SwitchResult =
  | { ok: true; from: number; to: number; name: string; alreadyActive: boolean; gear: GearIds }
  /** Their loadouts kept changing while switching (several switches at once). Nothing changed. */
  | { ok: false; reason: 'busy' }
  /** They haven't unlocked that loadout. */
  | { ok: false; reason: 'locked' };

/** Makes loadout `to` the active one: its gear goes on, and what they were wearing is saved to the one they left. */
export async function switchLoadout(guildId: string, userId: string, to: number): Promise<SwitchResult> {
  const { members } = collections();
  await ensureMember(guildId, userId);

  for (let attempt = 0; attempt < 3; attempt++) {
    const member = await members.findOne({ guildId, userId });
    if (to > loadoutCountOf(member)) return { ok: false, reason: 'locked' };
    const from = activeLoadoutOf(member);
    if (from === to) {
      return { ok: true, from, to, name: loadoutName(member, to), alreadyActive: true, gear: await resolveGear(guildId, userId, member?.equipment) };
    }

    // Only if nobody switched in the meantime. Every value on the right is read from the document
    // as it was before this update, so the two sets of gear swap places exactly.
    const updated = await members.findOneAndUpdate(
      { guildId, userId, activeLoadout: member?.activeLoadout ?? null },
      [
        {
          $set: {
            [`loadouts.${from}.equipment`]: { $ifNull: ['$equipment', null] },
            equipment: { $ifNull: [`$loadouts.${to}.equipment`, {}] },
            [`loadouts.${to}.equipment`]: null,
            activeLoadout: to,
          },
        },
      ],
      { returnDocument: 'after' },
    );
    if (updated) {
      gearChanged(guildId, userId);
      return { ok: true, from, to, name: loadoutName(updated, to), alreadyActive: false, gear: await resolveGear(guildId, userId, updated.equipment) };
    }
  }
  return { ok: false, reason: 'busy' };
}

export type RenameResult = { ok: true; before: string; after: string } | Extract<NameCheck, { ok: false }> | { ok: false; reason: 'locked' };

/** Names loadout `number`. An empty name puts back its default name. */
export async function renameLoadout(guildId: string, userId: string, number: number, raw: string): Promise<RenameResult> {
  const { members } = collections();
  await ensureMember(guildId, userId);
  const member = await members.findOne({ guildId, userId });
  if (number > loadoutCountOf(member)) return { ok: false, reason: 'locked' };
  const check = checkLoadoutName(member, number, raw);
  if (!check.ok) return check;

  const updated = await members.findOneAndUpdate(
    { guildId, userId },
    { $set: { [`loadouts.${number}.name`]: check.name } },
    { returnDocument: 'after' },
  );
  return { ok: true, before: loadoutName(member, number), after: loadoutName(updated, number) };
}

export type UnlockResult =
  | { ok: true; number: number; name: string; paid: number; balance: number }
  /** They have every loadout there is. */
  | { ok: false; reason: 'maxed' }
  /** They already have loadout `number` (the one asked for). */
  | { ok: false; reason: 'owned'; number: number }
  /** The one asked for isn't next: `number` is, and has to be unlocked first. */
  | { ok: false; reason: 'locked'; number: number }
  | { ok: false; reason: 'too_poor'; number: number; price: number; balance: number }
  /** Their loadouts changed while unlocking (two unlocks at once). Nothing was paid. */
  | { ok: false; reason: 'busy' };

/**
 * Unlocks their next loadout (`wanted`, if given, must be it), paying its price. One conditional update
 * takes the points and adds the loadout, and only while nothing else has, so two unlocks at once can't both pay.
 */
export async function unlockLoadout(guildId: string, userId: string, wanted?: number): Promise<UnlockResult> {
  const { members } = collections();
  await ensureMember(guildId, userId);
  const member = await members.findOne({ guildId, userId });
  const next = lockedLoadoutsOf(member)[0];
  if (wanted !== undefined && wanted <= loadoutCountOf(member)) return { ok: false, reason: 'owned', number: wanted };
  if (!next) return { ok: false, reason: 'maxed' };
  if (wanted !== undefined && wanted !== next.number) return { ok: false, reason: 'locked', number: next.number };

  const unlocked = await members.findOneAndUpdate(
    { guildId, userId, loadoutSlots: member?.loadoutSlots ?? null, points: { $gte: next.price } },
    { $inc: { points: -next.price }, $set: { loadoutSlots: next.number } },
    { returnDocument: 'after' },
  );
  if (!unlocked) {
    const now = await members.findOne({ guildId, userId });
    if ((now?.loadoutSlots ?? null) !== (member?.loadoutSlots ?? null)) return { ok: false, reason: 'busy' };
    return { ok: false, reason: 'too_poor', number: next.number, price: next.price, balance: now?.points ?? 0 };
  }
  if (next.price > 0) await recordLedger([{ guildId, userId, delta: -next.price, reason: 'loadout_unlock' }]);
  return { ok: true, number: next.number, name: loadoutName(unlocked, next.number), paid: next.price, balance: unlocked.points };
}
