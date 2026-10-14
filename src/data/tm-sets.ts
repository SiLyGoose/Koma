import type { RaidClassId } from '../constants/raid.js';
import type { ItemDef, TmSetId } from '../types.js';

/*
 * The TechnoMagic Raids' gear sets: one for each raid's boss, which drops only its own set's gear
 * (ItemDef.tmSet). A hero wearing three pieces of one set (of its two weapons and two armors, each working on
 * its class) has the set's effect, which depends on its class. The effects themselves are the raid's sim's
 * (Koma-UI's src/technomagic/sim/sets.ts): these lines say what they do, for the heroes page and each piece's own.
 */

/** How many pieces of a set make it: three of a hero's weapons and armors. */
export const TM_SET_PIECES = 3;

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
