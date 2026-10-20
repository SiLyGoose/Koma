import { RAID_CLASS_IDS, type RaidClassId } from '../constants/raid.js';
import { TM_HEROES } from '../../vendor/technomagic-sim.mjs';
import type { HeroSkillView } from '../protocol/heroes.js';

/*
 * The TechnoMagic Raid's heroes: the ones a member can buy in the site's shop (services/heroes.ts), for
 * hero.price points each, and fight with in the raid, each in the gear they put on it on the site's heroes
 * page. Which heroes there are, and what each is, is the raid's (Koma-UI's src/technomagic/sim/heroes/, here as
 * vendor/technomagic-sim.mjs's TM_HEROES). A hero's class is the raid classes' (constants/raid.ts): a class item
 * (ItemDef.class) only works on a hero of its class.
 */

export interface HeroDef {
  id: string;
  name: string;
  class: RaidClassId;
  /** The kind of damage its blows deal. */
  deals: 'physical' | 'magical';
  /** How many skins it has (its own first): one is picked for the raid by its index. */
  skins: number;
  /** Its three skills, then its passive, as the heroes page says them (the raid's). */
  abilities: readonly HeroSkillView[];
}

const isRaidClass = (id: string): id is RaidClassId => (RAID_CLASS_IDS as readonly string[]).includes(id);

/** In the order the shop and the heroes page show them. */
export const HEROES: readonly HeroDef[] = TM_HEROES.map(({ id, name, class: heroClass, deals, skins, skills }) => {
  if (!isRaidClass(heroClass)) throw new Error(`The raid's hero ${id} is of a class the bot doesn't know (${heroClass})`);
  return { id, name, class: heroClass, deals, skins, abilities: skills };
});

export const HEROES_BY_ID: ReadonlyMap<string, HeroDef> = new Map(HEROES.map((hero) => [hero.id, hero]));
