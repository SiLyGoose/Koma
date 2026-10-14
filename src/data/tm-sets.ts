import type { RaidClassId } from '../constants/raid.js';
import type { TmSetId } from '../types.js';

/*
 * The TechnoMagic Raids' gear sets: one for each raid's boss, which drops only its own set's gear
 * (ItemDef.tmSet). A hero wearing four pieces of one set (both weapons and both armors, each working on its
 * class) has the set's effect, which depends on its class. The effects themselves are the raid's sim's
 * (Koma-UI's src/technomagic/sim/sets.ts): these lines say what they do, for the heroes page.
 */

/** How many pieces of a set make it: both weapons and both armors. */
export const TM_SET_PIECES = 4;

export interface TmSet {
  id: TmSetId;
  name: string;
  emoji: string;
  /** The raid boss that drops it. */
  boss: string;
  /** What the set does for a hero of each class (a class it does nothing for is left out). */
  effects: Partial<Record<RaidClassId, string>>;
}

const PERSEVERANCE_DPS = '+10% DMG, and another +1.5% every 10 seconds (up to +25% after 100 seconds)';
const PERSEVERANCE_SUPPORT = 'every ally +5% ATK and +10% defence (stacking with every other hero wearing it so)';
const HOPE_SUPPORT = 'every ally +5% ATK and +10% defence (stacking with every other hero wearing it so)';
const AUTHORITY_DPS = '+500 penetration from the start of the fight';
const AUTHORITY_SUPPORT = '+2 mana sections at the start, and the ally with the highest ATK can’t be knocked down for 15 seconds';

export const TM_SETS: readonly TmSet[] = [
  {
    id: 'perseverance',
    name: 'Perseverance',
    emoji: '⚔️',
    boss: 'galgoria',
    effects: {
      warrior: PERSEVERANCE_DPS,
      assassin: PERSEVERANCE_DPS,
      archer: PERSEVERANCE_DPS,
      mechanic: PERSEVERANCE_DPS,
      wizard: PERSEVERANCE_DPS,
      priest: PERSEVERANCE_SUPPORT,
      knight: PERSEVERANCE_SUPPORT,
    },
  },
  {
    id: 'hope',
    name: 'Hope',
    emoji: '🛡️',
    boss: 'siegfried',
    effects: {
      priest: HOPE_SUPPORT,
      mechanic: HOPE_SUPPORT,
      knight: 'takes 10% less, and takes 20% of what the boss deals every other ally on itself',
    },
  },
  {
    id: 'authority',
    name: 'Authority',
    emoji: '⚡',
    boss: 'ascalon',
    effects: {
      warrior: AUTHORITY_DPS,
      assassin: AUTHORITY_DPS,
      archer: AUTHORITY_DPS,
      wizard: AUTHORITY_DPS,
      priest: AUTHORITY_SUPPORT,
      mechanic: AUTHORITY_SUPPORT,
      knight: '+30% CC resist; its skills strip what helps the boss',
    },
  },
];

export const TM_SETS_BY_ID: ReadonlyMap<TmSetId, TmSet> = new Map(TM_SETS.map((set) => [set.id, set]));

/** The set a raid boss drops (null: it isn't a TechnoMagic Raid boss). */
export const tmSetOfBoss = (boss: string): TmSet | null => TM_SETS.find((set) => set.boss === boss) ?? null;
