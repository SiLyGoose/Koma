import { randomInt } from 'node:crypto';
import { tmDropsOf } from '../../data/items.js';
import { tmSetOfBoss } from '../../data/tm-sets.js';
import type { ItemDef } from '../../types.js';
import {
  BOSS_IDS,
  HERO_SKINS,
  MOST_STAGE,
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
 * has as vendor/technomagic-sim.mjs (built there by `yarn build:sim`): a room's fight is run by the bot with
 * it (web/games/technomagic/), and every page runs the same one. A win gives one TechnoMagic item
 * (ItemDef.tmDrop) of the boss's own set (data/tm-sets.ts), and the copy comes with one of the sim's additional
 * skills (TM_SKILLS: the same list whatever the set), rolled as it drops. The database side is services/technomagic.ts.
 */

export { BOSS_IDS, HERO_SKINS, MOST_STAGE, MOST_TM_SKILLS, SIM_VERSION, STEP_SECONDS, TM_SKILLS, replay, startRaid, type LiveRaid, type Replay, type Run, type TmSkill };

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

/** A copy's additional skill, as the site and the bot say it, like "Vigor: Increases DMG dealt by 25% while HP is above 75%." (null: none, or one the sim doesn't know). */
export function tmSkillLine(id: string | null | undefined): string | null {
  const skill = id ? TM_SKILLS_BY_ID.get(id) : undefined;
  return skill ? `${skill.name}: ${skill.about}` : null;
}
