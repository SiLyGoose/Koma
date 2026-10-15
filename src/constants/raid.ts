import { RAID_BOSS_IDS, RAID_CLASS_IDS, type RaidBossId, type RaidClassId } from '../protocol/raid.js';

/*
 * The weekly raid boss (commands/raid.ts, lib/raid). The numbers you'd tune while the bot runs (boss
 * HP, player HP, rounds, timers, the reward) are settings (`raid.*`, see config.ts);
 * the combat math that shapes a fight lives here.
 */

/**
 * The raid bosses. Each week every server gets one of them (lib/events/raid-boss.ts), never the
 * same one two weeks running. Adding a boss here reshuffles which one each future week gets.
 */
export { RAID_BOSS_IDS, type RaidBossId };

/**
 * When the weekly raid resets: every Saturday at midnight in this time zone (an IANA name, so
 * daylight saving time is followed).
 */
export const RAID_TIME_ZONE = 'America/New_York';

/** Longest a raid's turn can be, in seconds (the `raid.turnSeconds` setting). */
export const MAX_RAID_SECONDS = 1_800;

/** Most rounds a raid can last (the `raid.maxRounds` setting). */
export const MAX_RAID_ROUNDS = 50;

/** Most raiders a boss can count as overhead (the `raid.hpOverhead.<boss>` settings). */
export const MAX_RAID_OVERHEAD = 10;

/**
 * The raid's difficulty levels, 1 (the boss as its settings have it) to `max`. Each level past 1 adds
 * `raid.difficultyHp` of the boss's HP and `raid.difficultyDamage` of its damage (lib/events/raid.ts's
 * difficultyOf), and one more `stepStars`-star raid item to what a win can drop
 * (lib/game/items/raid-drops.ts). Top-tier (`milestoneStars`) ones only drop at every `milestoneEvery`th level.
 * The boss also gains HP for every raider (bossHpFor), in equal steps from level 2 up to
 * `raid.gearHp.<boss>` at `gearFrom`, and the same at every level past it: so a party without raid gear
 * wins less and less often on the way up, and from `gearFrom` the boss is built for parties in gear.
 * From `topFrom` it is built for a party whose classes fit together besides: it hits harder still
 * (`raid.topDamage`, in equal steps to all of it at the top level), and its tricks ask for more
 * (RAID_COMBAT.top).
 * A server can pick up to one level past the highest it has beaten (services/raid.ts).
 */
export const RAID_DIFFICULTY = { max: 10, milestoneEvery: 5, milestoneStars: 4, stepStars: 3, gearFrom: 5, topFrom: 8 } as const;

/**
 * The tiers of raid items the site's raid shop sells for komaGems (lib/game/items/raid-shop.ts), best
 * first: each has its own price and its own number on the shelf (the `raid.shop.*` settings).
 */
export const RAID_SHOP_STARS = [4, 3] as const;
export type RaidShopStars = (typeof RAID_SHOP_STARS)[number];
/** Most items of one tier the raid shop can have on its shelf (the `raid.shop.stock.<stars>` settings). */
export const MAX_RAID_SHOP_STOCK = 20;
/** Most times a member can be let refresh their shelf in a week (the `raid.shop.refreshes` setting). */
export const MAX_RAID_SHOP_REFRESHES = 50;

/**
 * The raid classes: what a raider is, picked on the site's gear page and kept for a fight from its
 * start. Each makes one of the four actions its own and pays for it somewhere else; a raider without
 * one (RAID_NO_CLASS) fights by the plain rules. What each number does (lib/events/raid.ts):
 * - `attack`: what their attacks are multiplied by (before rallies and crits; not maxHpDamage's share).
 * - `crit`: added to their crit chance, whatever they wear (the class's own passive).
 * - `taken`: what the boss's hits on them are multiplied by. `hp`: what their HP is multiplied by.
 * - `retaliate`: every round the boss lands a hit on them and leaves them standing, they strike back
 *   once, for this share of one of their plain attacks (no crit, rally or boost; a shield stops it).
 * - `healed`: what heals on them are multiplied by (not a revive).
 * - `heal`: what their heals and revives are multiplied by. `healCrit`: their heals can crit, with
 *   their own crit chance and crit damage.
 * - `partyCut`: guarding, they cut what everyone else takes from moves that hit several raiders by
 *   this much (0: their guard does nothing for the others, as nobody's does without a class that
 *   has it). Bigger with the partyGuard perk (a class item) and with guardBoost, up to
 *   RAID_COMBAT.guard.aoeCutMax. `covers`: guarding, they jump in front of a hit aimed at one other
 *   raider (nobody's guard does without a class that has it).
 * - `rallyTurns`: turns their rally lasts on top of RAID_COMBAT.support.rallyTurns. `interrupts`: how
 *   many Supports theirs counts as towards interrupting a channel (support.shieldBreak).
 * Each class has an item (a 4-star raid item whose perks only work for that class: perks/raid), which
 * adds to one of these: the knight's to `partyCut` (partyGuard), the wizard's to `hex` (hexBoost), the
 * assassin's to `attack` (assassinStrike) and to their crit chance (assassinCrit), the archer's to
 * `rampStep` and five times that to `rampMax` (archerRamp); the priest has two, one that makes their
 * heals mend everyone else too (partyHeal) and one that turns their excess healing into damage to the
 * boss (circleOfDeath); the mechanic's gives the party more crit chance while their rally runs
 * (rallyCrit), and the warrior's adds to `retaliate` (warriorCounter).
 * - `ward`: instead of a Support's usual work they can ward an ally (RaidChoice.skill): the first hit
 *   the boss lands on that ally this round does nothing at all.
 * - `hex`: their attacks that land hex the boss: the move it announced this round hits that much
 *   weaker (hexes don't stack: the strongest counts). `massDispel`: their Support frees every ally
 *   under crowd control, not one.
 * - `rampStep`, `rampMax`: their attacks do `rampStep` more for every turn in a row they attacked
 *   before this one, up to `rampMax`; a turn they don't attack, or a hit from the boss, starts it over.
 */
export { RAID_CLASS_IDS, type RaidClassId };

export interface RaidClassRules {
  attack: number;
  crit: number;
  taken: number;
  hp: number;
  retaliate: number;
  healed: number;
  heal: number;
  healCrit: boolean;
  partyCut: number;
  covers: boolean;
  rallyTurns: number;
  interrupts: number;
  ward: boolean;
  hex: number;
  massDispel: boolean;
  rampStep: number;
  rampMax: number;
}

/** A raider without a class: the plain rules. */
export const RAID_NO_CLASS: RaidClassRules = {
  attack: 1,
  crit: 0,
  taken: 1,
  hp: 1,
  retaliate: 0,
  healed: 1,
  heal: 1,
  healCrit: false,
  partyCut: 0,
  covers: false,
  rallyTurns: 0,
  interrupts: 1,
  ward: false,
  hex: 0,
  massDispel: false,
  rampStep: 0,
  rampMax: 0,
};

export const RAID_CLASSES: Readonly<Record<RaidClassId, RaidClassRules>> = {
  knight: { ...RAID_NO_CLASS, attack: 0.75, partyCut: 0.1, covers: true },
  // A brawler: more HP, and it hits back when it is hit, but it is harder to heal.
  warrior: { ...RAID_NO_CLASS, hp: 1.25, retaliate: 0.5, healed: 0.75 },
  priest: { ...RAID_NO_CLASS, attack: 0.75, heal: 1.25, healCrit: true },
  mechanic: { ...RAID_NO_CLASS, attack: 0.75, rallyTurns: 1, interrupts: 2, ward: true },
  wizard: { ...RAID_NO_CLASS, attack: 0.75, hex: 0.2, massDispel: true },
  assassin: { ...RAID_NO_CLASS, attack: 1.25, crit: 0.2, taken: 1.25, hp: 0.75 },
  archer: { ...RAID_NO_CLASS, crit: 0.2, rampStep: 0.1, rampMax: 0.5 },
};

/**
 * The raid's buttons and screen.
 * - `refreshMs`: the shortest time between edits of the live message (Discord limits message edits).
 * - `logSize`: how many recent actions the live message shows.
 * - `resultMs`: how long a round's result stays up before the next turn starts.
 * - `listMax`: how many players a list names before saying "...and N more".
 * - `healTargetId`, `healAutoValue`, `selectMax`: the private picker Heal uses to choose who to heal.
 * - `lobbyIdleMs`: how long a lobby can sit with nothing happening in it (nobody joining, leaving or
 *   changing the difficulty) before it disbands itself. The fight only starts when the host starts it, so
 *   this is what frees the server (and the week's raid) from a lobby its host walked away from.
 */
export const RAID = {
  joinId: 'raid_join',
  leaveId: 'raid_leave',
  startId: 'raid_start',
  disbandId: 'raid_disband',
  lobbyIdleMs: 60 * 60_000,
  /** The lobby's difficulty picker (the host's). */
  difficultyId: 'raid_difficulty',
  /** The button under a won raid that shows a raider their own items, privately, and how long it stays (ms). */
  lootId: 'raid_loot',
  lootMs: 15 * 60_000,
  attackId: 'raid_attack',
  guardId: 'raid_guard',
  healId: 'raid_heal',
  supportId: 'raid_support',
  healTargetId: 'raid_heal_target',
  /** The private picker Support uses for a class that can ward: its id, and its values (a ward's may end in `:<who>`). */
  supportSkillId: 'raid_support_skill',
  supportValue: 'support',
  wardValue: 'ward',
  /** The heal picker's "let the bot choose" option. */
  healAutoValue: 'auto',
  /** Most options a Discord select menu can hold (the heal picker's Auto plus allies). */
  selectMax: 25,
  imageName: 'raid-boss.png',
  refreshMs: 2_000,
  logSize: 10,
  resultMs: 4_000,
  listMax: 15,
  /** How many blocks wide the boss's HP bar is. */
  barWidth: 10,
  /** How many blocks wide each player's HP bar is (narrower, so a full party list fits in one embed field). */
  playerBarWidth: 6,
} as const;

/**
 * The raid's page on the site (web/games/raid): its web socket's path, how long a new connection has to say
 * who it is, and how many messages a second it may send before it's cut off.
 */
export const RAID_WEB = {
  path: '/raid',
  helloMs: 10_000,
  messagesPerSecond: 20,
} as const;

/** The raid's custom emojis (full codes, checked at startup): the actions, crits, and the boss's crowd-control effects. */
export const RAID_EMOJI = {
  attack: '<:raidattackdamage:1553098026837483721>',
  guard: '<:raidarmor:1553096484784701511>',
  heal: '<:raidheal:1553098428685353030>',
  crit: '<:raidcriticalchance:1553098714908721313>',
  stunned: '<:raidstatestunned:1553099233974952030>',
  disarmed: '<:raidstatedisarmed:1553100171020075008>',
  taunted: '<:raidstatetaunted:1553099804022939749>',
} as const;

/** The raid classes' custom emojis (full codes, checked at startup): a class's badge, wherever Discord names it. */
export const RAID_CLASS_EMOJI: Readonly<Record<RaidClassId, string>> = {
  knight: '<:class_knight:1559330160782745660>',
  warrior: '<:class_warrior:1559330269213761659>',
  priest: '<:class_priest:1559330233046278246>',
  mechanic: '<:class_mechanic:1559330200402010163>',
  wizard: '<:class_wizard:1559330302306951188>',
  assassin: '<:class_assassin:1559330130290147448>',
  archer: '<:class_archer:1559330090729345155>',
};

/**
 * How a fight plays out. Damage and healing are HP. Every "share" is 0 to 1.
 *
 * Players:
 * - `attack`: an attack does a random amount from min to max (the same number for a flat hit), and a
 *   `critChance` of that doubles.
 * - `heal`: a heal restores `amount` HP to the ally the healer picked, or revives them with
 *   `reviveShare` of their HP if they are knocked out. With no pick (or one that no longer needs
 *   it), a knocked-out ally is revived first, then the hurt ally with the least HP left is healed.
 * - `guard`: a guard takes `takenShare` of any hit (less with the guardBoost perk), and that is all a
 *   plain guard does. Only a class that covers (RAID_CLASSES: the knight) jumps in front of
 *   single-target moves aimed at someone else (the one with the most HP does), and only a class with a
 *   party cut (the knight again) cuts what everyone else takes from moves that hit several players, by
 *   at most `aoeCutMax`. That cut doesn't stack: with several such guards up, only the strongest one's
 *   counts.
 * - `support`: each support lifts one player's stun, disarm or taunt (stuns first); with nobody
 *   under one, one of the turn's supports clears Blight (see `blight` below) if anyone carries
 *   enough, and the rest rally the party instead, multiplying everyone's attacks by
 *   `attackMultiplier` (its bonus bigger with the rallyBoost perk) for the next `rallyTurns` turns. Rallies don't stack: with several in a turn only
 *   the strongest counts, and a new one only takes over a running one if it is at least as strong (it
 *   resets the count either way). `shieldBreak` supports in the turn a boss channels its shield (the
 *   Spectral Veil or the Fly Swarm) interrupt it, whatever else they did.
 *
 * Bosses:
 * - Its damage is multiplied by `enrage.multipliers[level]`; level 1 starts below the first share
 *   of HP in `enrage.thresholds`, level 2 below the second.
 * - Each move's base numbers are below; `weights[boss][level]` is how often that boss picks each of
 *   its moves at each enrage level (a boss only uses the moves it has weights for). It never raises
 *   its shield twice in a row.
 * - Shields: the reaper's `veil` and the matriarch's `flies` are channeled. The boss spends the turn
 *   it announced one in channeling it, and it is up for the turn after, when every attack does
 *   nothing; `support.shieldBreak` Supports in the channeling turn interrupt it, and once it is up
 *   nothing breaks it. A boss whose channel was interrupted is staggered for the turn after: it makes
 *   no move, and every attack on it does `stagger.damageTaken` times its damage. The wyrm's `shield` isn't channeled: it is up the moment it is announced (the
 *   wyrm makes no other move that turn), deflects the next `shield.deflects` attacks, however many
 *   turns those take, and then shatters. Supports do nothing to it, and the wyrm doesn't raise
 *   another while one is up.
 * - The Wyvern (`wyrm`): `claw` (one raider), `breath` (everyone), `sweep` (min to max raiders), `hoard`
 *   (steals min to max points from one player's wallet, never more than they have), `shield`.
 * - The Soul Reaper: `reap` (one raider), `drain` (everyone), `scythe` (min to max raiders),
 *   `harvest` (one raider, blocked like Hoard by their own guard or a knight's), `veil` (its shield). `lifesteal` heals it
 *   that many times the damage the move dealt (so guarding cuts it); `harvest` heals it `maxHpShare`
 *   of its max HP instead. All of its healing is multiplied by `enrage.lifesteal[level]`, so it heals
 *   more as it gets angrier (on top of hitting harder, which already makes Reap and Soul Drain heal
 *   more). It never heals above its max HP. It has no crowd control.
 * - `empower` (the reaper's Dark Empowerment): it spends its turn powering up, and its next move is
 *   always an attack, doing `empower.multiplier` times the damage (on top of its enrage).
 * - `gather` then `reckoning` (the reaper's Grim Reckoning): it spends `reckoning.chargeTurns` turns
 *   gathering, announced each turn, then hits min to max raiders at once. It can't be interrupted
 *   (Supports only interrupt a shield), so the party has those turns to guard and heal up.
 * - The Plague Matriarch: `spit` (one raider), `miasma` (everyone), `rot` (one raider for every
 *   `raidersPerTarget` standing, rounded up), `flies` (its shield), and `brew` then `pestilence`.
 *   Each of its hits leaves `blight` stacks of Blight on whoever takes it (see `blight` below); `brew`
 *   spends a turn brewing, announced, and `pestilence` the turn after doubles every standing raider's
 *   stacks (up to `blight.maxStacks`). It only brews at `pestilence.from` of its HP or less, and never
 *   right after a Pestilence. It has no crowd control and doesn't heal.
 * - Crowd control (`stun`, `disarm`, `taunt`, all under `cc`): stunned players can't act at all,
 *   disarmed ones can't attack, and taunted ones can only attack, for `cc.rounds` turns. At each
 *   enrage level the boss can use one only every `cc.cooldown[level]` rounds, and it hits
 *   `cc.targets[level]` players (only ones not already under one).
 * - Every aimed move goes after the players it has aimed at least so far, so everyone gets hit
 *   about equally (ties are random).
 */
export const RAID_COMBAT = {
  attack: { min: 60, max: 60, critChance: 0.1, critMultiplier: 2 },
  heal: { amount: 30, reviveShare: 0.3 },
  guard: { takenShare: 0.5, aoeCutMax: 0.6 },
  support: { attackMultiplier: 1.5, rallyTurns: 2, shieldBreak: 2 },
  shield: { deflects: 6 },
  stagger: { damageTaken: 1.5 },
  // From RAID_DIFFICULTY.topFrom on: how many more Supports interrupt a channel, and how many more raiders its crowd control holds.
  top: { shieldBreak: 1, ccTargets: 1 },
  enrage: { thresholds: [0.5, 0.25], multipliers: [1, 1.25, 1.5], lifesteal: [1, 1.25, 1.5] },
  moves: {
    claw: { damage: 56 },
    breath: { damage: 30 },
    sweep: { damage: 40, minTargets: 2, maxTargets: 3 },
    hoard: { min: 200, max: 600 },
    reap: { damage: 69, lifesteal: 1.5 },
    drain: { damage: 28, lifesteal: 1 },
    scythe: { damage: 53, minTargets: 2, maxTargets: 3 },
    harvest: { damage: 38, maxHpShare: 0.03 },
    reckoning: { damage: 88, minTargets: 2, maxTargets: 4, chargeTurns: 2 },
    spit: { damage: 35, blight: 2 },
    miasma: { damage: 13, blight: 1 },
    rot: { damage: 28, blight: 1, raidersPerTarget: 3 },
  },
  /**
   * The Plague Matriarch's Blight, stacks a raider carries until they are cleansed or knocked out.
   * At the end of every round (after the boss's move) each stack deals `tick` damage to its raider,
   * and each one cuts the healing they receive by `healCut`, at most `maxHealCut` in all. Heals don't
   * clear it. Once a raider carries `supportCleanseAt` or more, one Support a turn clears
   * `supportCleanse` stacks off the most blighted (more, and off a second ally, with the blightPurge
   * perk); supports don't stack, so the turn's other Supports rally. A raider never carries more than
   * `maxStacks`.
   */
  blight: { tick: 5, healCut: 0.1, maxHealCut: 0.5, supportCleanse: 1, supportCleanseAt: 3, maxStacks: 8 },
  /** The matriarch's Pestilence: she only brews it once she is down to this share of her HP. */
  pestilence: { from: 0.75 },
  empower: { multiplier: 1.5 },
  /**
   * The Soul Reaper's special attack, Soul Requiem: from enrage level `phase` on (furious), as soon as
   * it is ready it spends a turn charging (announced, so the party can brace: Supports don't interrupt
   * it), then casts Soul Drain `casts` times in a row. It is ready again `cooldown` rounds after it was
   * unleashed.
   */
  requiem: { boss: 'reaper', phase: 2, cooldown: 6, casts: 2 },
  cc: { rounds: 2, cooldown: [5, 4, 3], targets: [1, 2, 3] },
  weights: {
    wyrm: [
      { claw: 30, breath: 20, sweep: 20, hoard: 12, shield: 8, stun: 4, disarm: 3, taunt: 3 },
      { claw: 28, breath: 24, sweep: 20, hoard: 10, shield: 8, stun: 4, disarm: 3, taunt: 3 },
      { claw: 25, breath: 30, sweep: 20, hoard: 8, shield: 7, stun: 4, disarm: 3, taunt: 3 },
    ],
    reaper: [
      { reap: 28, drain: 18, scythe: 20, harvest: 13, veil: 7, empower: 7, gather: 7 },
      { reap: 26, drain: 22, scythe: 20, harvest: 13, veil: 7, empower: 7, gather: 7 },
      { reap: 24, drain: 26, scythe: 19, harvest: 13, veil: 6, empower: 7, gather: 7 },
    ],
    // She only brews Pestilence below RAID_COMBAT.pestilence.from of her HP.
    plague: [
      { spit: 32, miasma: 26, rot: 30, flies: 12, brew: 10 },
      { spit: 28, miasma: 26, rot: 26, flies: 10, brew: 10 },
      { spit: 26, miasma: 28, rot: 24, flies: 8, brew: 14 },
    ],
  },
} as const;
