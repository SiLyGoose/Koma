import { HEROES_BY_ID } from '../data/heroes.js';
import { collections } from '../db.js';
import type { RaidKind } from '../protocol/technomagic.js';
import type { SoloPickDoc } from '../types.js';

/*
 * Single player's lineups (MemberDoc.soloLineups): the one a member last had against each boss, kept on their member document
 * as it changes while they get ready (web/games/technomagic/room.ts), and given them again in their next room of their own against it.
 */

/** How many heroes a kept lineup holds at most: more than any lineup takes (TM_ROOM.dragonSoloSlots). */
const MOST = 16;

const keyOf = (raid: RaidKind, boss: string): string => `${raid}:${boss}`;

/** The lineup the member last had against `boss` in `raid` alone (none kept: empty), heroes that no longer exist left out. */
export async function soloLineup(guildId: string, userId: string, raid: RaidKind, boss: string): Promise<SoloPickDoc[]> {
  const key = keyOf(raid, boss);
  const member = await collections().members.findOne({ guildId, userId }, { projection: { [`soloLineups.${key}`]: 1 } });
  const kept = member?.soloLineups?.[key];
  if (!Array.isArray(kept)) return [];
  return kept.filter((pick) => typeof pick?.hero === 'string' && HEROES_BY_ID.has(pick.hero)).slice(0, MOST).map((pick) => ({ hero: pick.hero, ...(pick.sub === true && { sub: true }) }));
}

/** Keeps `picks` as the member's lineup against `boss` in `raid` alone (an empty one too: they took everyone out). */
export async function keepSoloLineup(guildId: string, userId: string, raid: RaidKind, boss: string, picks: readonly SoloPickDoc[]): Promise<void> {
  const kept = picks.slice(0, MOST).map((pick) => ({ hero: pick.hero, ...(pick.sub === true && { sub: true }) }));
  await collections().members.updateOne({ guildId, userId }, { $set: { [`soloLineups.${keyOf(raid, boss)}`]: kept } });
}
