import { TM_CRAFT_PRICES } from '../protocol/heroes.js';
/*
 * The TechnoMagic Raid, played together on the games' site (web/games/technomagic/ for the rooms, Koma-UI's
 * src/technomagic/ for the fight, lib/game/technomagic.ts for its rewards). A server has one room: whoever
 * opens it joins, picks heroes into its lineup, and the host starts the fight, which everyone in the room
 * plays at once (each their own heroes). What a win gives, and how many runs a day give it, are settings
 * (`hero.*`).
 */

/**
 * A room's lineup: `slots` heroes all told (`soloSlots` with one player in it, `dragonSoloSlots` in the Dragon
 * Raid's, who then fights an easier boss), the host bringing up to `hostHeroes` of them and everyone else up to `guestHeroes` (alone, as many
 * as the slots: `mainTeam` of them in the Main Team, whose skills are theirs to use, and the rest in the Sub Team,
 * on Auto for the whole fight). As many `players` as can each bring a hero. One whose page goes away (a reload,
 * a phone switching apps) keeps their place and picks for `awayMs`, to come back to.
 */
export const TM_ROOM = {
  slots: 8,
  soloSlots: 7,
  dragonSoloSlots: 8,
  mainTeam: 4,
  hostHeroes: 4,
  guestHeroes: 3,
  players: 4,
  awayMs: 60_000,
} as const;

/** A Dragon Raid room's lineup, as TM_ROOM's but for King's Raid's Dragon Raid party: 9 heroes all told (alone, 8). */
export const DRAGON_ROOM = { ...TM_ROOM, slots: 9, soloSlots: TM_ROOM.dragonSoloSlots } as const;

/**
 * The fight's clock on the bot: it steps the fight every `turnMs` (as many steps as are due) and tells the
 * pages what everyone pressed and up to which step they may go. A room's lineup goes up in the server's
 * channel when it is opened, at most once every `announceMs`.
 */
export const TM_FIGHT = {
  turnMs: 100,
  /** The most presses (skills and Autos) a player makes in a turn: more are dropped (nobody taps faster than this). */
  pressesPerTurn: 4,
  /** A page whose run of a fight parted from the bot's is given it again no more than once in this long (ms). */
  resyncMs: 2000,
  announceMs: 10 * 60_000,
} as const;

/**
 * How many TechnoMagic items a win gives each player whose run gives gear, by the stage it was fought at (1 to 9:
 * the first number is stage 1's): 1 up to stage 4, 2 from stage 5, 3 from stage 8 (King's Raid's gave only now and then one).
 * Each is one of the boss's set's pieces, rolled apart.
 */
export const TM_DROP_COUNTS: readonly number[] = [1, 1, 1, 1, 2, 2, 2, 3, 3];

/** `table`'s entry for `stage` (1 to 9: the first is stage 1's; past the last, the last's). */
const byStage = (table: readonly number[], stage: number): number => table[Math.min(table.length, Math.max(1, Math.floor(stage))) - 1] as number;

/** How many items a win at `stage` gives (past the last stage, as many as the last). */
export const tmDropCount = (stage: number): number => byStage(TM_DROP_COUNTS, stage);

/**
 * King's Raid's Technomagic Gear Upgrade Stones, one kind for each class: what awakens a TechnoMagic piece of that class (0★ to
 * 5★), in place of a spare copy. A win gives `drops` of them by its stage (King's Raid's raids gave them from stage 7), all of
 * one class: one of the heroes the player brought. Awakening to each star costs `cost` (King's Raid's ValanceAwakenTable, by
 * the star it reaches), a Reclaimed piece `reclaimedCost` (its own rows: half as many again). Salvaging a TechnoMagic piece
 * gives `salvage` of its class's, a Reclaimed one `reclaimedSalvage`, whatever its stars (King's Raid's EquipItemBreakTable),
 * with its komaDust.
 */
export const TM_STONES = {
  drops: [0, 0, 0, 0, 0, 0, 10, 15, 20],
  cost: [10, 20, 40, 80, 160],
  reclaimedCost: [15, 30, 60, 120, 240],
  salvage: 1,
  reclaimedSalvage: 2,
} as const;

/** How many Upgrade Stones salvaging a TechnoMagic piece gives (`reclaimed`: a Reclaimed one's). */
export const tmSalvageStones = (reclaimed = false): number => (reclaimed ? TM_STONES.reclaimedSalvage : TM_STONES.salvage);

/** A class's stones' name, King's Raid's: "Technomagic Gear Upgrade Stone (Warrior)". */
export const tmStoneName = (cls: string): string => `Technomagic Gear Upgrade Stone (${cls.charAt(0).toUpperCase()}${cls.slice(1)})`;

/** How many stones a win at `stage` gives. */
export const tmStoneDrops = (stage: number): number => byStage(TM_STONES.drops, stage);

/** What awakening a TechnoMagic piece to `to` stars (1 to 5) costs in stones (`reclaimed`: a Reclaimed one's). */
export const tmStoneCost = (to: number, reclaimed = false): number => (reclaimed ? TM_STONES.reclaimedCost : TM_STONES.cost)[Math.min(5, Math.max(1, Math.floor(to))) - 1] as number;

/**
 * King's Raid's Reclaimed Technomagic Gear: a TechnoMagic piece with a higher main stat (`main` times as much: its
 * EquipUpgradeStatTable rows, 7,875 to 6,000 for ATK and HP, 10,500 to 8,000 for DEF), its options and additional skill as
 * any. Each TechnoMagic piece a win gives is one by `chance`, by its stage (King's Raid's: "a small chance", from stage 4).
 */
export const TM_RECLAIMED = {
  chance: [0, 0, 0, 0.05, 0.05, 0.05, 0.08, 0.1, 0.12],
  main: 1.3125,
} as const;

/** The chance a TechnoMagic piece a win at `stage` gives is Reclaimed. */
export const tmReclaimedChance = (stage: number): number => byStage(TM_RECLAIMED.chance, stage);

/**
 * King's Raid's Boss Crystals, one kind for each TechnoMagic set: its boss's (`boss`: Crystal of Galgoria for Perseverance,
 * Siegfried's for Hope, Ascalon's for Authority). They craft that set's pieces (TM_CRAFT) and reroll their options (`reroll`
 * each: King's Raid's 300, its Reforge Ticket left out) and, `skillReroll` each beside a komaGem, their additional skill
 * (the user's: King's Raid's took a Technomagic Skill Reforge Ticket). A TechnoMagic Raid win gives `drops` of its boss's by its stage
 * (King's Raid's: more the higher the stage); salvaging a piece gives `salvage` of its set's, a Reclaimed one
 * `reclaimedSalvage` (King's Raid's EquipItemBreakTable).
 */
export const TM_CRYSTALS = {
  boss: { perseverance: 'Galgoria', hope: 'Siegfried', authority: 'Ascalon' },
  drops: [100, 125, 150, 200, 250, 300, 350, 400, 500],
  reroll: 300,
  skillReroll: 300,
  salvage: 100,
  reclaimedSalvage: 200,
} as const;

/** How many Boss Crystals a win at `stage` gives. */
export const tmCrystalDrops = (stage: number): number => byStage(TM_CRYSTALS.drops, stage);

/** How many Boss Crystals salvaging a TechnoMagic piece gives (`reclaimed`: a Reclaimed one's). */
export const tmSalvageCrystals = (reclaimed = false): number => (reclaimed ? TM_CRYSTALS.reclaimedSalvage : TM_CRYSTALS.salvage);

/** A set's crystals' name, King's Raid's: "Crystal of Galgoria". */
export const tmCrystalName = (set: string): string => `Crystal of ${TM_CRYSTALS.boss[set as keyof typeof TM_CRYSTALS.boss] ?? set}`;

/**
 * Crafting a TechnoMagic set's piece (King's Raid's Valance's Workshop: its ValanceCraftTable), three ways: any of its pieces
 * (`any`), any class's piece of a part picked (`part`), or a class's part picked (`exact`), each for its set's crystals and
 * zeiucoins (King's Raid's gold, a thousandth: the user's; its Technomagic Experiment Reports left out). A crafted piece is
 * Reclaimed by `reclaimed` (King's Raid's: "a small chance").
 */
export const TM_CRAFT = { ...TM_CRAFT_PRICES, reclaimed: 0.05 } as const;

/** Playing it from its web page (the Koma-UI repo): `path` is where its web socket listens. */
export const TM_WEB = {
  path: '/technomagic',
  helloMs: 10_000,
  messagesPerSecond: 40,
} as const;

/**
 * The Dragon Raid (King's Raid's dragons: Koma-UI's src/technomagic/sim/bosses/), played in rooms as the TechnoMagic Raid is
 * (TM_ROOM, TM_FIGHT), one room a dragon in each server, on a page of its own: `path` is where its web socket listens.
 */
export const DRAGON_WEB = {
  path: '/dragon',
  helloMs: 10_000,
  messagesPerSecond: 40,
} as const;

/**
 * The hero gear a Dragon Raid win gives each player whose run pays, by the stage it was fought at (1 to 10: the first is stage
 * 1's): so many raid items (ItemDef.raidDrop, never TechnoMagic gear) of each star tier, each picked at random from its tier.
 */
export const DRAGON_DROPS: readonly Readonly<Partial<Record<3 | 4, number>>>[] = [{ 3: 1 }, { 3: 1 }, { 3: 2 }, { 3: 2 }, { 4: 1, 3: 2 }, { 4: 1, 3: 2 }, { 4: 1, 3: 3 }, { 4: 2, 3: 3 }, { 4: 2, 3: 4 }, { 4: 3, 3: 4 }];

/** What a Dragon Raid win at `stage` drops (past the last stage, as much as the last). */
export const dragonDrops = (stage: number): Readonly<Partial<Record<3 | 4, number>>> =>
  DRAGON_DROPS[Math.min(DRAGON_DROPS.length, Math.max(1, Math.floor(stage))) - 1] as Readonly<Partial<Record<3 | 4, number>>>;

/**
 * King's Raid's hero gear the raids drop besides (data/kr-gear.ts), each piece of its raid's set (a TechnoMagic Raid's,
 * its boss's: tmDropCount of them; a dragon's, its own: `dragonPieces` of them by its stage, 1 to 10), and their runes:
 *
 *   - a dragon's set (King's Raid's: the Fire Dragon's Opportune Fire, the Ice Dragon's Gritty Frost, the Poison Dragon's
 *     Unrelenting Poison, the Black Dragon's Swift Darkness), of the tier its stage reaches (`dragonTiers`: from stage 1, 4
 *     and 8);
 *   - runes, `runes` of them a win by its stage (1 to 3: 1, 4 to 6: 2, 7 on: 3), each of a grade (1 Common to 6
 *     Legendary) rolled by its raid's weights at its stage: a dragon's climbing from `dragonGrades[0]` at stage 1 to
 *     `dragonGrades[1]` at 10; a TechnoMagic Raid's from `tmGrades[0]` at stage 1 to `tmGrades[1]` at 9 (the hardest raid:
 *     its runes are better even at stage 1); a grade 5 one a Velkazar rune `velkazar` of the time, else an Ancient one;
 *   - an artifact, now and then, from a TechnoMagic Raid: `artifact` of the time at stage 1, `artifactPerStage` more for each
 *     stage past it;
 *   - a Normal Dragon Raid's win (a dragon's Normal mode, stages 1 to 20), as `normal` says: a stage as tough as one of the Hard
 *     Dragon Raid's (its dragon's health as much, as King's Raid's tables have them: from stage 13 on) pays as that one does
 *     (`paysAs`, by the stage; 0: none is). An easier one gives a piece of its dragon's set of tier `tier` from stage
 *     `piecesFrom` on (the playtest's Normal stages 7 and 8 are its T6 ones), `runes` runes, each of a grade rolled by weights
 *     climbing from `grades[0]` at stage 1 to `grades[1]` (the Hard Dragon Raid's stage 1's) at the last such stage, and the
 *     points and essences Hard stage 1 pays (the `dragon.*` settings), so much less: as its stage is of the first that pays as one of Hard's.
 */
export const KR_DROPS = {
  dragonSets: { temeraire: 'opportune-fire', scalaxia: 'gritty-frost', zyrrkinoth: 'unrelenting-poison', armarta: 'swift-darkness' } as Readonly<Record<string, string>>,
  dragonPieces: [1, 1, 2, 2, 3, 3, 4, 5, 6, 7] as readonly number[],
  dragonTiers: [
    [1, 6],
    [4, 7],
    [8, 8],
  ] as readonly (readonly [number, number])[],
  runes: [1, 1, 1, 2, 2, 2, 3] as readonly number[],
  dragonGrades: [
    [40, 35, 20, 5, 0, 0],
    [0, 0, 10, 30, 35, 25],
  ] as readonly (readonly number[])[],
  tmGrades: [
    [0, 0, 30, 40, 20, 10],
    [0, 0, 0, 20, 40, 40],
  ] as readonly (readonly number[])[],
  velkazar: 0.4,
  artifact: 0.03,
  artifactPerStage: 0.01,
  normal: {
    paysAs: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 4, 7, 8, 9, 10, 10] as readonly number[],
    piecesFrom: 7,
    tier: 6,
    runes: 1,
    grades: [
      [60, 30, 10, 0, 0, 0],
      [40, 35, 20, 5, 0, 0],
    ] as readonly (readonly number[])[],
  },
} as const;

/** How many runes a win at `stage` gives (past the last listed, as many as the last). */
export const runeCount = (stage: number): number => KR_DROPS.runes[Math.min(KR_DROPS.runes.length, Math.max(1, Math.floor(stage))) - 1] as number;

/** How many dragon set pieces a Dragon Raid win at `stage` gives, and of which tier. */
export const dragonPieces = (stage: number): number => KR_DROPS.dragonPieces[Math.min(KR_DROPS.dragonPieces.length, Math.max(1, Math.floor(stage))) - 1] as number;
export const dragonTier = (stage: number): number => KR_DROPS.dragonTiers.filter(([from]) => stage >= from).at(-1)?.[1] ?? 6;

/** The Hard Dragon Raid's stage a Normal Dragon Raid's win at `stage` pays as (0: none, it is easier than all of them; past the last, as the last). */
export const normalPaysAs = (stage: number): number => KR_DROPS.normal.paysAs[Math.min(KR_DROPS.normal.paysAs.length, Math.max(1, Math.floor(stage))) - 1] ?? 0;

/** The first Normal Dragon Raid stage that pays as one of the Hard Dragon Raid's (the ones before it are easier than all of them). */
export const NORMAL_PAYS_FROM: number = KR_DROPS.normal.paysAs.findIndex((as) => as > 0) + 1;

/**
 * The komaGems a Dragon Raid stage pays each player the first time they clear it (that dragon's, in that mode), by its mode and
 * stage (the first is stage 1's); a win there after pays none (the user's). A win clears every stage under it too (a member's
 * progress is the highest stage they have won), so a member carried past stages pays for each of them (dragonClearGems).
 */
export const DRAGON_GEMS = {
  normal: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4] as readonly number[],
  hard: [3, 3, 3, 3, 5, 5, 5, 10, 10, 10] as readonly number[],
} as const;

/** The komaGems clearing `stage` in `mode` the first time pays. Past the last stage, as the last. */
export function dragonGems(stage: number, mode: 'normal' | 'hard'): number {
  const table = DRAGON_GEMS[mode];
  return table[Math.min(table.length, Math.max(1, Math.floor(stage))) - 1] ?? 0;
}

/** The komaGems a Dragon Raid win at `stage` in `mode` pays a member whose highest cleared stage there was `cleared`: each stage past it, up to `stage`. */
export function dragonClearGems(cleared: number, stage: number, mode: 'normal' | 'hard'): number {
  let gems = 0;
  for (let at = Math.max(0, Math.floor(cleared)) + 1; at <= Math.floor(stage); at++) gems += dragonGems(at, mode);
  return gems;
}

/**
 * The komaGems a TechnoMagic Raid stage pays each player the first time they clear it, by its stage (the first is stage 1's);
 * as the Dragon Raid's, a win clears every stage under it too (tmClearGems).
 */
export const TM_GEMS: readonly number[] = [5, 5, 5, 10, 10, 10, 20, 20, 20];

/** The komaGems a TechnoMagic Raid win at `stage` pays a member whose highest cleared stage was `cleared`: each stage past it, up to `stage` (past the last, as the last). */
export function tmClearGems(cleared: number, stage: number): number {
  let gems = 0;
  for (let at = Math.max(0, Math.floor(cleared)) + 1; at <= Math.floor(stage); at++) gems += TM_GEMS[Math.min(TM_GEMS.length, at) - 1] ?? 0;
  return gems;
}

/** The weights of each rune grade a Normal Dragon Raid's win at `stage` rolls, where it pays as none of the Hard Dragon Raid's: from `grades[0]` at stage 1 to `grades[1]` at the last such stage. */
export function normalRuneGradeWeights(stage: number): number[] {
  const [first, last] = KR_DROPS.normal.grades as readonly (readonly number[])[];
  const easy = Math.max(2, NORMAL_PAYS_FROM - 1);
  const along = Math.min(1, Math.max(0, (Math.floor(stage) - 1) / (easy - 1)));
  return (first as readonly number[]).map((from, i) => from + ((last as readonly number[])[i] as number - from) * along);
}

/**
 * The weights of each rune grade (1 to 6) a win at `stage` rolls: its raid's (`dragon`: the Dragon Raid's over its 10 stages,
 * else a TechnoMagic Raid's over its 9), from its first stage's to its last's in even steps.
 */
export function runeGradeWeights(stage: number, dragon: boolean): number[] {
  const [first, last] = (dragon ? KR_DROPS.dragonGrades : KR_DROPS.tmGrades) as readonly (readonly number[])[];
  const stages = dragon ? 10 : 9;
  const along = Math.min(1, Math.max(0, (Math.floor(stage) - 1) / (stages - 1)));
  return (first as readonly number[]).map((from, i) => from + ((last as readonly number[])[i] as number - from) * along);
}
