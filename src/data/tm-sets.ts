import type { RaidClassId } from '../constants/raid.js';
import type { ItemDef, TmSetId } from '../types.js';
import { TM_SET_INFO, TM_SET_PIECES as PIECES } from '../../vendor/technomagic-sim.mjs';

/*
 * The TechnoMagic Raids' gear sets: one for each raid's boss, which drops only its own set's gear (King's Raid's: its
 * pieces are data/kr-gear.ts's, ItemDef.kr.set). A hero wearing four pieces of one set (of its Armor, Secondary Armor,
 * Accessory and Orb, each working on its class) has the set's effect, which depends on its class. Each set, and what it
 * does, is the raid's (Koma-UI's src/technomagic/sim/sets.ts: King's Raid's 4-piece skills, here as
 * vendor/technomagic-sim.mjs's TM_SET_INFO, said for the heroes page and each piece's own): which boss drops it is the bot's.
 */

/** How many pieces of a set make it: four (the raid's). */
export const TM_SET_PIECES: number = PIECES;

export interface TmSet {
  id: TmSetId;
  name: string;
  emoji: string;
  /** The raid boss that drops it. */
  boss: string;
  /** What the set does for a hero of each class (a class it does nothing for is left out). */
  effects: Partial<Record<RaidClassId, string>>;
}

/** The raid boss that drops each set. */
const DROPPED_BY: Readonly<Record<TmSetId, string>> = { perseverance: 'galgoria', hope: 'siegfried', authority: 'ascalon' };

const isSet = (id: string): id is TmSetId => Object.hasOwn(DROPPED_BY, id);

export const TM_SETS: readonly TmSet[] = TM_SET_INFO.map(({ id, name, icon, effects }) => {
  if (!isSet(id)) throw new Error(`The raid's set ${id} is dropped by no boss here`);
  return { id, name, emoji: icon, boss: DROPPED_BY[id], effects };
});

export const TM_SETS_BY_ID: ReadonlyMap<TmSetId, TmSet> = new Map(TM_SETS.map((set) => [set.id, set]));

/** What a piece's item calls its set's effect, over it: "3-set effect:". */
export const TM_SET_LABEL = `${TM_SET_PIECES}-set effect:`;

/**
 * A piece's set effect, as its item says it under TM_SET_LABEL: the set's effect for the piece's class, once a hero
 * wears TM_SET_PIECES of it, like "+10% DMG, …" (null: no set, or a treasure, which is apart from the set). Every
 * set's pieces have it, from its own entry.
 */
export function tmSetEffect(item: Pick<ItemDef, 'tmSet' | 'slot' | 'class'>): string | null {
  const set = item.tmSet && TM_SETS_BY_ID.get(item.tmSet);
  if (!set || item.slot === 'treasure') return null;
  const effect = item.class ? set.effects[item.class] : undefined;
  return effect ?? 'nothing for its class';
}

/** The set a raid boss drops (null: it isn't a TechnoMagic Raid boss). */
export const tmSetOfBoss = (boss: string): TmSet | null => TM_SETS.find((set) => set.boss === boss) ?? null;
