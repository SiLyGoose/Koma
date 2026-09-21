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

export const SUCCESS_TITLES: readonly string[] = ["IT'S A STICKUP!", "YOU'VE BEEN SLIMED!"];
export const FAILURE_TITLES: readonly string[] = ['L+Ratio', 'Your XP was too low'];

// ---------------------------------------------------------------------------
// Gear lines: how each effect reads on an item or in the gear summary. `value` is the
// strength, like "10%". Every effect in data/effects.ts needs a line here.
// ---------------------------------------------------------------------------

export const EFFECT_TEXT: Record<EffectId, (value: string) => string> = {
  robChance: (value) => `+${value} rob success chance`,
  robAmount: (value) => `+${value} points stolen`,
  robDefense: (value) => `-${value} chance of being robbed`,
  robShield: (value) => `-${value} points lost when robbed`,
  fineReduction: (value) => `-${value} fine when caught`,
  robAmountCut: (value) => `-${value} points stolen`,
  claimTax: (value) => `Wither: members you rob lose ${value} of their next claim to you`,
  robTax: (value) => `Yowch, My Coins! You get ${value} of the next rob by members you rob`,
  wheelSpin: (value) => `High Roller: ${value} of your claims and successful robs spin the wheel`,
  glassCannon: (value) => `Glass cannon: +${value} points stolen`,
  glassCannonPenalty: (value) => `Glass cannon: +${value} fine when caught`,
  claimBonus: (value) => `+${value} points from hourly claims`,
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
    /** Ends a list that was too long for one field. */
    moreLines: (count: number) => `...and ${count} more`,
  },

  balance: {
    title: (name: string) => `${name}'s balance`,
    points: (points: string) => `**${points}** points`,
    claimField: 'Hourly claim',
    claimReady: (p: string) => `Ready. Use \`${p}claim\`!`,
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
    landed: (multiplier: string) => `The wheel landed on **${multiplier}**.`,
    /** Shown while the wheel is still turning. `user` is a mention. */
    spinningTitle: 'The wheel is spinning...',
    spinning: (user: string) => `${user} spins the wheel...`,
  },

  claim: {
    already: (unix: number) => `You already claimed this hour. Come back <t:${unix}:R>`,
    title: 'Hourly claim',
    claimed: (user: string, amount: string) => `${user} claimed **${amount}** points.`,
    claimedWithGear: (user: string, amount: string, bonus: string) =>
      `${user} claimed **${amount}** points. (${bonus} of that came from your gear.)`,
    /** Added when part of the claim was taxed by someone who robbed them. `taker` is a mention. */
    taxed: (taker: string, tax: string, kept: string) => `${taker} took **${tax}** of it. You kept **${kept}**.`,
    balanceField: 'Balance',
    nextField: 'Next claim',
    next: (unix: number) => `<t:${unix}:R>`,
  },

  gacha: {
    cantAfford: (p: string, cost: string, balance: string) =>
      `A pull costs **${cost}** points and you have **${balance}**. Use \`${p}claim\` to earn more.`,
    /** `stars` is the star string, like "★★". */
    title: (stars: string, name: string) => `${stars}  ${name}`,
    description: (itemDescription: string) => `*${itemDescription}*`,
    /** Added under the description when the pulled item is exclusive to other members. `owners` is mentions. */
    exclusive: (owners: string) => `Only ${owners} can use this one.`,
    author: (name: string) => `${name} pulled`,
    spentField: 'Spent',
    spent: (cost: string) => cost,
    spentWithGear: (cost: string, saved: string) => `${cost} (gear saved ${saved})`,
    balanceField: 'Balance',
    /** Field showing how close the member is to a guaranteed top-tier item. `stars` is the star string. */
    pityField: (stars: string) => `Pity (${stars})`,
    pityProgress: (count: string, hardPity: string) => `${count} / ${hardPity}`,
    footerNew: 'New item!',
    footerOwned: (count: number) => `You now own ${count}`,
    /** When the argument after the command isn't "multi". */
    usage: (p: string) => `Use \`${p}gacha\` for one pull, or \`${p}gacha multi\` for ${MULTI_PULLS} pulls at once.`,
    multiCantAfford: (p: string, pulls: number, cost: string, balance: string) =>
      `A multi pull (${pulls} pulls) costs **${cost}** points and you have **${balance}**. Use \`${p}claim\` to earn more.`,
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

  inventory: {
    emptySelf: (p: string) => `Your inventory is empty. Use \`${p}claim\` to earn points, then \`${p}gacha\` to pull items.`,
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
    /** Last line of an item that only some members can use. `owners` is mentions. */
    exclusive: (owners: string) => `Exclusive to ${owners}`,
    footer: (p: string) => `Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
  },

  leaderboard: {
    title: 'Leaderboard',
    empty: (p: string) => `Nobody has any points yet. Be the first with \`${p}claim\`!`,
    row: (rank: number, userId: string, points: string) => `**${rank}.** <@${userId}> — ${points}`,
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
    victimBroke: (victim: string) => `${victim} has no points to steal.`,
    footer: (chance: string) => `Success chance: ${chance}`,
    success: (robber: string, victim: string, stolen: string) =>
      `${robber} robbed ${victim} and got away with **${stolen}** points.`,
    /** Added to a successful rob when the wearer's gear taxes the victim's next claim. */
    claimTaxed: (victim: string, rate: string) => `${victim}'s next claim will be taxed ${rate}.`,
    /** Added to a successful rob when the wearer's gear taxes the victim's next successful rob. */
    robTaxed: (victim: string, rate: string) => `${victim}'s next rob will be taxed ${rate}.`,
    /** Added when part of this rob went to a Jew Frog wearer who robbed the robber earlier. `taker` is a mention. */
    robTaxPaid: (taker: string, tax: string, kept: string) => `${taker} took **${tax}** of it. You kept **${kept}**.`,
    /** Used instead of `success` when the victim was left with nothing. */
    successEverything: (robber: string, victim: string, stolen: string) =>
      `${robber} robbed ${victim} and got away with **${stolen}** points. That was everything they had...`,
    caughtFined: (robber: string, victim: string, fine: string) =>
      `${robber} tried to rob ${victim} but got caught, and paid them a fine of **${fine}** points.`,
    caughtFinedWithGear: (robber: string, victim: string, fine: string, waived: string) =>
      `${robber} tried to rob ${victim} but got caught, and paid them a fine of **${fine}** points (their gear cancelled ${waived}).`,
    /** Gear cancelled the whole fine. */
    caughtGearSaved: (robber: string, victim: string) =>
      `${robber} tried to rob ${victim} but got caught, though their gear got them out of the fine.`,
    /** The fine is set to 0, so there was nothing to pay. */
    caughtNothingToFine: (robber: string, victim: string) =>
      `${robber} tried to rob ${victim} but got caught. There was no fine to pay.`,
    /** Added when a fine left the robber with a negative balance. `debt` is how far below 0 they are. */
    inDebt: (robber: string, debt: string) => `${robber} is now **${debt}** points in debt.`,
    /** The robber has fewer points than the base fine. */
    robberTooPoor: (p: string, fine: string, balance: string) =>
      `You need at least **${fine}** points to rob, in case you get caught. You have **${balance}**. Use \`${p}claim\` to earn more.`,
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
  if (!/^\d{17,20}$/.test(ADMIN_USER_ID)) problems.push('ADMIN_USER_ID must be a Discord user id (17 to 20 digits)');
  if (MAX_PREFIX_LENGTH < 1) problems.push('MAX_PREFIX_LENGTH must be at least 1');
  if (CHANCE_STEPS < 100) problems.push('CHANCE_STEPS must be at least 100');
  if (MULTI_PULLS < 2 || MULTI_PULLS > 30) problems.push('MULTI_PULLS must be from 2 to 30');
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
    ['DATABANK_PAGE_LENGTH', DATABANK_PAGE_LENGTH],
    ['SETTINGS_REFRESH_MS', SETTINGS_REFRESH_MS],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) problems.push(`${name} must be a whole number of at least 1`);
  }

  if (problems.length > 0) throw new Error(`Invalid constants.ts: ${problems.join('; ')}`);
}
