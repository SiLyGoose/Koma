/*
 * King's Raid's Divine Punishment Raid (lib/game/divine.ts for its rules, services/divine.ts for the database, web/games/technomagic/
 * for its rooms). King's Raid's own numbers are data/divine-kr.ts's (the playtest's tables); what King's Raid kept on its server, or
 * paid in Gems and gold, is set here, each marked: "default" where it is mine, "KR" where it is King's Raid's.
 */

/**
 * A room's lineup (solo only, as King's Raid's): a boss dungeon `bossSlots` heroes, `bossMain` in the Main Team and the rest in the
 * Sub Team on Auto (KR: 4 + 4 AI); a Karma dungeon `karmaSlots`, at most one of each class (KR: 3, BanRule "1,All").
 */
export const DIVINE_ROOM = {
  bossSlots: 8,
  bossMain: 4,
  karmaSlots: 3,
} as const;

/** Playing it from its web page: `path` is where its web socket listens. */
export const DIVINE_WEB = {
  path: '/divine',
  helloMs: 10_000,
  messagesPerSecond: 40,
} as const;

/**
 * The Divine Punishment shop and crafting. Their zeiucoin prices are the config's (config.ts divinePrice): a Rune of Void's
 * (default: KR sold only Doh and Laz, for 20,000 Challenge Raid points / 10,000 Glory, and Geb, Oth and Ans in no shop) and an
 * artifact's (KR's 20,000 gold, a thousandth as Valance's crafting is).
 *   - `artifactFragments` of one fragment (and divine.artifactPrice zeiucoins) craft its artifact (KR's CraftItemTable: 1,000 fragments);
 *   - `goldPerPoint`: King's Raid's gold in zeiucoins (KR precedent: Valance's crafting, ÷1,000).
 */
export const DIVINE_SHOP = {
  artifactFragments: 1_000,
  goldPerPoint: 1_000,
} as const;

/**
 * Rune of Blasphemy crafting and storage:
 *   - `ingredients` Legendary or Velkazar runes fill the craft's gauge (KR: PunishmentRuneMaxGauge 1,000, 100 a rune), beside one
 *     Legendary rune of its main stat (its `legend`), Rune Fragments and Blood from data/divine-kr.ts's tables, and a Rune of Void;
 *   - storage holds `base` (KR's MaxPunishmentRuneItemCount 100), `extendSlots` more at a time for the config's
 *     divine.blasphemyExtendPrice zeiucoins (KR: +4 for 1,000 Gems) up to `most` (KR inference: the extension row applies while
 *     under 50 extensions, so 300);
 *   - taking one out of a socket and keeping it costs the config's divine.blasphemyKeepPrice zeiucoins (KR's PunishmentRunePreservePrice 200).
 */
export const BLASPHEMY_STORAGE = {
  ingredients: 10,
  base: 100,
  extendSlots: 4,
  most: 300,
} as const;

/**
 * The Karma dungeon's bonus Empty Shards (KR: "a very small chance… the higher the wave, the higher the chance": its 70101002 row,
 * T2 ×10 / T3 ×4 / T4 ×2 / T5 ×1, chances server-side). Default: a won run rolls once, `perWave` (thousandths) for each wave
 * cleared, at most `most`; a hit gives one tier's row by `weights` (T2 to T5).
 */
export const KARMA_BONUS = {
  perWave: 15,
  most: 500,
  weights: [50, 30, 15, 5],
} as const;
