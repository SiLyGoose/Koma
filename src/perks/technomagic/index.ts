import { definePerk } from '../define.js';

/*
 * The TechnoMagic Raid's perks: what the TechnoMagic gear (ItemDef.tmDrop) does for the hero wearing it.
 * Each raises one of the hero's stats in the raid (lib/game/heroes.ts adds them up, with the raid's own
 * gear counted there too), none of the numbers in stats.ts. The raid's chances and shares are points,
 * 1000 being 100% (Koma-UI's src/technomagic/combat/damage.ts); a strength here is that share (0.1: 100 points).
 */

export const tmAttack = definePerk({
  description: "TechnoMagic Raid: how much higher the hero's ATK is (its blows, heals and shields go by it).",
  defaults: { 1: 0.05, 2: 0.08, 3: 0.15, 4: 0.25 },
  min: 0,
  max: 10,
  text: (value) => `TechnoMagic: +${value} ATK`,
});

export const tmHp = definePerk({
  description: "TechnoMagic Raid: how much more HP the hero has.",
  defaults: { 1: 0.05, 2: 0.08, 3: 0.15, 4: 0.25 },
  min: 0,
  max: 10,
  text: (value) => `TechnoMagic: +${value} HP`,
});

export const tmCrit = definePerk({
  description: "TechnoMagic Raid: added to the hero's chance of a critical blow.",
  defaults: { 1: 0.03, 2: 0.05, 3: 0.08, 4: 0.12 },
  min: 0,
  max: 1,
  text: (value) => `TechnoMagic: +${value} crit chance`,
});

export const tmCritDamage = definePerk({
  description: "TechnoMagic Raid: added to how much harder the hero's critical blows are, as a share of a plain one (60% turns 2x into 2.6x).",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.4 },
  min: 0,
  max: 10,
  text: (value) => `TechnoMagic: +${value} crit damage`,
});

export const tmSpeed = definePerk({
  description: "TechnoMagic Raid: added to the hero's attack speed (everything it does is quicker by as much).",
  defaults: { 1: 0.03, 2: 0.05, 3: 0.08, 4: 0.12 },
  min: 0,
  max: 1,
  text: (value) => `TechnoMagic: +${value} attack speed`,
});

export const tmPen = definePerk({
  description: "TechnoMagic Raid: added to the hero's penetration (how much of the boss's defence it sees past).",
  defaults: { 1: 0.03, 2: 0.05, 3: 0.1, 4: 0.15 },
  min: 0,
  max: 1,
  text: (value) => `TechnoMagic: +${value} penetration`,
});

export const tmDefense = definePerk({
  description: "TechnoMagic Raid: how much higher the hero's physical and magical defence are.",
  defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.25 },
  min: 0,
  max: 10,
  text: (value) => `TechnoMagic: +${value} defence`,
});

export const tmBlock = definePerk({
  description: "TechnoMagic Raid: added to the hero's chance of blocking the boss's blows (of either kind).",
  defaults: { 1: 0.03, 2: 0.05, 3: 0.08, 4: 0.12 },
  min: 0,
  max: 1,
  text: (value) => `TechnoMagic: +${value} block`,
});

export const tmDodge = definePerk({
  description: "TechnoMagic Raid: added to the hero's chance of dodging the boss's blows (of either kind).",
  defaults: { 1: 0.02, 2: 0.03, 3: 0.05, 4: 0.08 },
  min: 0,
  max: 1,
  text: (value) => `TechnoMagic: +${value} dodge`,
});

export const tmResist = definePerk({
  description: "TechnoMagic Raid: added to the hero's CC resist (what knocks it down holds it the shorter by as much).",
  defaults: { 1: 0.05, 2: 0.08, 3: 0.12, 4: 0.2 },
  min: 0,
  max: 1,
  text: (value) => `TechnoMagic: +${value} CC resist`,
});

export const tmHeal = definePerk({
  description: "TechnoMagic Raid: how much more the hero's heals and shields give.",
  defaults: { 1: 0.05, 2: 0.08, 3: 0.15, 4: 0.25 },
  min: 0,
  max: 10,
  text: (value) => `TechnoMagic: heals and shields give ${value} more`,
});
