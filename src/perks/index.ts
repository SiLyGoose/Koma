/*
 * The perk registry: every perk (effect) an item can have, one file each, by what it's about: rob/
 * (stealing and being stolen from), raid/ (the raid boss fight), economy/ (claims and pulls), and
 * items/ (perks made for one item, like the Sloth's or Chaewon's pairs). A perk with extra machinery
 * (the wheel, the D20, Pinecraft) gets its own folder with an index.ts instead.
 *
 * An item lists the perks it has by id (see data/items/catalog.ts). A perk file holds everything about
 * that perk: its settings (description, defaults per star tier, limits), its gear-card text, and
 * which of the game's numbers it changes (`modifies`). The formula each number is worked out with,
 * whichever perks change it, is in stats.ts.
 *
 * To add a new perk:
 *   1. Create a file in its folder (copy a similar perk) that exports `definePerk({ ... })`.
 *   2. Add it to EFFECTS in registry.ts. The key is the perk's id; its settings
 *      (equipment.<id>.<stars>), validation and config listing all come from this automatically.
 *   3. Give it to one or more items in data/items/catalog.ts.
 *   4. If it changes a number the game already works out (claim amount, rob chance, amount
 *      stolen, fine, pull cost, cooldowns, wheel/D20 chance... see StatId in stats.ts), list it
 *      under `modifies` in its file. That's all: every claim, rob and pull picks it up.
 *      Only a perk that is a new mechanic (like the wheel or the D20) needs a call where it
 *      happens: services/economy/claim.ts for claims, rob.ts for robs, gacha.ts for pulls.
 * (Strengths are percentages of something; the settings show and accept them as "10%" or 0.1.)
 */

export * from './registry.js';
export * from './stats.js';
// Every perk's functions, so callers can import from one place.
export * from './economy/claim-bonus.js';
export * from './rob/claim-tax.js';
export * from './d20/index.js';
export * from './pinecraft/index.js';
export * from './economy/pull-discount.js';
export * from './items/thoccy.js';
export * from './items/mp5.js';
export * from './rob/rob-tax.js';
export * from './items/bubble-beam.js';
export * from './items/sloth-cooldown.js';
export * from './items/stackosaurus.js';
export * from './wheel-spin/index.js';
export type { PerkDef } from './define.js';
