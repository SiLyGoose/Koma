export const HERO_SLOTS = ['weapon', 'armor', 'secondary', 'accessory', 'orb', 'treasure', 'side1', 'side2', 'side3', 'artifact'];
/** A hero's sub treasure slots: only its own unique treasures go in them. */
export const SIDE_SLOTS = ['side1', 'side2', 'side3'];
export const HERO_PARTS = ['weapon', 'armor', 'secondary', 'accessory', 'orb', 'treasure', 'artifact'];
/** Which part goes in each of a hero's slots. */
export const HERO_SLOT_PART = {
    weapon: 'weapon',
    armor: 'armor',
    secondary: 'secondary',
    accessory: 'accessory',
    orb: 'orb',
    treasure: 'treasure',
    side1: 'treasure',
    side2: 'treasure',
    side3: 'treasure',
    artifact: 'artifact',
};
/** Each part's name, as King's Raid's (its Secondary Gear here is the Mantle: shields, hats, capes, gloves… M.DEF). */
export const HERO_PART_NAME = {
    weapon: 'Weapon',
    armor: 'Armor',
    secondary: 'Mantle',
    accessory: 'Accessory',
    orb: 'Orb',
    treasure: 'Treasure',
    artifact: 'Artifact',
};
/** How far a hero can be transcended. */
export const TRANSCEND_MAX = 5;
/** The TP a hero has at each level (Transcend 0 first). */
export const TRANSCEND_TP = [0, 20, 35, 50, 65, 80];
/** The TP a hero has at its most from transcending (Transcendence Scrolls add more: TP_SCROLL_MOST). */
export const TRANSCEND_POINTS = TRANSCEND_TP[TRANSCEND_MAX];
/**
 * A Transcendence Scroll: crafted from any one TechnoMagic set's Boss Crystals (POST /api/heroes/craft-scroll; its price
 * HeroesCraft's `tpScroll`), held (HeroesView's `tpScrolls`) until used on a hero (POST /api/heroes/scroll), which gives that
 * hero TP_SCROLL_POINTS more TP for good, on top of its level's, up to TP_SCROLL_MOST from scrolls (95 TP at Transcend 5).
 */
export const TP_SCROLL_POINTS = 5;
/** The most TP scrolls give one hero (three of them). */
export const TP_SCROLL_MOST = 15;
/**
 * A hero's Transcend Perk pages (King's Raid's: up to 3 for each hero, its MaxTranscendHeroSkillPage): each its own pick of
 * perks out of the same TP, one of them in use (the fight's). Page 1 comes with the hero; the next one is bought for that
 * hero (POST /api/heroes/perk-page/buy, for HeroView.perkPages' `next` zeiucoins) and starts empty and in use; any bought
 * one is put in use again with POST /api/heroes/perk-page.
 */
export const PERK_PAGES_MAX = 3;
/**
 * Hero gear loadouts: King's Raid's Gear Custom (its EquipPresetInfo and StorageSlotExtendTable). They are the member's, not a
 * hero's: numbered slots, HERO_LOADOUTS.free of them to begin with and more bought one at a time (POST /api/heroes/loadout/buy,
 * for HeroLoadouts' `next` zeiucoins) up to HERO_LOADOUTS.most. Each keeps a hero's pieces in HERO_LOADOUT_SLOTS (never its
 * Weapon or treasures, as King's Raid's): Save puts the pieces the hero shown wears there in it (POST /api/heroes/loadout/save),
 * Equip puts its pieces on the hero shown (POST /api/heroes/loadout/equip: off any other hero wearing them), Reset empties it
 * (POST /api/heroes/loadout/reset), and it can be named (POST /api/heroes/loadout/name). A piece kept in one is never sold,
 * salvaged or used up by a refine, as a worn one isn't.
 */
export const HERO_LOADOUTS = { free: 4, most: 40, maxNameLength: 24 };
/** The slots a hero gear loadout keeps (King's Raid's SaveEquipParts: Armor, Mantle, Accessory, Orb and Artifact). */
export const HERO_LOADOUT_SLOTS = ['armor', 'secondary', 'accessory', 'orb', 'artifact'];
/** The hero essences: King's Raid's seven kinds (its fragments' types), each class using three of them. */
export const ESSENCES = ['justice', 'force', 'wisdom', 'strategy', 'patience', 'harmony', 'fortune'];
export const ESSENCE_NAME = {
    justice: 'Justice',
    force: 'Force',
    wisdom: 'Wisdom',
    strategy: 'Strategy',
    patience: 'Patience',
    harmony: 'Harmony',
    fortune: 'Fortune',
};
/** The tiers of King's Raid's hero gear a salvage rule can take: the dragon sets' (6 to 8) and the TechnoMagic sets' (9); never a T10's. */
export const SALVAGE_TIERS = [6, 7, 8, 9];
/** The most stars a salvage rule can take a piece at (its stars, 0★ to 5★: a drop's are 0). */
export const SALVAGE_STARS_MAX = 5;
/** The parts a salvage rule can pick: those the tiers it takes have. */
export const SALVAGE_PARTS = ['weapon', 'armor', 'secondary', 'accessory', 'orb'];
/** The parts a TechnoMagic piece can be crafted as (an accessory: any of its four kinds, or the one of TM_ACCESSORIES picked). */
export const TM_CRAFT_PARTS = ['armor', 'secondary', 'accessory', 'orb'];
/** An accessory's four kinds (King's Raid's), any of which crafting one can be narrowed to (POST /api/heroes/craft's `accessory`). */
export const TM_ACCESSORIES = ['ring', 'earrings', 'necklace', 'bracelet'];
/** Each accessory's name, as the pages say it. */
export const TM_ACCESSORY_NAME = { ring: 'Ring', earrings: 'Earrings', necklace: 'Necklace', bracelet: 'Bracelet' };
/**
 * Every transcendence perk, in the order the heroes page shows them: Transcend 1, everyone's; Transcend 2, its class's;
 * Transcend 3, a Light and a Dark one for each of its four skills; Transcend 5, a Light and a Dark one of its own.
 */
export const TRANSCEND_PERKS = [
    { id: 'atk-up', tier: 1, cost: 10 },
    { id: 'hp-up', tier: 1, cost: 10 },
    { id: 'def-up', tier: 1, cost: 10 },
    { id: 'crit-resist-up', tier: 1, cost: 10 },
    { id: 'monster-hunting', tier: 1, cost: 10 },
    { id: 'class-1', tier: 2, cost: 15 },
    { id: 'class-2', tier: 2, cost: 15 },
    { id: 'class-3', tier: 2, cost: 15 },
    { id: 'class-4', tier: 2, cost: 15 },
    { id: 'class-5', tier: 2, cost: 15 },
    { id: 's1-light', tier: 3, cost: 15 },
    { id: 's1-dark', tier: 3, cost: 15 },
    { id: 's2-light', tier: 3, cost: 15 },
    { id: 's2-dark', tier: 3, cost: 15 },
    { id: 's3-light', tier: 3, cost: 15 },
    { id: 's3-dark', tier: 3, cost: 15 },
    { id: 's4-light', tier: 3, cost: 15 },
    { id: 's4-dark', tier: 3, cost: 15 },
    { id: 't5-light', tier: 5, cost: 15 },
    { id: 't5-dark', tier: 5, cost: 15 },
];
/** What gear can raise in the raid, in the order its lines are listed (the bot's lib/game/heroes.ts HERO_STATS says what each is). */
export const HERO_STAT_IDS = [
    'atkFlat',
    'atk',
    'hpFlat',
    'hp',
    'crit',
    'critDamage',
    'speed',
    'pen',
    'acc',
    'defense',
    'defPhysicalFlat',
    'defPhysical',
    'defMagicalFlat',
    'defMagical',
    'block',
    'blockPhysical',
    'blockMagical',
    'blockDef',
    'blockDefPhysical',
    'blockDefMagical',
    'dodge',
    'dodgePhysical',
    'dodgeMagical',
    'tough',
    'toughPhysical',
    'toughMagical',
    'resist',
    'accuracy',
    'lifesteal',
    'critResist',
    'critResistPhysical',
    'critResistMagical',
    'heal',
    'recovery',
    'control',
    'manaAttack',
    'manaRegen',
    'manaDamage',
];
//# sourceMappingURL=heroes.js.map