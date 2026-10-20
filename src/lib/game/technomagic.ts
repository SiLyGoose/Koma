import { randomInt } from 'node:crypto';
import { CONFIG } from '../../config.js';
import { KR_DROPS, dragonPieces, dragonTier, normalPaysAs, normalRuneGradeWeights, runeCount, runeGradeWeights } from '../../constants/technomagic.js';
import type { RaidMode } from '../../protocol/technomagic.js';
import { KR_ITEMS_BY_ID, KR_RUNES, krPiecesOf } from '../../data/kr-gear.js';
import { TM_ARMOR_DEFS } from '../../data/tm-main.js';
import { potentialStep, TM_POTENTIAL_IDS, TM_POTENTIAL_LINES, UT_OPTION_LINES } from '../../data/tm-potentials.js';
import { tmSetOfBoss } from '../../data/tm-sets.js';
import type { ItemDef, TmArmorDef, TmPotential } from '../../types.js';
import {
  BOSS_IDS,
  MOST_STAGE,
  MOST_TICKS,
  MOST_TM_SKILLS,
  SIM_VERSION,
  STEP_SECONDS,
  TM_BOSS_INFO,
  TM_SKILLS,
  replay,
  startRaid,
  type LiveRaid,
  type Replay,
  type Run,
  type BossInfo,
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

/** The TechnoMagic Raid's bosses (the Dragon Raid's dragons are lib/game/dragon.ts's), and the one a run is fought against unless another is asked for. */
export const TM_BOSSES: readonly BossInfo[] = TM_BOSS_INFO;
export const TM_BOSS = 'galgoria';
/** The random numbers a drop uses; only tests replace them. */
export interface TmRng {
  index: (max: number) => number;
}

const defaultRng: TmRng = { index: (max) => randomInt(0, max) };

/** The piece a win against `boss` gives: one of its set's (King's Raid's: data/kr-gear.ts), each as likely (null: it drops none). */
export function rollTmDrop(boss: string, rng: TmRng = defaultRng): ItemDef | null {
  const set = tmSetOfBoss(boss);
  const pool = set ? krPiecesOf(set.id) : [];
  return pool.length > 0 ? (pool[rng.index(pool.length)] as ItemDef) : null;
}

/**
 * The pieces a Dragon Raid win against `dragon` at `stage` gives: its own set's, of its stage's tier, each as likely. In `mode`
 * Normal, as the Hard stage it pays as (normalPaysAs); one easier than all of them, a piece of KR_DROPS.normal's tier from its
 * `piecesFrom` stage on.
 */
export function rollDragonPieces(dragon: string, stage: number, rng: TmRng = defaultRng, mode: RaidMode = 'hard'): ItemDef[] {
  const set = KR_DROPS.dragonSets[dragon];
  const as = mode === 'normal' ? normalPaysAs(stage) : stage;
  const easy = mode === 'normal' && as === 0;
  const pool = set ? krPiecesOf(set, easy ? KR_DROPS.normal.tier : dragonTier(as)) : [];
  const count = easy ? Number(stage >= KR_DROPS.normal.piecesFrom) : dragonPieces(as);
  return pool.length === 0 ? [] : Array.from({ length: count }, () => pool[rng.index(pool.length)] as ItemDef);
}

/** One of `weights`' indexes, as likely as its weight (none: the first). */
function weighted(weights: readonly number[], rng: TmRng): number {
  const scale = 1000;
  const total = weights.reduce((sum, w) => sum + Math.round(w * scale), 0);
  if (total <= 0) return 0;
  let at = rng.index(total);
  for (let i = 0; i < weights.length; i++) {
    at -= Math.round((weights[i] as number) * scale);
    if (at < 0) return i;
  }
  return weights.length - 1;
}

/**
 * The runes a win at `stage` gives (their ids): runeCount of them, each of a grade rolled by its raid's weights
 * (`dragon`: the Dragon Raid's, else a TechnoMagic Raid's), a grade 5 one a Velkazar rune now and then, else an Ancient one;
 * then one of that grade's runes, each as likely.
 */
export function rollRunes(stage: number, dragon: boolean, rng: TmRng = defaultRng, mode: RaidMode = 'hard'): string[] {
  // (A Normal Dragon Raid's win: as the Hard stage it pays as, or one easier than all of them KR_DROPS.normal's runes.)
  const as = dragon && mode === 'normal' ? normalPaysAs(stage) : stage;
  const easy = as === 0;
  const weights = easy ? normalRuneGradeWeights(stage) : runeGradeWeights(as, dragon);
  const out: string[] = [];
  for (let n = easy ? KR_DROPS.normal.runes : runeCount(as); n > 0; n--) {
    const grade = weighted(weights, rng) + 1;
    const velkazar = grade === 5 && rng.index(1000) < KR_DROPS.velkazar * 1000;
    const pool = KR_RUNES.filter((rune) => rune.grade === grade && (grade !== 5 || (rune.ancient === true) !== velkazar));
    if (pool.length > 0) out.push((pool[rng.index(pool.length)] as (typeof KR_RUNES)[number]).id);
  }
  return out;
}

/** The artifact a TechnoMagic Raid win at `stage` gives now and then (null: none this time): any as likely. */
export function rollArtifact(stage: number, rng: TmRng = defaultRng): ItemDef | null {
  const chance = KR_DROPS.artifact + KR_DROPS.artifactPerStage * Math.max(0, Math.floor(stage) - 1);
  if (rng.index(10_000) >= Math.round(chance * 10_000)) return null;
  const pool = [...KR_ITEMS_BY_ID.values()].filter((item) => item.kr?.part === 'artifact');
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
    // (In whole percents, or half ones for a range whose ends aren't whole: potentialStep.)
    const range = CONFIG.hero.potentials[stat];
    const step = potentialStep(range);
    const low = Math.round(range.min / step);
    const high = Math.max(low, Math.round(range.max / step));
    out.push({ stat, value: Math.round((low + rng.index(high - low + 1)) * step * 1000) / 1000 });
  }
  return out;
}

/** The options a unique treasure's copy comes with as it is pulled: UT_OPTION_LINES of the potentials, rolled as TechnoMagic gear's are. */
export const rollUtOptions = (rng: TmRng = defaultRng): TmPotential[] => rollTmPotentials(rng, UT_OPTION_LINES);

/** Whether a unique treasure's option is below its range's top (it can be enhanced). */
export const enhanceable = ({ stat, value }: TmPotential): boolean => {
  const range = CONFIG.hero.potentials[stat];
  return range !== undefined && value < range.max - 1e-9;
};

/**
 * A unique treasure's options with one of those below their range's top, at random, a step higher (potentialStep, never past
 * the top): UT_ENHANCE. Null: all are at their top.
 */
export function enhanceUtOptions(options: readonly TmPotential[], rng: TmRng = defaultRng): TmPotential[] | null {
  const open = options.map((option, i) => ({ option, i })).filter(({ option }) => enhanceable(option));
  if (open.length === 0) return null;
  const { i } = open[rng.index(open.length)] as { i: number };
  return options.map((option, k) => {
    if (k !== i) return option;
    const range = CONFIG.hero.potentials[option.stat];
    return { ...option, value: Math.min(range.max, Math.round((option.value + potentialStep(range)) * 1000) / 1000) };
  });
}

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
