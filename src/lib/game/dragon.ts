import { randomInt } from 'node:crypto';
import { CONFIG, type Settings } from '../../config.js';
import { dragonDrops, NORMAL_PAYS_FROM, normalPaysAs } from '../../constants/technomagic.js';
import { RAID_DROPS } from '../../data/items.js';
import { DRAGON_ESSENCES, ESSENCES, type EssenceId } from '../../data/transcend.js';
import type { ItemDef } from '../../types.js';
import type { RaidMode } from '../../protocol/technomagic.js';
import { DRAGON_INFO, type BossInfo } from '../../../vendor/technomagic-sim.mjs';

/*
 * The Dragon Raid, with no database: King's Raid's dragons (Koma-UI's src/technomagic/sim/bosses/, the bot's
 * vendor/technomagic-sim.mjs), fought in rooms as the TechnoMagic Raid is (web/games/technomagic/), one room a dragon. It
 * is the raid heroes farm: a win gives hero gear (raid items, never TechnoMagic gear: DRAGON_DROPS), points and hero
 * essences of its dragon's kinds (DRAGON_ESSENCES), more of each at the higher stages (the `dragon.*` settings). The
 * database side is services/dragon.ts.
 */

/** The dragons there are, in order (the first is fought unless another is asked for). */
export const DRAGONS: readonly BossInfo[] = DRAGON_INFO;
export const DRAGON_IDS: readonly string[] = DRAGONS.map((dragon) => dragon.id);
export const isDragon = (id: string): boolean => DRAGON_IDS.includes(id);

/** The random numbers a drop uses; only tests replace them. */
export interface DragonRng {
  index: (max: number) => number;
}

const defaultRng: DragonRng = { index: (max) => randomInt(0, max) };

/**
 * What a win at `stage` pays each player: so many points, and so many of each of its dragon's essences. In `mode` Normal, as
 * the Hard stage it pays as (normalPaysAs); one easier than all of them, what Hard stage 1 pays, as much less as its stage
 * is of the first that pays as one of Hard's.
 */
export function dragonPay(stage: number, cfg: Settings['dragon'] = CONFIG.dragon, mode: RaidMode = 'hard'): { points: number; essences: number } {
  if (mode === 'normal') {
    const as = normalPaysAs(stage);
    if (as > 0) return dragonPay(as, cfg);
    const first = dragonPay(1, cfg);
    const of = Math.max(1, Math.floor(stage)) / NORMAL_PAYS_FROM;
    return { points: Math.round(first.points * of), essences: Math.round(first.essences * of) };
  }
  const past = Math.max(0, Math.floor(stage) - 1);
  return { points: Math.max(0, cfg.winPoints + cfg.pointsPerStage * past), essences: Math.max(0, cfg.essences + cfg.essencesPerStage * past) };
}

/** The essences beating `dragon` gives: `amount` of each of its two kinds (one rolled, each as likely, where it has null). */
export function rollDragonEssences(dragon: string, amount: number, rng: DragonRng = defaultRng): Partial<Record<EssenceId, number>> {
  const kinds = DRAGON_ESSENCES[dragon];
  if (!kinds || amount <= 0) return {};
  const out: Partial<Record<EssenceId, number>> = {};
  for (const kind of kinds) {
    const id = kind ?? (ESSENCES[rng.index(ESSENCES.length)] as EssenceId);
    out[id] = (out[id] ?? 0) + amount;
  }
  return out;
}

/** The hero gear a win at `stage` gives a player: DRAGON_DROPS of each tier, each a raid item of it picked at random (best first). */
export function rollDragonGear(stage: number, rng: DragonRng = defaultRng, pool: readonly ItemDef[] = RAID_DROPS): ItemDef[] {
  const counts = dragonDrops(stage);
  return ([4, 3] as const).flatMap((stars) => {
    const items = pool.filter((item) => item.stars === stars);
    return items.length === 0 ? [] : Array.from({ length: counts[stars] ?? 0 }, () => items[rng.index(items.length)] as ItemDef);
  });
}
