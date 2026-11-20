import { RAID_BOSS_IDS, type RaidBossId } from '../../constants/index.js';

/*
 * Which boss a server fights in a raid week. It is settled from the server and the week alone, so
 * everyone sees the same boss all week (in `raid stats` before the raid starts, too) and nothing
 * needs saving. The weeks form a chain from FIRST_WEEK: each week's boss is picked at random from
 * every boss except the one before, so the same boss never comes two weeks running. With two
 * bosses they simply take turns.
 */

/** The week the chain starts from (a Saturday, like every week key). Earlier weeks are counted back from it the same way. */
const FIRST_WEEK = '2026-01-03';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** A fixed number from 0 to 1 for a text (FNV-1a), so every server gets its own order. */
function unit(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** The boss the server `guildId` fights in the raid week `weekKey` (lib/events/raid-week.ts). */
export function bossForWeek(guildId: string, weekKey: string, bosses: readonly RaidBossId[] = RAID_BOSS_IDS): RaidBossId {
  const count = bosses.length;
  const weeks = Math.round(Math.abs(Date.parse(`${weekKey}T00:00:00Z`) - Date.parse(`${FIRST_WEEK}T00:00:00Z`)) / WEEK_MS);
  let at = Math.floor(unit(`${guildId}:start`) * count);
  for (let week = 1; week <= weeks && count > 1; week++) {
    // Any boss but this one: step 1 to count - 1 places along.
    at = (at + 1 + Math.floor(unit(`${guildId}:${week}`) * (count - 1))) % count;
  }
  return bosses[at] as RaidBossId;
}
