import type { EffectId } from './data/effects.js';
import type { Slot, Stars } from './types.js';

/*
 * Every fixed value and every piece of text the bot sends, in one place, so you can change
 * them without hunting through the code.
 *
 * What is NOT here, on purpose:
 *   - The settings you change while the bot runs (prefix, embed color, claim range, pull cost,
 *     rob numbers, gear strength...). Those live in MongoDB; their starting values are DEFAULTS
 *     in config.ts, and `k!config` edits them.
 *   - The item catalog (data/items.ts) and the effect registry (data/effects.ts).
 *   - Database names (collections, the settings document id, ledger reasons). They are stored
 *     data: renaming one makes the bot stop seeing what it saved under the old name.
 *   - Command names, aliases and help descriptions. They stay on each command.
 *
 * Text templates are functions. The numbers passed to them are already formatted with
 * thousands separators ("1,250"), and `unix` values are Unix seconds for Discord's
 * <t:...:R> "in 5 minutes" timestamps.
 */

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * The only user who can change settings. This lives in code on purpose, not in the database,
 * so it can't be changed through the settings themselves.
 */
export const ADMIN_USER_ID = '257214680823627777';

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/** How often the bot re-reads the settings from MongoDB, so edits made there apply without a restart. */
export const SETTINGS_REFRESH_MS = MINUTE_MS;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Gear can never cut a rob or a pull by this much or more (0.9 = 90%), so nothing goes to zero. */
export const MAX_REDUCTION = 0.9;

/**
 * The emoji shown wherever points (the game's currency) are mentioned or an amount of them is shown. Change it here and it
 * changes everywhere. It has to be the full code, like `<:name:id>` (type `\:name:` in Discord to get it). Discord shows it in
 * message text, embed descriptions and field values, but not in slash command menus, button labels or embed footers, which
 * keep the word "points".
 */
export const CURRENCY_EMOJI = '<:zeiucoin:1551675032424546320>';

/** Highest value a points setting accepts (claim range, pull cost, stolen amount, fine...). */
export const MAX_SETTING_POINTS = 1_000_000;

/** Longest a cooldown or protection timer setting can be, in minutes (10,080 is one week). */
export const MAX_TIMER_MINUTES = 10_080;

/** Most rows the leaderboard setting can ask for. */
export const MAX_LEADERBOARD_SIZE = 25;

/** Longest command prefix the settings accept. */
export const MAX_PREFIX_LENGTH = 10;

/** Most copies of an item the admin's give command hands out in one go. */
export const MAX_GIVE_AMOUNT = 100;

/** How many pulls one multi pull (`gacha multi`) makes. It costs that many single pulls, and the results are shown in one embed, so keep it from 2 to 30. */
export const MULTI_PULLS = 10;

/** Highest pull count the pity settings accept. */
export const MAX_PITY = 1000;

/**
 * The star tier the pity system works on: a member's pity counts the pulls since their last item
 * of this tier, the chance of getting one rises as it grows, and one is guaranteed at the hard
 * pity pull (settings gacha.pity.*). Pity does nothing while this tier's pull weight is 0.
 */
export const PITY_STARS: Stars = 4;

/** Most slices the prize wheel (data/wheel.ts) may have, so the picture stays readable. */
export const MAX_WHEEL_SLICES = 16;

/** Largest multiplier a wheel slice may have. */
export const MAX_WHEEL_MULTIPLIER = 100;

/** File name of the wheel picture attached to a claim or rob reply. */
export const WHEEL_IMAGE_NAME = 'wheel.png';

/**
 * How the wheel animation plays. The reply first shows the wheel spinning, then the picture is
 * swapped every `frameMs` milliseconds (the wheel slowing down each time) until the spin has
 * lasted somewhere from `minSeconds` to `maxSeconds`, and the wheel stops on the result. Discord
 * limits how often a message can be edited, so keep `frameMs` at 1000 or more.
 */
export const WHEEL_ANIMATION = { frameMs: 1000, minSeconds: 3, maxSeconds: 5 };

/** File name of the plinko board picture. */
export const PLINKO_IMAGE_NAME = 'plinko.png';

/**
 * How many rows of pegs the plinko board has. The ball bounces once per row, so the board has
 * PLINKO_ROWS + 1 slots. It must be even, from 2 to 10: the payouts are mirrored left to right, so
 * there is one payout setting for each slot from the edge to the middle (PLINKO_ROWS / 2 + 1 of them).
 */
export const PLINKO_ROWS = 8;

/** The plinko payout settings are multipliers of the bet, up to this many times it. */
export const MAX_PLINKO_MULTIPLIER = 1000;

/**
 * How the plinko drop plays: the picture is swapped every `frameMs` milliseconds as the ball falls
 * one row (keep it at 500 or more, Discord limits message edits). The ball takes PLINKO_ROWS + 1
 * pictures to land. `idleMs` is how long the buttons under a finished game (again, double, half)
 * keep working after the last time they were used.
 */
export const PLINKO_ANIMATION = { frameMs: 800 };
export const PLINKO_BUTTONS = { idleMs: 60_000 };

// ---------------------------------------------------------------------------
// Random events (src/events)
// ---------------------------------------------------------------------------

/**
 * How the bot decides when an event happens. Every `tickMs` it looks at each server that has an
 * events channel and starts an event in the ones that are due. An event that became due more than
 * `staleMs` ago (the bot was switched off at the time) is not started late: a new time is picked
 * instead, so a restart never causes a burst of events.
 */
export const EVENTS = { tickMs: 60_000, staleMs: 10 * MINUTE_MS } as const;

/** Longest the point crate can stay open, in seconds (the `events.crate.seconds` setting). */
export const MAX_CRATE_SECONDS = 600;

/**
 * The point crate's button and screen. `refreshMs` is the shortest time between edits of the
 * "grabbed so far" count, so a rush of presses is one edit (Discord limits message edits).
 * `listMax` is how many members the result names before saying "...and N more".
 */
export const CRATE = { grabId: 'crate_grab', refreshMs: 3_000, listMax: 15, imageName: 'crate.png' } as const;

/** File name of the die picture attached to a claim that rolled the D20. */
export const D20_IMAGE_NAME = 'd20.png';

/**
 * How the D20 animation plays, like WHEEL_ANIMATION: the reply first shows the die tumbling, the
 * picture is swapped every `frameMs` milliseconds (the die slowing down and showing other numbers)
 * for `minSeconds` to `maxSeconds`, and then it lands on the real roll. Keep `frameMs` at 500 or more.
 */
export const D20_ANIMATION = { frameMs: 1000, minSeconds: 3, maxSeconds: 5 };

/**
 * What a roll of the D20 (the `d20` effect, on the D20 item) does to a claim. A roll of 1 is a
 * critical fail: the claim pays nothing and the hour is used up. A roll of `sides` is a critical
 * success: it pays `critMultiplier` times as much and lets the member claim once more in the same
 * hour (and that extra claim rolls the die too). Any roll in between multiplies the claim by
 * roll / `divisor` (with 10, a 2 is 0.2x, a 10 is 1x and a 19 is 1.9x).
 */
export const D20 = { sides: 20, critMultiplier: 2, divisor: 10 };

/**
 * How long a slash command may go without a reply before the bot tells Discord "one moment"
 * (shown as "Koma is thinking..."). Discord fails a slash command that isn't answered within 3
 * seconds, so keep this under 3000. A reply made after this is always public.
 */
export const SLASH_DEFER_AFTER_MS = 2500;

/**
 * The lock taken on a victim while a rob on them runs (see `rob` in services/economy.ts), so two
 * robbers can't act on the same victim at the same moment. A second robber waits for it: every
 * `retryMs` they look again, for at most `attempts` looks, then are told to try again. `holdMs` is
 * how long a lock lasts if the bot stops before it is released; a rob takes well under a second.
 */
export const ROB_LOCK = { holdMs: 15_000, retryMs: 100, attempts: 50 } as const;

/**
 * Commands that can only be used with the prefix (`k!rob`), not as slash commands. They aren't
 * registered with Discord, a slash command with that name is answered as unknown, and `/help`
 * leaves them out. Their entries in `SLASH` (discord/slash.ts) can stay, so taking a name off
 * this list brings the slash command back at the next start. Names are command names, in lower case.
 */
export const SLASH_EXCLUDED: readonly string[] = ['rob'];

/** Most choices Discord shows in an autocomplete list. */
export const AUTOCOMPLETE_MAX_CHOICES = 25;

/** Longest text put in one embed field before it is cut off with "...and N more" (Discord's own limit is 1024). */
export const FIELD_MAX_LENGTH = 1000;

/** Most characters of item text in one databank message. Discord cuts an embed off at 6000, so this leaves room for titles. */
export const DATABANK_PAGE_LENGTH = 4500;

/** Rob and effect chances are rolled in this many steps. Only worth changing for very precise chances. */
export const CHANCE_STEPS = 1_000_000;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Drawn once per star of an item: 3 stars is "★★★". */
export const STAR_SYMBOL: string = '★';

/** Language used for thousands separators: "en-US" gives 1,250. */
export const NUMBER_LOCALE = 'en-US';

/** Most decimals shown on a percentage: 12.345% shows as 12.35% at 2. */
export const PERCENT_DECIMALS = 2;

// ---------------------------------------------------------------------------
// Rob titles. Each rob picks one at random from the matching list.
// Add as many as you like, but keep at least one in each list.
// ---------------------------------------------------------------------------

export const SUCCESS_TITLES: readonly string[] = ['IT\'S A STICKUP!', 'THEY\'VE BEEN SLIMED!'];
export const FAILURE_TITLES: readonly string[] = ['L+Ratio', 'Your XP was too low', 'You\'re washed..'];

// ---------------------------------------------------------------------------
// Gear lines: how each effect reads on an item or in the gear summary. `value` is the
// strength, like "10%". Every effect in data/effects.ts needs a line here.
// ---------------------------------------------------------------------------

export const EFFECT_TEXT: Record<EffectId, (value: string) => string> = {
  robChance: (value) => `+${value} rob success chance`,
  robAmount: (value) => `+${value} ${CURRENCY_EMOJI} stolen`,
  robDefense: (value) => `-${value} chance of being robbed`,
  robShield: (value) => `-${value} ${CURRENCY_EMOJI} lost when robbed`,
  fineReduction: (value) => `-${value} fine when caught`,
  robAmountCut: (value) => `-${value} ${CURRENCY_EMOJI} stolen`,
  claimTax: (value) => `Wither: members you rob lose ${value} of their next claim to you`,
  robTax: (value) => `Yowch, My Coins! You get ${value} of the next rob by members you rob`,
  wheelSpin: (value) => `Wheel of Fortune: ${value} of your claims and successful robs spin the wheel`,
  d20: (value) =>
    `High Roller: ${value} of your claims roll a D20. A 1 pays nothing, 2 to 19 pays the roll divided by 10 (a 7 is 0.7x), and a 20 pays double and lets you claim again this hour`,
  slothDefense: (value) => `Sloth: -${value} chance of being robbed`,
  slothCooldown: (value) => `Sloth: +${value} rob and claim cooldowns`,
  glassCannon: (value) => `Glass cannon: +${value} ${CURRENCY_EMOJI} stolen`,
  glassCannonPenalty: (value) => `Glass cannon: +${value} fine when caught`,
  claimBonus: (value) => `+${value} ${CURRENCY_EMOJI} from hourly claims`,
  pullDiscount: (value) => `-${value} gacha pull cost`,
};

/** What each gear slot is called on the gear card. */
export const SLOT_LABELS: Record<Slot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
};

// ---------------------------------------------------------------------------
// Messages. `p` is the command prefix (like "k!"), `user` and `victim` are mentions.
// ---------------------------------------------------------------------------

export const TEXT = {
  common: {
    /** Sent when a command crashes. */
    error: 'Something went wrong. Please try again.',
    /** `usage` is the command as typed after the prefix, like "rob @user". */
    memberNotFound: (p: string, usage: string) => `Could not find member in server. Mention via \`${p}${usage}\`.`,
    /** Sent when a slash command is used outside a server. */
    serverOnly: 'Koma only works in servers.',
    /** Sent when a slash command is still registered with Discord but the bot no longer has it. */
    unknownSlash: 'That command is no longer available.',
    /** Ends a list that was too long for one field. */
    moreLines: (count: number) => `...and ${count} more`,
  },

  balance: {
    title: (name: string) => `${name}'s balance`,
    points: (points: string) => `**${points}** ${CURRENCY_EMOJI}`,
    claimField: 'Hourly claim',
    claimReady: (p: string) => `Ready. Use \`${p}claim\`!`,
    /** A critical success on the D20 left one more claim this hour. */
    claimBonusReady: (p: string) => `Bonus claim ready. Use \`${p}claim\` before the hour ends!`,
    claimWait: (unix: number) => `Claimed. Next one <t:${unix}:R>`,
    robField: 'Rob cooldown',
    robReady: (p: string) => `Ready. Use \`${p}rob @user\`!`,
    robWait: (unix: number) => `Recovering. Ready <t:${unix}:R>`,
    protectionField: 'Robbery protection',
    protectionNoneSelf: 'None. You can be robbed.',
    protectionNoneOther: 'None. They can be robbed.',
    protectionEndsSelf: (unix: number) => `You can be robbed <t:${unix}:R>`,
    protectionEndsOther: (unix: number) => `They can be robbed <t:${unix}:R>`,
    /** Status effects on the member, one line each. The field only appears while there is one. */
    effectsField: 'Effects',
    /** Withered by a Coughing Baby wearer. `taker` is a mention, `rate` like "25%". */
    witheredSelf: (rate: string, taker: string) => `Withered: ${taker} takes ${rate} of your next claim.`,
    witheredOther: (rate: string, taker: string) => `Withered: ${taker} takes ${rate} of their next claim.`,
    /** Marked by a Frog wearer: part of their next successful rob goes to `taker` (a mention). */
    robTaxSelf: (rate: string, taker: string) => `Yowch, My Coins! ${taker} takes ${rate} of your next rob.`,
    robTaxOther: (rate: string, taker: string) => `Yowch, My Coins! ${taker} takes ${rate} of their next rob.`,
  },

  wheel: {
    /** Added under a claim or rob when the wheel spun. `multiplier` is like "1.5x". */
    /** `change` is what the spin did to the points with its sign, like "+50" or "-90"; left out when it changed nothing. */
    landed: (multiplier: string, change = '') => `The wheel landed on **${multiplier}**${change ? ` (**${change}** ${CURRENCY_EMOJI})` : ''}.`,
    /** Shown while the wheel is still turning. `user` is a mention. */
    spinningTitle: 'The wheel is spinning...',
    spinning: (user: string) => `${user} spins the wheel...`,
  },

  d20: {
    /** Shown while the die is still tumbling. `user` is a mention. */
    spinningTitle: 'The die is rolling...',
    spinning: (user: string) => `${user} rolls the D20...`,
    failTitle: 'Critical fail!',
    successTitle: 'Critical success!',
    /** A roll of 1: the whole claim text. */
    fail: (user: string, roll: number) =>
      `${user} rolled a **${roll}** on the D20. Critical fail! Nothing to claim, and no more claims this hour.`,
    /** Added under a claim that rolled 2 up to one below the top. `multiplier` is like "1.3x". */
    /** `change` is what the die did to the points with its sign, like "+30" or "-40"; left out when it changed nothing. */
    landed: (roll: number, multiplier: string, change = '') => `The D20 landed on **${roll}**: **${multiplier}**${change ? ` (**${change}** ${CURRENCY_EMOJI})` : ''}.`,
    /** Added under a claim that rolled the top number. */
    critical: (roll: number, multiplier: string, change = '') =>
      `Critical success! The D20 landed on **${roll}** and paid **${multiplier}**${change ? ` (**${change}** ${CURRENCY_EMOJI})` : ''}.`,
    claimAgain: 'You can claim again this hour.',
    /** The "Next claim" field after a critical success: right now (once more), then the usual hour. */
    nextBonus: (unix: number) => `**Now**, once more. Then <t:${unix}:R>`,
    bonusFooter: 'A bonus claim from a critical success.',
  },

  claim: {
    already: (unix: number) => `You already claimed this hour. Come back <t:${unix}:R>`,
    title: 'Hourly claim',
    claimed: (user: string, amount: string) => `${user} claimed **${amount}** ${CURRENCY_EMOJI}.`,
    claimedWithGear: (user: string, amount: string, bonus: string) =>
      `${user} claimed **${amount}** ${CURRENCY_EMOJI}. (+${bonus} ${CURRENCY_EMOJI} from gear.)`,
    /** Added when part of the claim was taxed by someone who robbed them. `taker` is a mention. */
    taxed: (taker: string, tax: string, kept: string) => `${taker} took **${tax}** ${CURRENCY_EMOJI} of it. You kept **${kept}** ${CURRENCY_EMOJI}.`,
    balanceField: 'Balance',
    nextField: 'Next claim',
    next: (unix: number) => `<t:${unix}:R>`,
  },

  gacha: {
    cantAfford: (p: string, cost: string, balance: string) =>
      `A pull costs **${cost}** ${CURRENCY_EMOJI} and you have **${balance}** ${CURRENCY_EMOJI}. Use \`${p}claim\` to earn more.`,
    /** `stars` is the star string, like "★★". */
    title: (stars: string, name: string) => `${stars}  ${name}`,
    description: (itemDescription: string) => `*${itemDescription}*`,
    /** Added under the description when the pulled item is exclusive to other members. `owners` is mentions. */
    exclusive: (owners: string) => `Only ${owners} can use this one.`,
    author: (name: string) => `${name} pulled`,
    spentField: 'Spent',
    spent: (cost: string) => `${cost} ${CURRENCY_EMOJI}`,
    spentWithGear: (cost: string, saved: string) => `${cost} ${CURRENCY_EMOJI} (gear saved ${saved} ${CURRENCY_EMOJI})`,
    balanceField: 'Balance',
    /** Field showing how close the member is to a guaranteed top-tier item. `stars` is the star string. */
    pityField: (stars: string) => `Pity (${stars})`,
    pityProgress: (count: string, hardPity: string) => `${count} / ${hardPity}`,
    footerNew: 'New item!',
    footerOwned: (count: number) => `You now own ${count}`,
    /** When the argument after the command isn't "multi". */
    usage: (p: string) => `Use \`${p}gacha\` for one pull, or \`${p}gacha multi\` for ${MULTI_PULLS} pulls at once.`,
    multiCantAfford: (p: string, pulls: number, cost: string, balance: string) =>
      `A multi pull (${pulls} pulls) costs **${cost}** ${CURRENCY_EMOJI} and you have **${balance}** ${CURRENCY_EMOJI}. Use \`${p}claim\` to earn more.`,
    multiTitle: (pulls: number) => `Multi pull x${pulls}`,
    /** One line per pull. `stars` is the star string; `isNew` when it is the first copy the member has ever owned. */
    multiLine: (stars: string, name: string, isNew: boolean) => `${stars}  ${name}${isNew ? ' · New!' : ''}`,
    /** Same, for a top-tier pull, which is set apart in bold. */
    multiLineTop: (stars: string, name: string, isNew: boolean) => `**${stars}  ${name}**${isNew ? ' · New!' : ''}`,
    /** Added under the list for each pulled item that is exclusive to other members. `owners` is mentions. */
    multiExclusive: (name: string, owners: string) => `Only ${owners} can use ${name}.`,
    multiSummaryField: 'Summary',
    /** One part of the summary: how many pulls gave items of a tier. `stars` is the star string. */
    multiTier: (stars: string, count: number) => `${stars} x${count}`,
    multiFooterNew: (count: number) => (count === 1 ? '1 new item!' : `${count} new items!`),
    multiFooterNoneNew: 'No new items',
  },

  plinko: {
    usage: (p: string) => `Use \`${p}plinko <bet>\` to drop a ball, like \`${p}plinko 100\`, or \`${p}plinko all\`.`,
    badBet: (p: string) => `The bet has to be a whole number of ${CURRENCY_EMOJI}, like \`${p}plinko 100\`, or \`all\`.`,
    tooSmall: (min: string) => `The smallest bet is **${min}** ${CURRENCY_EMOJI}.`,
    tooBig: (max: string) => `The biggest bet is **${max}** ${CURRENCY_EMOJI}.`,
    cantAfford: (p: string, bet: string, balance: string) =>
      `That bet is **${bet}** ${CURRENCY_EMOJI} and you have **${balance}** ${CURRENCY_EMOJI}. Use \`${p}claim\` to earn more.`,
    dropTitle: 'Plinko',
    dropping: (user: string, bet: string) => `${user} drops a ball for **${bet}** ${CURRENCY_EMOJI}...`,
    /** `multiplier` is like "3x". */
    resultTitle: (multiplier: string) => `Plinko: ${multiplier}`,
    landed: (user: string, bet: string, multiplier: string) => `${user} bet **${bet}** ${CURRENCY_EMOJI} and the ball landed on **${multiplier}**.`,
    paidMore: (payout: string) => `They won **${payout}** ${CURRENCY_EMOJI}!`,
    paidSame: 'They got their bet back.',
    paidLess: (payout: string) => `They got **${payout}** ${CURRENCY_EMOJI} back.`,
    paidNothing: 'They lost it all.',
    author: (name: string) => `${name} played plinko`,
    betField: 'Bet',
    payoutField: 'Payout',
    /** `change` is signed, like "+200" or "-50". */
    payout: (payout: string, change: string) => `${payout} ${CURRENCY_EMOJI} (${change} ${CURRENCY_EMOJI})`,
    balanceField: 'Balance',
    /** `percent` is like "98%": what the board pays back on average. */
    footer: (percent: string) => `The board pays back ${percent} of a bet on average.`,
    againButton: (bet: string) => `Again (${bet})`,
    doubleButton: (bet: string) => `Double (${bet})`,
    halfButton: (bet: string) => `Half (${bet})`,
    notYours: 'This is not your game.',
  },

  sell: {
    usage: (p: string) =>
      `Use \`${p}sell <item>\` to sell one copy, \`${p}sell <number> <item>\` to sell that many copies, \`${p}sell all <item>\` to sell every copy you aren't wearing, or \`${p}sell stars <1-4>\` to sell everything of a star tier that you aren't wearing.`,
    badStars: (p: string) => `Pick a star tier from 1 to 4, like \`${p}sell stars 1\`.`,
    askWhichAll: (p: string) => `Which item? Use \`${p}sell all <item name>\`.`,
    /** Typed a number but no item. */
    askWhichAmount: (p: string) => `Which item? Use \`${p}sell <number> <item name>\`.`,
    badAmount: (p: string) => `The amount must be a whole number, 1 or more, like \`${p}sell 3 <item name>\`.`,
    /** Asked for more copies than can be sold. `available` is how many aren't worn. */
    notEnough: (p: string, name: string, wanted: number, available: number) =>
      `You asked to sell ${wanted} but you only have **${available}** ${available === 1 ? 'copy' : 'copies'} of **${name}** that you aren't wearing. Use \`${p}sell all ${name}\` to sell ${available === 1 ? 'it' : 'them all'}.`,
    ambiguous: (names: string[]) =>
      `That could be more than one of your items: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
    noSuchItem: (p: string, query: string) => `You don't have an item called "${query}". \`${p}inventory\` shows what you own.`,
    notOwned: (name: string) => `You don't own **${name}**.`,
    /** Every copy of the item is worn. */
    onlyEquipped: (p: string, name: string) => `Your **${name}** is equipped, so it can't be sold. Take it off with \`${p}unequip\` first.`,
    noneInTier: (stars: string) => `You don't own any ${stars} items.`,
    onlyEquippedTier: (p: string, stars: string) => `The only ${stars} items you have are equipped, so none can be sold. Take them off with \`${p}unequip\` first.`,
    /** Result of selling. `user` is a mention, `stars` the star string, `points` already formatted. */
    soldTitle: 'Sold',
    soldOne: (user: string, stars: string, name: string, points: string) => `${user} sold **${name}** ${stars} for **${points}** ${CURRENCY_EMOJI}.`,
    soldMany: (user: string, count: number, points: string) => `${user} sold **${count}** items for **${points}** ${CURRENCY_EMOJI}.`,
    /** One line of a sale: an item, how many, and what they were worth together. */
    line: (stars: string, name: string, count: number, points: string) => `${stars}  ${name} x${count} · ${points} ${CURRENCY_EMOJI}`,
    balanceField: 'Balance',
    footerLeft: (count: number) => (count === 0 ? 'You have none left' : `You have ${count} left`),
    /** Shown when some of what was planned could no longer be sold (equipped or already sold in the meantime). */
    skipped: (count: number) => (count === 1 ? '1 item could not be sold any more and was kept.' : `${count} items could not be sold any more and were kept.`),
    nothingLeft: 'None of those can be sold any more (they were equipped, or already sold).',
    /** The confirmation prompt for selling many. */
    confirmTitle: 'Sell these?',
    confirmDescription: (total: string, count: number, lines: string) => `${lines}\n\nTotal: **${total}** ${CURRENCY_EMOJI} for **${count}** items.`,
    confirmFooter: (seconds: number) => `Equipped items are never sold. Confirm within ${seconds} seconds.`,
    confirmButton: 'Sell',
    cancelButton: 'Cancel',
    cancelledTitle: 'Sale cancelled',
    cancelled: 'Nothing was sold.',
    timedOutTitle: 'Sale cancelled',
    timedOut: 'You took too long to answer, so nothing was sold.',
    notYours: "That sale isn't yours to confirm.",
  },

  inventory: {
    emptySelf: (p: string) => `Your inventory is empty. Use \`${p}claim\` to earn ${CURRENCY_EMOJI}, then \`${p}gacha\` to pull items.`,
    emptyOther: (name: string) => `${name} has no items yet.`,
    title: (name: string) => `${name}'s inventory`,
    summary: (total: string, unique: number, catalogSize: number) =>
      `${total} items · ${unique}/${catalogSize} unique collected`,
    item: (name: string, count: number, slot: string) => `${name} ×${count} · ${slot}`,
    itemEquipped: (name: string, count: number, slot: string) => `${name} ×${count} · ${slot} · equipped`,
    /** `stars` is the star string; `have` of `total` items in that tier are owned. */
    tierField: (stars: string, have: number, total: number) => `${stars} (${have}/${total})`,
    tierEmpty: 'None yet',
    /** Items that were pulled once but have since been removed from the catalog. */
    otherField: 'Other',
    otherItem: (id: string, count: number) => `${id} ×${count}`,
  },

  databank: {
    title: 'Databank',
    /** Added to the title when the list needs more than one message, like "Databank (2/3)". */
    titlePage: (title: string, page: number, pages: number) => `${title} (${page}/${pages})`,
    description: 'Every item and what it does while equipped.',
    /** `stars` is the star string; `count` is how many items are in that tier. */
    tierField: (stars: string, count: number) => `${stars} (${count})`,
    /** Name of a field that carries on from the one before it. */
    tierMore: (stars: string) => `${stars} (continued)`,
    item: (name: string, slot: string) => `**${name}** · ${slot}`,
    noEffects: 'No effects',
    /** The list of one star tier (`databank <1-4>`). `stars` is the star string. */
    tierTitle: (stars: string) => `Databank: ${stars}`,
    tierDescription: (stars: string) => `Every ${stars} item and what it does while equipped.`,
    /** Asked for a number that isn't a tier. `low` and `high` are the lowest and highest tier. */
    badTier: (p: string, low: number, high: number) =>
      `Pick a star tier from ${low} to ${high}, like \`${p}databank ${high}\`. \`${p}databank\` lists every item.`,
    noItemsInTier: (stars: string) => `There are no ${stars} items.`,
    /** Last line of an item that only some members can use. `owners` is mentions. */
    exclusive: (owners: string) => `Exclusive to ${owners}`,
    footer: (p: string) =>
      `${p}databank <item> shows one item in full, and ${p}databank <1-4> one star tier. Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
    /** The details of one item (`databank <item>`). `stars` is the star string. */
    detailTitle: (stars: string, name: string) => `${stars}  ${name}`,
    detailSlotField: 'Slot',
    detailEffectsField: 'Effects',
    detailExclusiveField: 'Exclusive',
    /** `owners` is mentions. */
    detailExclusive: (owners: string) => `Only ${owners} can use its effects. Anyone can pull and equip it.`,
    detailFooter: (p: string) => `${p}databank lists every item. Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
    noSuchItem: (p: string, query: string) => `There is no item called "${query}". \`${p}databank\` lists every item.`,
    ambiguous: (names: string[]) =>
      `That could be more than one item: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
  },

  leaderboard: {
    title: 'Leaderboard',
    empty: (p: string) => `Nobody has any ${CURRENCY_EMOJI} yet. Be the first with \`${p}claim\`!`,
    row: (rank: number, userId: string, points: string) => `**${rank}.** <@${userId}> — ${points} ${CURRENCY_EMOJI}`,
  },

  help: {
    title: 'Commands',
    /** `list` is the aliases already formatted, like "`k!pull`, `k!p`". */
    aliases: (list: string) => ` (also ${list})`,
    alias: (p: string, alias: string) => `\`${p}${alias}\``,
    /** `usage` already has the prefix, like "k!rob @user". */
    entry: (usage: string, aliases: string, description: string) => `**${usage}**${aliases}\n${description}`,
    footer: (claimMin: string, claimMax: string, pullCost: string) =>
      `Claim ${claimMin}-${claimMax} points every hour. A pull costs ${pullCost}.`,
  },

  gear: {
    title: (name: string) => `${name}'s gear`,
    unknownItem: (id: string) => `${id} (no longer exists)`,
    emptySelf: (p: string) => `Nothing equipped. Use \`${p}equip <item name>\`.`,
    emptyOther: 'Nothing equipped.',
    /** The first line of a filled slot; the item's effects follow on their own lines. */
    item: (name: string, stars: string) => `**${name}** ${stars}`,
    totalsField: 'Overall Effects',
    /** Shown instead of the effects when the item is equipped by someone it is not for. `owners` is mentions. */
    exclusive: (owners: string) => `Exclusive to ${owners}. It does nothing for this member.`,
  },

  equip: {
    askWhich: (p: string) => `Which item? Use \`${p}equip <item name>\`. \`${p}inventory\` shows what you own.`,
    ambiguous: (names: string[]) =>
      `That could be more than one of your items: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
    notOwned: (p: string, name: string) => `You don't own **${name}** yet. Pull for it with \`${p}gacha\`.`,
    noSuchItem: (p: string, query: string) =>
      `You don't have an item called "${query}". \`${p}inventory\` shows what you own.`,
    alreadyEquipped: (name: string, slot: string) => `You already have **${name}** equipped as your ${slot}.`,
    title: (stars: string, name: string) => `${stars}  ${name}`,
    done: (user: string, slot: string) => `${user} equipped it as their ${slot}.`,
    doneReplacing: (user: string, slot: string, replaced: string) =>
      `${user} equipped it as their ${slot}. (Replaced **${replaced}**.)`,
    effectsField: 'Effects',
    noEffects: 'None',
    /** Extra field when the item is exclusive to other members. `owners` is mentions. */
    exclusiveField: 'Exclusive',
    exclusive: (owners: string) => `Only ${owners} can use its effects. It does nothing for you.`,
    footer: (p: string) => `See everything you have on with ${p}gear`,
  },

  unequip: {
    usage: (p: string) => `Which one? Use \`${p}unequip weapon\`, \`${p}unequip armor\` or \`${p}unequip all\`.`,
    tookOff: (names: string[]) => `You took off ${names.map((name) => `**${name}**`).join(' and ')}.`,
    nothingAtAll: "You aren't wearing anything.",
    noArmor: "You don't have any armor equipped.",
    noWeapon: "You don't have a weapon equipped.",
  },

  rob: {
    usage: (p: string) => `Use \`${p}rob @user\`.`,
    botTarget: 'You thought...',
    selfTarget: 'Vro..',
    cooldown: (unix: number) => `You can rob again <t:${unix}:R>.`,
    victimProtected: (victim: string, unix: number) =>
      `${victim} was robbed recently. They can be robbed again <t:${unix}:R>.`,
    victimBroke: (victim: string) => `${victim} has no ${CURRENCY_EMOJI} to steal.`,
    victimBusy: (victim: string) => `Someone else is robbing ${victim} right now. Try again in a moment.`,
    footer: (chance: string) => `Success chance: ${chance}`,
    success: (robber: string, victim: string, stolen: string) =>
      `${robber} robbed ${victim} and got away with **${stolen}** ${CURRENCY_EMOJI}.`,
    /** Added to a successful rob when the robber's gear made the take bigger. `amount` is how many points more. */
    gearAdded: (amount: string) => `Your gear added **${amount}** ${CURRENCY_EMOJI} to it.`,
    /** Added when the robber's gear made the take smaller (a cut, like the Coughing Baby's). */
    gearCut: (amount: string) => `Your gear took **${amount}** ${CURRENCY_EMOJI} off it.`,
    /** Added when the victim's armor kept part of the take from the robber. */
    shielded: (victim: string, amount: string) => `${victim}'s armor blocked **${amount}** ${CURRENCY_EMOJI} of it.`,
    /** Added to a caught rob when the robber's gear made the fine bigger (a glass cannon). */
    fineRaised: (amount: string) => `Your gear added **${amount}** ${CURRENCY_EMOJI} to the fine.`,
    /** Added to a successful rob when the wearer's gear taxes the victim's next claim. */
    claimTaxed: (victim: string, rate: string) => `${victim}'s next claim will be taxed ${rate}.`,
    /** Added to a successful rob when the wearer's gear taxes the victim's next successful rob. */
    robTaxed: (victim: string, rate: string) => `${victim}'s next rob will be taxed ${rate}.`,
    /** Added when part of this rob went to a Jew Frog wearer who robbed the robber earlier. `taker` is a mention. */
    robTaxPaid: (taker: string, tax: string, kept: string) => `${taker} took **${tax}** ${CURRENCY_EMOJI} of it. You kept **${kept}** ${CURRENCY_EMOJI}.`,
    /** Used instead of `success` when the victim was left with nothing. */
    successEverything: (robber: string, victim: string, stolen: string) =>
      `${robber} robbed ${victim} and got away with **${stolen}** ${CURRENCY_EMOJI}. That was everything they had...`,
    caughtFined: (robber: string, victim: string, fine: string) =>
      `${robber} tried to rob ${victim} but got caught, and paid them a fine of **${fine}** ${CURRENCY_EMOJI}.`,
    caughtFinedWithGear: (robber: string, victim: string, fine: string, waived: string) =>
      `${robber} tried to rob ${victim} but got caught, and paid them a fine of **${fine}** ${CURRENCY_EMOJI} (their gear cancelled ${waived} ${CURRENCY_EMOJI}).`,
    /** Gear cancelled the whole fine. */
    caughtGearSaved: (robber: string, victim: string) =>
      `${robber} tried to rob ${victim} but got caught, though their gear got them out of the fine.`,
    /** The fine is set to 0, so there was nothing to pay. */
    caughtNothingToFine: (robber: string, victim: string) =>
      `${robber} tried to rob ${victim} but got caught. There was no fine to pay.`,
    /** The robber has fewer points than the base fine. */
    robberTooPoor: (p: string, fine: string, balance: string) =>
      `You need at least **${fine}** ${CURRENCY_EMOJI} to rob, in case you get caught. You have **${balance}** ${CURRENCY_EMOJI}. Use \`${p}claim\` to earn more.`,
  },

  events: {
    adminOnly: 'Only the bot admin can use this command.',
    usage: (p: string) =>
      `Use \`${p}events\` to see this server's events channel and every event, \`${p}events start [event]\` to start one now, or \`${p}events channel <#channel | off>\` to choose where they happen.`,
    statusTitle: 'Random events',
    channelField: 'Channel',
    channelSet: (channel: string) => channel,
    channelNone: 'None yet, so no events happen here.',
    listField: 'Events',
    /** One line of the list of events: the id you type to start it, its name, its chance of being picked at random, and what it does. */
    listLine: (id: string, label: string, description: string, chance: string) => `\`${id}\` **${label}** (${chance}): ${description}`,
    channelChanged: (channel: string) => `Events will now happen in ${channel}. The first one comes at a random time.`,
    channelOff: 'Events are turned off in this server.',
    /** Why a channel can't be used. */
    channelMissing: "I can't find that channel in this server.",
    channelNotText: 'That is not a text channel I can send messages in. Pick a normal text channel.',
    channelNoPermission: (channel: string) => `I need to see ${channel}, send messages there and embed links. Give me those permissions there first.`,
    channelUsage: (p: string) => `Use \`${p}events channel #channel\` to choose the channel, or \`${p}events channel off\` to turn events off.`,
    startNoChannel: (p: string) => `Choose a channel first with \`${p}events channel #channel\`.`,
    startBusy: 'An event is already happening in this server. Wait until it is over.',
    startBadChannel: 'I could not use the events channel any more (it is gone, or I lost permission there). Choose it again.',
    /** `ids` is the list of event ids. */
    startUnknown: (name: string, ids: string) => `There is no event called "${name}". The events are: ${ids}`,
    started: (label: string, channel: string) => `Started **${label}** in ${channel}.`,
  },

  crate: {
    title: 'A crate landed!',
    /** `pile` is the points inside, `unix` is when it opens, in seconds. */
    description: (pile: string, unix: number) =>
      `A crate with **${pile}** ${CURRENCY_EMOJI} fell into the channel! Press **Grab** before it opens <t:${unix}:R>. Everyone who grabs splits the ${CURRENCY_EMOJI} evenly.`,
    button: 'Grab',
    grabbedField: 'Grabbed so far',
    grabbedNobody: 'Nobody yet',
    grabbedCount: (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`,
    grabbed: 'You are in! The crate opens when the timer ends, and everyone who grabbed splits it.',
    alreadyGrabbed: 'You already grabbed this crate.',
    openedTitle: 'The crate opened!',
    /** `each` is what everyone got, `extra` how many got one more to use up the remainder. */
    opened: (pile: string, count: number, each: string, extra: number) =>
      `**${pile}** ${CURRENCY_EMOJI} split between **${count}** ${count === 1 ? 'person' : 'people'}: **${each}** ${CURRENCY_EMOJI} each${
        extra > 0 ? `, and ${extra} lucky ${extra === 1 ? 'grabber' : 'grabbers'} got 1 more` : ''
      }.`,
    shareLine: (user: string, amount: string) => `${user} **+${amount}** ${CURRENCY_EMOJI}`,
    moreShares: (count: number) => `...and ${count} more`,
    sharesField: 'Who got what',
    crumbledTitle: 'The crate crumbled',
    crumbled: (pile: string) => `Nobody grabbed the **${pile}** ${CURRENCY_EMOJI}, so they blew away.`,
    failedTitle: 'The crate got stuck',
    failed: `Something went wrong while handing out the ${CURRENCY_EMOJI}, so nobody was paid. Ask the bot admin to look at the logs.`,
    someFailed: (count: number) => `${count} ${count === 1 ? 'payout' : 'payouts'} could not be made. Ask the bot admin to look at the logs.`,
  },

  give: {
    adminOnly: 'Only the bot admin can use this command.',
    usage: (p: string, max: string) =>
      `Use \`${p}give <item id> [amount]\` to give yourself an item (amount 1 to ${max}). This is for testing.`,
    badAmount: (max: string) => `The amount must be a whole number from 1 to ${max}.`,
    /** `ids` is a comma-separated list of every item id in the catalog. */
    unknownItem: (id: string, ids: string) => `There is no item with the id "${id}". The ids are: ${ids}`,
    /** `stars` is the star string; `given` is how many copies were added, `total` how many they own now. */
    done: (stars: string, name: string, id: string, given: string, total: string) =>
      `Gave you ${stars} **${name}** (\`${id}\`) ×${given}. You now own ${total}.`,
  },

  config: {
    title: 'Settings',
    footerAdmin: (p: string) =>
      `Change one with ${p}config set <setting> <value>, or put it back with ${p}config reset <setting>.`,
    footerOthers: 'Only the bot admin can change these.',
    /** `tiers` is like "1-star / 2-star / 3-star / 4-star". */
    equipmentGroup: (tiers: string) => `Equipment (${tiers} items)`,
    setting: (key: string, value: string) => `\`${key}\`: **${value}**`,
    /** `tiers` is like "1|2|3|4" and `values` like "5% / 10% / 15% / 20%". */
    equipmentSetting: (effect: string, tiers: string, values: string) => `\`equipment.${effect}.${tiers}\`: **${values}**`,
    /** Shown after a star weight: the chance it works out to, like "(70%)". */
    starShare: (value: string, percent: number) => `${value} (${percent}%)`,
    unknownAction: (p: string) =>
      `Use \`${p}config\` to see the settings, or \`${p}config set <setting> <value>\` (admin only).`,
    adminOnly: 'Only the bot admin can change settings.',
    /** Shown when someone tries to change the prefix while the bot runs with ENV=LOCAL. */
    prefixFromEnv: "This bot is running with ENV=LOCAL, so its prefix comes from the .env file and can't be changed here.",
    /** The prefix in the settings list while it comes from .env. */
    prefixFromEnvValue: (prefix: string) => `${prefix} (from .env)`,
    usageSet: (p: string) => `Usage: \`${p}config set <setting> <value>\`. See \`${p}config\` for the setting names.`,
    usageReset: (p: string) => `Usage: \`${p}config reset <setting>\`. See \`${p}config\` for the setting names.`,
    noSuchSetting: (p: string, key: string) => `There is no setting called \`${key}\`. See \`${p}config\` for the list.`,
    askValue: (p: string, key: string) => `What should \`${key}\` be set to? Usage: \`${p}config set ${key} <value>\`.`,
    changed: (key: string, from: string, to: string) => `Changed \`${key}\` from **${from}** to **${to}**.`,
    reset: (key: string, from: string, to: string) => `Reset \`${key}\` from **${from}** to **${to}**.`,
    /** Errors from the settings service itself (the admin check is enforced there too). */
    unknownSetting: (key: string) => `There is no setting called \`${key}\`.`,
    breaksRule: (problem: string) => `That would break a rule: ${problem}.`,
    invalidValue: (key: string, problem: string) => `\`${key}\` ${problem}.`,
  },
};

// ---------------------------------------------------------------------------
// Checked when the bot starts, so a typo here stops it with a clear message instead of
// causing odd behavior later.
// ---------------------------------------------------------------------------

/** Discord rejects embed titles longer than this. */
const MAX_TITLE_LENGTH = 256;

export function validateConstants(): void {
  const problems: string[] = [];

  for (const [name, titles] of [
    ['SUCCESS_TITLES', SUCCESS_TITLES],
    ['FAILURE_TITLES', FAILURE_TITLES],
  ] as const) {
    if (titles.length === 0) problems.push(`${name} needs at least one title`);
    for (const title of titles) {
      if (title.trim() === '') problems.push(`${name} has an empty title`);
      if (title.length > MAX_TITLE_LENGTH) problems.push(`${name} has a title over ${MAX_TITLE_LENGTH} characters: "${title}"`);
    }
  }

  if (!(MAX_REDUCTION > 0 && MAX_REDUCTION < 1)) problems.push('MAX_REDUCTION must be above 0 and below 1');
  if (!(FIELD_MAX_LENGTH >= 50 && FIELD_MAX_LENGTH <= 1024)) problems.push('FIELD_MAX_LENGTH must be between 50 and 1024');
  if (!Number.isInteger(PERCENT_DECIMALS) || PERCENT_DECIMALS < 0 || PERCENT_DECIMALS > 10) {
    problems.push('PERCENT_DECIMALS must be a whole number from 0 to 10');
  }
  if (STAR_SYMBOL === '') problems.push('STAR_SYMBOL cannot be empty');
  if (!/^<a?:\w{2,32}:\d{17,20}>$/.test(CURRENCY_EMOJI)) problems.push('CURRENCY_EMOJI must be a full custom emoji code, like <:name:123456789012345678>');
  if (!/^\d{17,20}$/.test(ADMIN_USER_ID)) problems.push('ADMIN_USER_ID must be a Discord user id (17 to 20 digits)');
  if (MAX_PREFIX_LENGTH < 1) problems.push('MAX_PREFIX_LENGTH must be at least 1');
  if (CHANCE_STEPS < 100) problems.push('CHANCE_STEPS must be at least 100');
  if (MULTI_PULLS < 2 || MULTI_PULLS > 30) problems.push('MULTI_PULLS must be from 2 to 30');
  if (!(SLASH_DEFER_AFTER_MS >= 500 && SLASH_DEFER_AFTER_MS < 3000)) {
    problems.push('SLASH_DEFER_AFTER_MS must be from 500 to under 3000 (Discord fails a command that is not answered in 3 seconds)');
  }
  if (!(ROB_LOCK.retryMs >= 10 && ROB_LOCK.attempts >= 1 && ROB_LOCK.holdMs > ROB_LOCK.retryMs * ROB_LOCK.attempts)) {
    problems.push('ROB_LOCK: retryMs must be at least 10, attempts at least 1, and holdMs longer than every wait (retryMs x attempts)');
  }
  if (SLASH_EXCLUDED.some((name) => name === '' || name !== name.toLowerCase())) {
    problems.push('SLASH_EXCLUDED names must be command names in lower case');
  }
  if (!(AUTOCOMPLETE_MAX_CHOICES >= 1 && AUTOCOMPLETE_MAX_CHOICES <= 25)) problems.push('AUTOCOMPLETE_MAX_CHOICES must be from 1 to 25');
  if (!(D20_ANIMATION.frameMs >= 500)) problems.push('D20_ANIMATION.frameMs must be at least 500 (Discord limits message edits)');
  if (!(D20_ANIMATION.minSeconds > 0 && D20_ANIMATION.minSeconds <= D20_ANIMATION.maxSeconds)) {
    problems.push('D20_ANIMATION needs 0 < minSeconds <= maxSeconds');
  }
  if (!Number.isInteger(D20.sides) || D20.sides < 3) problems.push('D20.sides must be a whole number of at least 3');
  if (!(D20.critMultiplier >= 1)) problems.push('D20.critMultiplier must be at least 1');
  if (!(D20.divisor > 0)) problems.push('D20.divisor must be above 0');
  if (!Number.isInteger(PLINKO_ROWS) || PLINKO_ROWS < 2 || PLINKO_ROWS > 10 || PLINKO_ROWS % 2 !== 0) {
    problems.push('PLINKO_ROWS must be an even number from 2 to 10');
  }
  if (!(PLINKO_ANIMATION.frameMs >= 500)) problems.push('PLINKO_ANIMATION.frameMs must be at least 500 (Discord limits message edits)');
  if (!(PLINKO_BUTTONS.idleMs >= 5000)) problems.push('PLINKO_BUTTONS.idleMs must be at least 5000');
  if (!(EVENTS.tickMs >= 10_000)) problems.push('EVENTS.tickMs must be at least 10000');
  if (!(EVENTS.staleMs > EVENTS.tickMs)) problems.push('EVENTS.staleMs must be longer than EVENTS.tickMs');
  if (!(CRATE.refreshMs >= 1000)) problems.push('CRATE.refreshMs must be at least 1000 (Discord limits message edits)');
  if (!(Number.isInteger(CRATE.listMax) && CRATE.listMax >= 1 && CRATE.listMax <= 50)) problems.push('CRATE.listMax must be a whole number from 1 to 50');
  if (!(WHEEL_ANIMATION.frameMs >= 500)) problems.push('WHEEL_ANIMATION.frameMs must be at least 500 (Discord limits message edits)');
  if (!(WHEEL_ANIMATION.minSeconds > 0 && WHEEL_ANIMATION.minSeconds <= WHEEL_ANIMATION.maxSeconds)) {
    problems.push('WHEEL_ANIMATION needs 0 < minSeconds <= maxSeconds');
  }
  for (const [name, value] of [
    ['MAX_SETTING_POINTS', MAX_SETTING_POINTS],
    ['MAX_TIMER_MINUTES', MAX_TIMER_MINUTES],
    ['MAX_LEADERBOARD_SIZE', MAX_LEADERBOARD_SIZE],
    ['MAX_PITY', MAX_PITY],
    ['MAX_GIVE_AMOUNT', MAX_GIVE_AMOUNT],
    ['MULTI_PULLS', MULTI_PULLS],
    ['MAX_WHEEL_SLICES', MAX_WHEEL_SLICES],
    ['MAX_WHEEL_MULTIPLIER', MAX_WHEEL_MULTIPLIER],
    ['MAX_PLINKO_MULTIPLIER', MAX_PLINKO_MULTIPLIER],
    ['MAX_CRATE_SECONDS', MAX_CRATE_SECONDS],
    ['DATABANK_PAGE_LENGTH', DATABANK_PAGE_LENGTH],
    ['SETTINGS_REFRESH_MS', SETTINGS_REFRESH_MS],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) problems.push(`${name} must be a whole number of at least 1`);
  }

  if (problems.length > 0) throw new Error(`Invalid constants.ts: ${problems.join('; ')}`);
}
