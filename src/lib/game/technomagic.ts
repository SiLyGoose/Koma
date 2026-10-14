import { randomInt } from 'node:crypto';
import type { Settings } from '../../config.js';
import { TM_DROPS } from '../../data/items.js';
import type { ItemDef } from '../../types.js';
import { chance as rollChance } from '../random.js';
import { BOSS_IDS, HERO_SKINS, MOST_STAGE, SIM_VERSION, STEP_SECONDS, replay, startRaid, type LiveRaid, type Replay, type Run } from '../../../vendor/technomagic-sim.mjs';

/*
 * The TechnoMagic Raid, with no database. Its fight is Koma-UI's sim (src/technomagic/sim/), which the bot
 * has as vendor/technomagic-sim.mjs (built there by `yarn build:sim`): a room's fight is run by the bot with
 * it (web/games/technomagic/), and every page runs the same one. A win gives one TechnoMagic item
 * (ItemDef.tmDrop), 4-star the likelier the higher the stage. The database side is services/technomagic.ts.
 */

export { BOSS_IDS, HERO_SKINS, MOST_STAGE, SIM_VERSION, STEP_SECONDS, replay, startRaid, type LiveRaid, type Replay, type Run };

/** The boss a run is fought against (the only one so far). */
export const TM_BOSS = 'galgoria';
type DropSettings = Pick<Settings['hero'], 'fourStarChance' | 'fourStarPerStage'>;

/** The chance (0 to 1) a win at `stage` gives a 4-star item. */
export const fourStarChance = (stage: number, cfg: DropSettings): number => Math.min(1, Math.max(0, cfg.fourStarChance + cfg.fourStarPerStage * Math.max(0, stage - 1)));

/** The random numbers a drop uses; only tests replace them. */
export interface TmRng {
  chance: (probability: number) => boolean;
  index: (max: number) => number;
}

const defaultRng: TmRng = { chance: rollChance, index: (max) => randomInt(0, max) };

/** The TechnoMagic item a win at `stage` gives: a 4-star one by fourStarChance, else a 3-star one, each of its tier as likely (null: there are none). */
export function rollTmDrop(stage: number, cfg: DropSettings, rng: TmRng = defaultRng, pool: readonly ItemDef[] = TM_DROPS): ItemDef | null {
  const four = pool.filter((item) => item.stars === 4);
  const three = pool.filter((item) => item.stars === 3);
  const tier = four.length > 0 && (three.length === 0 || rng.chance(fourStarChance(stage, cfg))) ? four : three;
  return tier.length > 0 ? (tier[rng.index(tier.length)] as ItemDef) : null;
}
