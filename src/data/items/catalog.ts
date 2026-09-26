import { MEMBERS } from '../members.js';
import type { ItemDef } from '../../types.js';

/**
 * The item catalog. Add, rename or remove items here; ids must be unique and never change
 * once players own the item (inventories store the id). Items in the same star tier are
 * equally likely to be pulled.
 *
 * Every item goes in one slot (weapon, armor, or treasure) and lists the effects it gives while
 * equipped. Effect strength depends on the star tier and lives in the settings
 * (equipment.<effect>.<stars>), so a 3-star item is always stronger than a 1-star one that
 * lists the same effect. Weapons lean toward offense and armor toward defense, plus a perk.
 * Unique treasures (slot 'treasure') are a third slot every member has, on top of their weapon
 * and armor: it stacks with those two, but only one unique treasure can be equipped at a
 * time (every current 4-star item is a unique treasure and competes for that one slot).
 *
 * An item can be made exclusive with `usableBy: [MEMBERS.<name>, ...]` (add the member to
 * data/members.ts first). Anyone can pull, own and equip it, but only the listed members (and
 * the admin, for testing) get its effects. Leave `usableBy` out and everyone can use it.
 */
export const ITEMS: readonly ItemDef[] = [
  // 1 star
  {
    id: 'rusty-dagger',
    name: 'Rusty Dagger',
    stars: 1,
    slot: 'weapon',
    description: 'Pitted with age, but it still holds an edge.',
    effects: ['robChance'],
  },
  {
    id: 'wooden-shield',
    name: 'Wooden Shield',
    stars: 1,
    slot: 'armor',
    description: 'Splintered at the rim and smelling of old pine.',
    effects: ['robDefense'],
  },
  {
    id: 'sapling-wand',
    name: 'Sapling Wand',
    stars: 1,
    slot: 'weapon',
    description: 'A green stick that still has leaves on it. Its heals drip onto whoever is nearby.',
    effects: ['healSplash'],
  },
  {
    id: 'padded-gambeson',
    name: 'Padded Gambeson',
    stars: 1,
    slot: 'armor',
    description: 'Quilted cloth, stuffed thick. Not pretty, but it takes a hit.',
    effects: ['guardBoost'],
  },
  {
    id: 'tin-whistle',
    name: 'Tin Whistle',
    stars: 1,
    slot: 'weapon',
    description: 'Shrill enough to wake the whole party. They swing a little harder to make it stop.',
    effects: ['rallyBoost'],
  },
  {
    id: 'thorned-club',
    name: 'Thorned Club',
    stars: 1,
    slot: 'weapon',
    description: 'Wrapped in bramble. The scratches it leaves itch for days and never quite close.',
    effects: ['healCut'],
  },

  // 2 stars
  {
    id: 'iron-longsword',
    name: 'Iron Longsword',
    stars: 2,
    slot: 'weapon',
    description: "A soldier's blade, honest and well balanced.",
    effects: ['robChance', 'robAmount'],
  },
  {
    id: 'merchants-coat',
    name: "Merchant's Coat",
    stars: 2,
    slot: 'armor',
    description: 'Pockets everywhere, every one of them lined with silk.',
    effects: ['claimBonus'],
  },
  {
    id: 'kippah',
    name: 'Kippah',
    stars: 2,
    slot: 'armor',
    description: 'A small cap worn on the head. It is said to bring good luck.',
    effects: ['pullDiscount'],
  },
  {
    id: 'willow-wand',
    name: 'Willow Wand',
    stars: 2,
    slot: 'weapon',
    description: 'Cut from a tree that grew beside a healing spring. Its warmth spills over.',
    effects: ['healSplash'],
  },
  {
    id: 'studded-brigandine',
    name: 'Studded Brigandine',
    stars: 2,
    slot: 'armor',
    description: 'Riveted plates sewn into leather. Made for standing in front of things.',
    effects: ['guardBoost'],
  },
  {
    id: 'battle-horn',
    name: 'Battle Horn',
    stars: 2,
    slot: 'weapon',
    description: 'One blast and everyone swings a little harder.',
    effects: ['rallyBoost'],
  },
  {
    id: 'serrated-hatchet',
    name: 'Serrated Hatchet',
    stars: 2,
    slot: 'weapon',
    description: 'Its teeth tear rather than cut. Whatever it wounds has a hard time mending.',
    effects: ['healCut'],
  },

  // 3 stars
  {
    id: 'starfall-blade',
    name: 'Starfall Blade',
    stars: 3,
    slot: 'weapon',
    description: 'Hammered from a meteor. When it moves, the guards look the other way.',
    effects: ['robChance', 'fineReduction'],
  },
  {
    id: 'dragonscale-aegis',
    name: 'Dragonscale Aegis',
    stars: 3,
    slot: 'armor',
    description: 'A shield grown, not forged. It is said to have been worn by a dragon slayer.',
    effects: ['robDefense', 'robShield'],
  },
  {
    id: 'dragonbone-staff',
    name: 'Dragonbone Staff',
    stars: 3,
    slot: 'weapon',
    description: 'Carved from an old wyrm. Every heal it casts finds a second wound to close.',
    effects: ['healSplash'],
  },
  {
    id: 'wyrmscale-plate',
    name: 'Wyrmscale Plate',
    stars: 3,
    slot: 'armor',
    description: 'Scales shed by a dragon, hammered flat. Fire slides right off.',
    effects: ['guardBoost'],
  },
  {
    id: 'war-banner',
    name: 'War Banner',
    stars: 3,
    slot: 'weapon',
    description: 'Tattered from a hundred raids. Raise it, and the party remembers why they came.',
    effects: ['rallyBoost'],
  },
  {
    id: 'wyrmpiercer',
    name: 'Wyrmpiercer',
    stars: 3,
    slot: 'weapon',
    description: 'A lance forged for one thing only. The bigger the beast, the deeper it bites.',
    effects: ['maxHpDamage'],
  },
  {
    id: 'soulrender',
    name: 'Soulrender',
    stars: 3,
    slot: 'weapon',
    description: 'Forged to cut the threads that bind stolen life. Near it, nothing feeds as well as it used to.',
    effects: ['healCut'],
  },

  // 4 stars
  {
    id: 'c4',
    name: 'C4',
    stars: 4,
    usableBy: [MEMBERS.alvin],
    slot: 'treasure',
    description: 'Explosions first, questions later.',
    effects: ['glassCannon', 'glassCannonPenalty'],
  },
  {
    id: 'frog',
    name: 'Frog',
    stars: 4,
    usableBy: [MEMBERS.helen],
    slot: 'treasure',
    description: 'A frog with a kippah.',
    effects: ['robAmountCut', 'robTax'],
  },
  {
    id: 'sid-the-sloth',
    name: 'Sid the Sloth',
    stars: 4,
    usableBy: [MEMBERS.jj],
    slot: 'treasure',
    description: 'Slow and steady wins the race.',
    effects: ['slothDefense', 'slothCooldown'],
  },
  {
    id: 'wheelchair',
    name: 'Wheelchair',
    stars: 4,
    usableBy: [MEMBERS.aaron],
    slot: 'treasure',
    description: 'A wheelchair. It is a wheelchair.',
    effects: ['wheelSpin'],
  },
  {
    id: 'coughing-baby',
    name: 'Coughing Baby',
    stars: 4,
    usableBy: [MEMBERS.gene],
    slot: 'treasure',
    description: 'A baby. It is a baby.',
    effects: ['robAmountCut', 'claimTax'],
  },
  {
    id: 'piplup',
    name: 'Piplup',
    stars: 4,
    usableBy: [MEMBERS.simon],
    slot: 'treasure',
    description: 'Pip-pip.',
    effects: ['bubbleBeam', 'bubbleBeamPenalty'],
  },
  {
    id: 'd20',
    name: 'D20',
    stars: 4,
    usableBy: [MEMBERS.harrison],
    slot: 'treasure',
    description: 'Madness is at the heart of all gambling.',
    effects: ['d20'],
  },
  {
    id: 'stonks!',
    name: 'STONKS!',
    stars: 4,
    usableBy: [MEMBERS.caitlyn],
    slot: 'treasure',
    description: 'Patience is a virtue.',
    effects: ['stackosaurus'],
  },
  {
    id: 'chaewon-photocard',
    name: 'Chaewon Photocard',
    stars: 4,
    usableBy: [MEMBERS.allen],
    slot: 'treasure',
    description: 'Placeholder',
    effects: ['smart', 'iconicByMistake'],
  },
];
