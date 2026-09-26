import { collections } from '../db.js';
import { activeLoadoutOf, checkLoadoutName, loadoutName, loadoutsOf, type LoadoutView, type NameCheck } from '../lib/game/loadouts.js';
import type { GearIds } from '../types.js';
import { ensureMember } from './economy/index.js';
import { resolveGear } from './gear.js';

/*
 * Gear loadouts (constants/loadouts.ts, rules in lib/game/loadouts.ts). The active loadout's gear
 * is the member's `equipment`, so equip, unequip and every perk keep working on it unchanged.
 * Switching moves that gear into the loadout being left and the new loadout's gear into
 * `equipment`, in one update.
 */

/** A loadout with its gear as item ids and levels, counting only copies the member still owns. */
export interface ResolvedLoadout extends LoadoutView {
  gear: GearIds;
}

/** A member's loadouts, with their copy ids as stored. */
export async function getLoadoutViews(guildId: string, userId: string): Promise<LoadoutView[]> {
  return loadoutsOf(await collections().members.findOne({ guildId, userId }));
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
  | { ok: false; reason: 'busy' };

/** Makes loadout `to` the active one: its gear goes on, and what they were wearing is saved to the one they left. */
export async function switchLoadout(guildId: string, userId: string, to: number): Promise<SwitchResult> {
  const { members } = collections();
  await ensureMember(guildId, userId);

  for (let attempt = 0; attempt < 3; attempt++) {
    const member = await members.findOne({ guildId, userId });
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
      return { ok: true, from, to, name: loadoutName(updated, to), alreadyActive: false, gear: await resolveGear(guildId, userId, updated.equipment) };
    }
  }
  return { ok: false, reason: 'busy' };
}

export type RenameResult = { ok: true; before: string; after: string } | Extract<NameCheck, { ok: false }>;

/** Names loadout `number`. An empty name puts back its default name. */
export async function renameLoadout(guildId: string, userId: string, number: number, raw: string): Promise<RenameResult> {
  const { members } = collections();
  await ensureMember(guildId, userId);
  const member = await members.findOne({ guildId, userId });
  const check = checkLoadoutName(member, number, raw);
  if (!check.ok) return check;

  const updated = await members.findOneAndUpdate(
    { guildId, userId },
    { $set: { [`loadouts.${number}.name`]: check.name } },
    { returnDocument: 'after' },
  );
  return { ok: true, before: loadoutName(member, number), after: loadoutName(updated, number) };
}
