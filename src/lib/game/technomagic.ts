import { randomInt } from 'node:crypto';
import { CONFIG } from '../../config.js';
import { tmDropsOf } from '../../data/items.js';
import { TM_ARMOR_DEFS } from '../../data/tm-main.js';
import { TM_POTENTIAL_IDS, TM_POTENTIAL_LINES, UT_OPTION_LINES } from '../../data/tm-potentials.js';
import { tmSetOfBoss } from '../../data/tm-sets.js';
import type { ItemDef, TmArmorDef, TmPotential } from '../../types.js';
import {
  BOSS_IDS,
  MOST_STAGE,
  MOST_TICKS,
  MOST_TM_SKILLS,
  SIM_VERSION,
  STEP_SECONDS,
  TM_SKILLS,
  replay,
  startRaid,
  type LiveRaid,
  type Replay,
  type Run,
  type TmSkill,
} from '../../../vendor/technomagic-sim.mjs';

/*
 * The TechnoMagic Raid, with no database. Its fight is Koma-UI's sim (src/technomagic/sim/), which the bot
 * has as vendor/technomagic-sim.mjs (built there by its `yarn sync`): a room's fight is run by the bot with
 * it (web/games/technomagic/), and every page runs the same one. A win gives TechnoMagic items (ItemDef.tmDrop) of
 * the boss's own set (data/tm-sets.ts), more at the higher stages (TM_DROP_COUNTS), and each copy comes with one of the
 * sim's additional skills (TM_SKILLS: the same list whatever the set) and TM_POTENTIAL_LINES potentials
 * (data/tm-potentials.ts), rolled as it drops; an armor comes with its main stat's DEF too (data/tm-main.ts). The
 * database side is services/technomagic.ts.
 */

export { BOSS_IDS, MOST_STAGE, MOST_TICKS, MOST_TM_SKILLS, SIM_VERSION, STEP_SECONDS, TM_SKILLS, replay, startRaid, type LiveRaid, type Replay, type Run, type TmSkill };

export const TM_SKILLS_BY_ID: ReadonlyMap<string, TmSkill> = new Map(TM_SKILLS.map((skill) => [skill.id, skill]));

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

/** The additional skill a piece of TechnoMagic gear comes with: one of TM_SKILLS, each as likely (its id). */
export const rollTmSkill = (rng: TmRng = defaultRng): string => (TM_SKILLS[rng.index(TM_SKILLS.length)] as TmSkill).id;

/** The DEF a piece of TechnoMagic armor's main stat is (data/tm-main.ts): P.DEF or M.DEF, each as likely. */
export const rollTmArmorDef = (rng: TmRng = defaultRng): TmArmorDef => TM_ARMOR_DEFS[rng.index(TM_ARMOR_DEFS.length)] as TmArmorDef;

/** A potential's amount, to the nearest whole percent (as every copy's is). */
export const wholePercent = (value: number): number => Math.round(value * 100) / 100;

/**
 * The potentials a piece of TechnoMagic gear comes with: TM_POTENTIAL_LINES of them, each a different stat, each
 * as likely, and each by a whole percent between its range's ends (the settings' hero.potentials, to the nearest
 * whole percent), any as likely.
 */
export function rollTmPotentials(rng: TmRng = defaultRng, lines: number = TM_POTENTIAL_LINES): TmPotential[] {
  const pool = [...TM_POTENTIAL_IDS];
  const out: TmPotential[] = [];
  while (out.length < lines && pool.length > 0) {
    const [stat] = pool.splice(rng.index(pool.length), 1);
    if (stat === undefined) break;
    const low = Math.round(CONFIG.hero.potentials[stat].min * 100);
    const high = Math.max(low, Math.round(CONFIG.hero.potentials[stat].max * 100));
    out.push({ stat, value: (low + rng.index(high - low + 1)) / 100 });
  }
  return out;
}

/** The options a unique treasure's copy comes with as it is pulled: UT_OPTION_LINES of the potentials, rolled as TechnoMagic gear's are. */
export const rollUtOptions = (rng: TmRng = defaultRng): TmPotential[] => rollTmPotentials(rng, UT_OPTION_LINES);

/** A copy's potentials to the nearest whole percent: null if they already are (as the copies from before that were not). */
export function wholePotentials(potentials: readonly TmPotential[]): TmPotential[] | null {
  const whole = potentials.map(({ stat, value }) => ({ stat, value: wholePercent(value) }));
  return whole.some(({ value }, i) => value !== potentials[i]?.value) ? whole : null;
}

/** A copy's additional skill, as the site and the bot say it, like "Vigor: Increases DMG dealt by 25% while HP is above 75%." (null: none, or one the sim doesn't know). */
export function tmSkillLine(id: string | null | undefined): string | null {
  const skill = id ? TM_SKILLS_BY_ID.get(id) : undefined;
  return skill ? `${skill.name}: ${skill.about}` : null;
}
