import type { RaidClassId } from '../constants/raid.js';

/*
 * The TechnoMagic Raid's heroes: the ones a member can buy in the site's shop (services/heroes.ts), for
 * hero.price points each, and fight with in the raid, each in the gear they put on it on the site's heroes
 * page. The raid itself is the site's (Koma-UI's src/technomagic/): it knows each hero by these ids (its
 * folder there), and what each one does in a fight. A hero's class is the raid classes' (constants/raid.ts):
 * a class item (ItemDef.class) only works on a hero of its class.
 */

export interface HeroDef {
  id: string;
  name: string;
  class: RaidClassId;
}

/** In the order the shop and the heroes page show them. */
export const HEROES: readonly HeroDef[] = [
  { id: 'kirze', name: 'Kirze', class: 'warrior' },
  { id: 'clause', name: 'Clause', class: 'knight' },
  { id: 'fallen-frey', name: 'Fallen Frey', class: 'priest' },
  { id: 'gremory', name: 'Gremory', class: 'assassin' },
  { id: 'annette', name: 'Annette', class: 'mechanic' },
  { id: 'morrah', name: 'Morrah', class: 'knight' },
  { id: 'laias', name: 'Laias', class: 'priest' },
  { id: 'seria', name: 'Seria', class: 'warrior' },
  { id: 'ezekiel', name: 'Ezekiel', class: 'assassin' },
];

export const HEROES_BY_ID: ReadonlyMap<string, HeroDef> = new Map(HEROES.map((hero) => [hero.id, hero]));
