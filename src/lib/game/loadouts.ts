import { LOADOUTS } from '../../constants/index.js';
import type { EquipmentDoc, MemberDoc } from '../../types.js';
import { normalize } from '../text.js';
import { equippedCopyIds } from './sell.js';

/*
 * Gear loadouts (constants/loadouts.ts): the rules, with no database. A member's active loadout is
 * what they wear (MemberDoc.equipment); every other loadout keeps its gear in MemberDoc.loadouts.
 */

/** The fields of a member document that loadouts are made from. */
export type LoadoutFields = Pick<MemberDoc, 'equipment' | 'loadouts' | 'activeLoadout'>;

/** Every loadout number, 1 to LOADOUTS.count. */
export const LOADOUT_NUMBERS: readonly number[] = Array.from({ length: LOADOUTS.count }, (_, i) => i + 1);

/** Words the loadout command reads as actions, so no loadout can be named one of them. */
export const LOADOUT_WORDS: readonly string[] = ['list', 'rename'];

/** Letters, numbers, spaces and a little punctuation: nothing that could format text or ping anyone. */
const NAME_CHARACTERS = /^[\p{L}\p{N} '’.!?&+-]+$/u;

export const defaultLoadoutName = (number: number): string => `Loadout ${number}`;

/** The member's active loadout. Anything missing or out of range counts as loadout 1. */
export function activeLoadoutOf(member: LoadoutFields | null | undefined): number {
  const active = member?.activeLoadout;
  return typeof active === 'number' && LOADOUT_NUMBERS.includes(active) ? active : 1;
}

export function loadoutName(member: LoadoutFields | null | undefined, number: number): string {
  return member?.loadouts?.[String(number)]?.name || defaultLoadoutName(number);
}

export interface LoadoutView {
  number: number;
  name: string;
  active: boolean;
  /** The copies in it (for the active one, what the member is wearing). */
  equipment: EquipmentDoc | null;
}

/** Every loadout of a member, in order. */
export function loadoutsOf(member: LoadoutFields | null | undefined): LoadoutView[] {
  const active = activeLoadoutOf(member);
  return LOADOUT_NUMBERS.map((number) => ({
    number,
    name: loadoutName(member, number),
    active: number === active,
    equipment: (number === active ? member?.equipment : member?.loadouts?.[String(number)]?.equipment) ?? null,
  }));
}

/** Every copy in any of the member's loadouts, worn or saved. Selling and refining never use these up. */
export function loadoutCopyIds(member: LoadoutFields | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const loadout of loadoutsOf(member)) for (const id of equippedCopyIds(loadout.equipment)) ids.add(id);
  return ids;
}

export type LoadoutLookup = { kind: 'found'; number: number } | { kind: 'ambiguous'; names: string[] } | { kind: 'none' };

/**
 * Finds a loadout by its number or its name, ignoring case and punctuation. An exact name wins;
 * otherwise part of a name works as long as it points to exactly one loadout.
 */
export function findLoadout(loadouts: readonly Pick<LoadoutView, 'number' | 'name'>[], query: string): LoadoutLookup {
  const trimmed = query.trim();
  if (/^\d+$/.test(trimmed)) {
    const number = Number(trimmed);
    return LOADOUT_NUMBERS.includes(number) ? { kind: 'found', number } : { kind: 'none' };
  }
  const wanted = normalize(trimmed);
  if (wanted === '') return { kind: 'none' };

  const exact = loadouts.find((loadout) => normalize(loadout.name) === wanted);
  if (exact) return { kind: 'found', number: exact.number };

  const partial = loadouts.filter((loadout) => normalize(loadout.name).includes(wanted));
  if (partial.length === 1) return { kind: 'found', number: (partial[0] as LoadoutView).number };
  if (partial.length > 1) return { kind: 'ambiguous', names: partial.map((loadout) => loadout.name) };
  return { kind: 'none' };
}

export type NameCheck =
  /** `name` is null to go back to the default name. */
  | { ok: true; name: string | null }
  | { ok: false; reason: 'too_long' | 'bad_characters' | 'no_letters' | 'reserved' }
  /** Another loadout already goes by this name (`number` is that one). */
  | { ok: false; reason: 'taken'; number: number };

/**
 * Checks a new name for loadout `number`, tidying its spaces. An empty name means the default
 * again. A name must have a letter in it (so it can't be mistaken for a loadout number), can't be
 * one of the command's words, and can't match another of the member's loadouts, so switching by
 * name always finds exactly one.
 */
export function checkLoadoutName(member: LoadoutFields | null | undefined, number: number, raw: string): NameCheck {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name === '') return { ok: true, name: null };
  if (name.length > LOADOUTS.maxNameLength) return { ok: false, reason: 'too_long' };
  if (!NAME_CHARACTERS.test(name)) return { ok: false, reason: 'bad_characters' };
  if (!/\p{L}/u.test(name)) return { ok: false, reason: 'no_letters' };
  const wanted = normalize(name);
  if (LOADOUT_WORDS.includes(wanted)) return { ok: false, reason: 'reserved' };
  const clash = loadoutsOf(member).find((loadout) => loadout.number !== number && normalize(loadout.name) === wanted);
  if (clash) return { ok: false, reason: 'taken', number: clash.number };
  return { ok: true, name: name === defaultLoadoutName(number) ? null : name };
}
