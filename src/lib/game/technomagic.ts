import { randomInt } from 'node:crypto';
import { tmDropsOf } from '../../data/items.js';
import { tmSetOfBoss } from '../../data/tm-sets.js';
import type { ItemDef } from '../../types.js';
import { BOSS_IDS, HERO_SKINS, MOST_STAGE, SIM_VERSION, STEP_SECONDS, replay, startRaid, type LiveRaid, type Replay, type Run } from '../../../vendor/technomagic-sim.mjs';

/*
 * The TechnoMagic Raid, with no database. Its fight is Koma-UI's sim (src/technomagic/sim/), which the bot
 * has as vendor/technomagic-sim.mjs (built there by `yarn build:sim`): a room's fight is run by the bot with
 * it (web/games/technomagic/), and every page runs the same one. A win gives one TechnoMagic item
 * (ItemDef.tmDrop) of the boss's own set (data/tm-sets.ts). The database side is services/technomagic.ts.
 */

export { BOSS_IDS, HERO_SKINS, MOST_STAGE, SIM_VERSION, STEP_SECONDS, replay, startRaid, type LiveRaid, type Replay, type Run };

/** The boss a run is fought against (the only one so far). */
export const TM_BOSS = 'galgoria';
/** The random numbers a drop uses; only tests replace them. */
export interface TmRng {
  index: (max: number) => number;
}

const defaultRng: TmRng = { index: (max) => randomInt(0, max) };

/** The TechnoMagic item a win against `boss` gives: one of its set's pieces, each as likely (null: it drops none). */
export function rollTmDrop(boss: string, rng: TmRng = defaultRng): ItemDef | null {
  const set = tmSetOfBoss(boss);
  const pool = set ? tmDropsOf(set.id) : [];
  return pool.length > 0 ? (pool[rng.index(pool.length)] as ItemDef) : null;
}
