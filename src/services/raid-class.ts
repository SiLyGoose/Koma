import { RAID_CLASS_IDS, type RaidClassId } from '../constants/index.js';
import { collections } from '../db.js';
import type { MemberDoc } from '../types.js';
import { ensureMember } from './economy/shared.js';
import { gearChanged } from './items/gear-events.js';

/*
 * A member's raid class (constants/raid.ts's RAID_CLASSES): picked on the site's gear page, by its class
 * ribbon, or in Discord with `class` (commands/class.ts), and changed whenever they like. It is kept on the member (`raidClass`, missing or null
 * means none) and read when a fight starts (commands/raid.ts), so a change made during a raid only
 * counts from the next one, as gear does.
 */

/** The class a member has: none when they never picked one (or it's no longer a class). */
export const raidClassOf = (member: Pick<MemberDoc, 'raidClass'> | null | undefined): RaidClassId | null =>
  member?.raidClass && RAID_CLASS_IDS.includes(member.raidClass) ? member.raidClass : null;

/** A member's class in `guildId` (none when they never picked one). */
export async function getRaidClass(guildId: string, userId: string): Promise<RaidClassId | null> {
  return raidClassOf(await collections().members.findOne({ guildId, userId }, { projection: { raidClass: 1 } }));
}

/** Each of those members' classes in `guildId`, in their order. */
export async function raidClassesOf(guildId: string, userIds: readonly string[]): Promise<(RaidClassId | null)[]> {
  const found = await collections()
    .members.find({ guildId, userId: { $in: [...userIds] } }, { projection: { userId: 1, raidClass: 1 } })
    .toArray();
  const byUser = new Map(found.map((member) => [member.userId, raidClassOf(member)]));
  return userIds.map((userId) => byUser.get(userId) ?? null);
}

/** Sets a member's class (null: none). Counts as a gear change, so the pages showing them follow. */
export async function setRaidClass(guildId: string, userId: string, id: RaidClassId | null): Promise<void> {
  await ensureMember(guildId, userId);
  await collections().members.updateOne({ guildId, userId }, { $set: { raidClass: id } });
  gearChanged(guildId, userId);
}
