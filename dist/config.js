import { ADMIN_USER_ID, PITY_STARS, PLINKO_ROWS } from './constants/index.js';
import { defaultEquipmentSettings } from './perks/index.js';
import { validateSettings } from './lib/settings-spec.js';
import { STARS } from './types.js';
import { TM_POTENTIAL_RANGES } from './data/tm-potentials.js';
export { STARS };
/** The admin's user id is set in constants/core.ts. It is re-exported here so existing imports keep working. */
export { ADMIN_USER_ID };
export function isAdmin(userId) {
    return userId === ADMIN_USER_ID;
}
/**
 * Starting values. The first time the bot runs, these are written to the `settings` collection
 * in MongoDB, and from then on the database is the source of truth: change them with the
 * admin-only config command (or by editing the document). Changing this file only affects
 * settings that are missing from the database.
 */
export const DEFAULTS = {
    prefix: 'k!',
    embedColor: '#97a0ff',
    claim: { min: 100, max: 500 },
    gacha: {
        cost: 280,
        // 4-star is 0.6% (6 in 1000). Pity only works while the 4-star weight is above 0.
        starWeights: { 1: 694, 2: 250, 3: 50, 4: 6 },
        // The Hero Item banner: King's Raid's Treasure Summon, a unique weapon 1% and a unique treasure 1% (20 in 1000).
        heroStarWeights: { 1: 680, 2: 250, 3: 50, 4: 20 },
        pity: { softStart: 70, hardPity: 90 },
        // Closed until an admin sets its dates. 3 in 4 of its 4-star items are featured ones.
        limited: { start: 'off', end: 'off', featuredChance: 0.75 },
    },
    rob: {
        cooldownMinutes: 60,
        victimProtectionMinutes: 60,
        successChance: 0.5,
        minStolen: 100,
        maxStolen: 500,
        minVictimBalance: 1,
        failFine: 100,
        minChance: 0.05,
        maxChance: 0.95,
        wealthTaxThreshold: 5000,
        wealthTaxRate: 0.01,
    },
    // A pull costs 280 and gives a 1-star 69% of the time, so selling everything you pull gets back roughly 30%.
    // Hero gear salvages for komaDust, 1,000 of it a komaGem: a Hard Dragon Raid win at stage 10 (7 T8 pieces) is about half of one.
    sell: { price: { 1: 40, 2: 100, 3: 400, 4: 1500 }, powder: { 6: 20, 7: 40, 8: 80, 9: 120, 10: 200, technomagic: 120, unique: 500 }, powderPerGem: 1000, powderPerSelector: 1000 },
    // King's Raid's: its Valance's Workshop (ValanceCraftTable, gold a thousandth) and CraftItemTable PACKAGE_RUNE_2/3/4/40.
    craft: {
        tm: { any: { crystals: 1000, points: 1000 }, part: { crystals: 2000, points: 3000 }, exact: { crystals: 4000, points: 9000 } },
        reclaimed: 0.05,
        runes: { uncommon: 100, rare: 250, heroic: 650, ancient: 2000 },
        tpScroll: 5000,
    },
    // On the 9-slot board the ball lands in the middle most often (70 in 256), so the middle pays the
    // least: these average out to about 98% of the bet.
    plinko: { minBet: 10, maxBet: 1000, payout: { 1: 9, 2: 3, 3: 1.4, 4: 0.7, 5: 0.4 } },
    blackjack: { minBet: 10, maxBet: 1000, naturalPayout: 1.5, joinSeconds: 15, turnSeconds: 30 },
    // Casino baccarat: Banker less a 5% commission, Tie 8 to 1, Kirin (Panda 8) 25 to 1, Phoenix (Dragon 7) 40 to 1.
    // The house keeps about 1.2% of a Player or Banker bet, 14% of a Tie, and 10% and 8% of Kirin and Phoenix.
    baccarat: { minBet: 1, maxBet: 10_000, payout: { banker: 0.95, tie: 8, kirin: 25, phoenix: 40 } },
    // American roulette (0 and 00): every bet pays 36 / its pockets - 1 to 1, so the house keeps 5.26%.
    roulette: { minBet: 1, maxBet: 10_000 },
    // 10/20 blinds, sitting down with 20 to 100 big blinds, and a 5% rake (at most 5 big blinds) for the vault.
    poker: { smallBlind: 10, bigBlind: 20, minBuyIn: 400, maxBuyIn: 2_000, rake: 0.05, rakeCap: 100, turnSeconds: 30, botDailyLimit: 5_000 },
    // Like Stake's Mines. The house edge is 2.5% with 1 mine and slides down to Stake's 1% with 24
    // (so a run pays back 97.5% to 99% of the bet on average), and a round stops at 100x.
    mines: {
        minBet: 10,
        maxBet: 1000,
        edgeFewest: 0.025,
        edgeMost: 0.01,
        maxMultiplier: 24,
    },
    // 100 energy, one back every 3 minutes (480 a day). A block holds an ore 1 time in 10, anywhere;
    // an ore averages about 95 points, so digging pays about 9 points a block.
    pinecraft: {
        maxEnergy: 100,
        energyMinutes: 3,
        value: { dirt: 1, stone: 5, coal: 10, iron: 30, gold: 70, diamond: 150, emerald: 300, amethyst: 500, ruby: 500 },
    },
    // A board pays by how hard it is, well past its size: an Expert board 30 times a Beginner's. Under
    // par it pays more, up to half as much again at half of par (a quick Expert board: 2,250).
    minesweeper: {
        pool: { easy: 50, medium: 400, hard: 1_500 },
        parSeconds: { easy: 40, medium: 180, hard: 480 },
        speedBonus: 1.5,
    },
    // An event every 2 to 6 hours. A crate holds 200 to 600 points (an average claim is 300) and is open for a minute.
    // The vault games put up 10x what's been lost to gambling since the last payout, and the vault
    // also grows by 100 an hour on its own. A Greedy Heist has
    // a minute to join, then up to 10 rounds of 5 seconds; the alarm chance starts at 5% and climbs 5%
    // a round (about a 3% chance of lasting all 10), every quiet round adds 0.1x to the loot of whoever
    // escapes (2x for staying all 10), and anyone caught pays 50. Split or Steal needs 2+
    // players, with a minute to join and 30 seconds to choose. Codedle opens 5 minutes after it's announced, then gives
    // 5 minutes to guess a 5-digit code, at 10 points a guess (added to the vault).
    events: {
        minMinutes: 120,
        maxMinutes: 360,
        crate: { minPoints: 200, maxPoints: 600, seconds: 60 },
        vault: { multiplier: 1, hourlyGrowth: 100, maxPool: 0, lossShare: 0.4 },
        heist: { joinSeconds: 60, rounds: 10, roundSeconds: 5, alarmStart: 0.05, alarmStep: 0.05, quietBonus: 0.1, fine: 50 },
        splitSteal: { minPlayers: 2, joinSeconds: 60, decideSeconds: 30 },
        codedle: { waitSeconds: 300, seconds: 300, guessCost: 10 },
    },
    // The raid's numbers, set in simulated fights where the party picks the best of some ninety ways to
    // play (real parties do worse). Each boss's HP lets a party without gear win level 1 about 9 times in
    // 10, at any size from 4 to 10, and never less often for having more raiders: hpPerRaider and
    // hpOverhead are fitted so the win rate holds or climbs with the party's size.
    // Up to 15 rounds of 60 seconds, once the host starts the fight from the lobby.
    // Beating it pays everyone who took part 1,000, a multi pull's worth of komaTokens (10) and 5 komaGems,
    // and the party a 20% chance (+10% for each raider) that everyone finds one of the 3-star raid drops
    // (more at the levels past 1, and 4-star ones only at levels 5 and 10). Every level past 1 pays 500
    // more, and the komaGems go up by 5 at levels 5 and 10 (10 from level 5, 15 at level 10).
    // The komaGems buy raid items in the site's shop: four of the 4-star ones (10 each) and four of the
    // 3-star ones (5 each) are on the shelf, different ones every week. A member can have theirs
    // refreshed up to 5 times a week, for 5 komaGems, then 10, 15, 20 and 25.
    // That is difficulty 1; every level past it gives the boss 2% more of its HP and 1% more of its damage,
    // and more HP for every raider, whatever they wear (its HP never looks at gear): a quarter of gearHp
    // more at each level up to 5, and all of it from there. From level 8 it hits harder still (topDamage:
    // 45% more by level 10), its channels take a third Support to interrupt and its crowd control holds
    // one more raider (RAID_COMBAT.top).
    // The numbers are set for a party with well-chosen classes (a knight and a mechanic, a priest or a
    // wizard, the rest assassins) that gets about one thing in five wrong: in simulated fights, every
    // raider's pick is a random one 22% of the time and every raider is on a random class 22% of the time,
    // the rest played the best of some ninety ways. Such a party of five without gear wins about 88, 77,
    // 59, 45 and 30% of the time at levels 1 to 5 (more in a bigger party), and about 85% of the time at
    // level 5 in 4-star gear at R3 (its class items among it). At level 10 in 4-star gear at R5 it wins
    // about 8 times in 10 with five raiders and 9 to 10 with eight; the same gear without classes wins
    // level 10 about 3 times in 10 with five and 7 with eight.
    raid: {
        hpPerRaider: { wyrm: 875, reaper: 650, plague: 555 },
        hpOverhead: { wyrm: 2.9, reaper: 2.47, plague: 1.49 },
        minRaiders: 4,
        playerHp: 100,
        maxRounds: 15,
        turnSeconds: 60,
        reward: 1_000,
        rewardPerLevel: 500,
        tokenReward: 10,
        gemReward: 5,
        gemRewardMilestone: 5,
        essenceReward: 15,
        essenceRewardPerLevel: 5,
        weeklyMultiplier: 5,
        shop: { price: { 3: 5, 4: 10 }, stock: { 3: 4, 4: 4 }, refreshCost: 5, refreshes: 5 },
        dropChance: 0.2,
        dropChancePerRaider: 0.1,
        difficultyHp: 0.02,
        difficultyDamage: 0.01,
        topDamage: 0.45,
        gearHp: { wyrm: 240, reaper: 265, plague: 280 },
    },
    // STONKS!'s multiplier reaches its cap (equipment.stackosaurus.<stars>, a 4-star default of
    // 7.5x) 5 hours after the earliest a claim could be ready, on a smooth ease-in-out curve
    // rather than jumping there.
    // The same as an average claim, so skipping only pays off with gear, and doubling stops it being farmed.
    // Five raid wins' worth (a win gives 5 komaGems).
    refine: {
        // 4-star duplicates take ~116 pulls each (~32k in pulls), so the points are a smaller second
        // cost on top; the lower tiers pay 5%, 10% and 25% of the 4-star prices.
        cost: {
            1: { 2: 100, 3: 150, 4: 200, 5: 300 },
            2: { 2: 200, 3: 300, 4: 400, 5: 600 },
            3: { 2: 500, 3: 750, 4: 1_000, 5: 1_500 },
            4: { 2: 2_000, 3: 3_000, 4: 4_000, 5: 6_000 },
        },
    },
    outfit: { price: 5_000 },
    hero: { price: 25_000, outfitPrice: 5_000, honorOutfitPrice: 10_000, brilliantOutfitPrice: 15_000, glaringOutfitPrice: 20_000, legendOutfitPrice: 25_000, perkPage2Price: 5_000, perkPage3Price: 10_000, loadoutPrice: 5_000, rerollPrice: 500, valueRerollT6Price: 512, valueRerollT7Price: 768, valueRerollT8Price: 1_152, valueRerollTmPrice: 1_000, valueRerollUtPrice: 1_152, restorePrice: 10_000, runeKeepPrice: 100, backgroundPrice: 100, winPoints: 1_000, potentials: structuredClone(TM_POTENTIAL_RANGES) },
    // A Dragon Raid win: 750 at stage 1 up to 3,000 at stage 10, and 8 up to 44 of each of its dragon's two essences.
    dragon: { winPoints: 750, pointsPerStage: 250, essences: 8, essencesPerStage: 4 },
    // Divine Punishment: KR sold Runes of Void for Challenge Raid points (10,000 a default), its artifacts' 20,000 gold a thousandth,
    // a storage extension's 1,000 Gems (5,000 a default), and its Rune Preserve's 200.
    divine: { voidPrice: 10_000, artifactPrice: 20, blasphemyExtendPrice: 5_000, blasphemyKeepPrice: 200 },
    skip: { claim: 300 },
    stonks: { capHours: 5 },
    // The wheel goes from 1x up to 5x, which averages 2.25x a spin.
    wheel: { maxMultiplier: 5 },
    // Someone else's unique treasure works at half strength.
    equipment: { ...defaultEquipmentSettings(), borrowed: { effectiveness: 0.5 } },
    leaderboardSize: 10,
};
/**
 * The live settings the rest of the bot reads. It starts as a copy of DEFAULTS and is updated
 * in place from MongoDB (see services/settings.ts), so always read values at the moment you
 * need them instead of caching them.
 */
export const CONFIG = structuredClone(DEFAULTS);
/**
 * What rerolling one of a hero gear copy's substats costs in points (the forge's Reroll Substats): the config's
 * hero.rerollPrice, the same every time. A dragon set's piece and a unique treasure alike; a TechnoMagic piece takes Boss Crystals.
 */
export const rerollPrice = () => Math.max(0, Math.floor(CONFIG.hero.rerollPrice));
/** A price setting as it is paid: a whole number of points, none below 0. */
const whole = (price) => Math.max(0, Math.floor(price));
/**
 * What rerolling one of a hero gear copy's substats' values costs in points (the forge's Reroll Values): a dragon set's piece's
 * by its tier (hero.valueRerollT6Price … T8; any other tier: T8's), a TechnoMagic piece's (hero.valueRerollTmPrice), a unique
 * treasure's (hero.valueRerollUtPrice).
 */
export function valueRerollPrice(piece) {
    const { hero } = CONFIG;
    if (piece === 'technomagic')
        return whole(hero.valueRerollTmPrice);
    if (piece === 'unique')
        return whole(hero.valueRerollUtPrice);
    return whole(piece.tier === 6 ? hero.valueRerollT6Price : piece.tier === 7 ? hero.valueRerollT7Price : hero.valueRerollT8Price);
}
/** What Technomagic Restoration costs in points, beside its reports (TM_REPORTS.restore): the config's hero.restorePrice. */
export const restorePrice = () => whole(CONFIG.hero.restorePrice);
/** What taking a rune out of a socket and keeping it costs in points (one put in over another: the other's): the config's hero.runeKeepPrice. */
export const runeKeepPrice = () => whole(CONFIG.hero.runeKeepPrice);
/** One of the Divine Punishment Raid's zeiucoin prices, as the config has it now (divine.voidPrice and the rest). */
export const divinePrice = (key) => whole(CONFIG.divine[key]);
export function validateConfig() {
    if (!STARS.includes(PITY_STARS))
        throw new Error(`PITY_STARS (${PITY_STARS}) must be one of ${STARS.join(', ')}`);
    const payoutKeys = Object.keys(DEFAULTS.plinko.payout).length;
    if (payoutKeys !== PLINKO_ROWS / 2 + 1) {
        throw new Error(`DEFAULTS.plinko.payout needs ${PLINKO_ROWS / 2 + 1} numbers for PLINKO_ROWS ${PLINKO_ROWS}, it has ${payoutKeys}`);
    }
    const problems = validateSettings(CONFIG);
    if (problems.length > 0)
        throw new Error(`Invalid settings: ${problems.join('; ')}`);
}
//# sourceMappingURL=config.js.map