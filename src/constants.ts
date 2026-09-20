import type { EffectId } from './data/effects.js';
import type { Slot } from './types.js';

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

/** Longest text put in one embed field before it is cut off with "...and N more" (Discord's own limit is 1024). */
export const FIELD_MAX_LENGTH = 1000;

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
  },

  claim: {
    already: (unix: number) => `You already claimed this hour. Come back <t:${unix}:R>`,
    title: 'Hourly claim',
    claimed: (user: string, amount: string) => `${user} claimed **${amount}** points.`,
    claimedWithGear: (user: string, amount: string, bonus: string) =>
      `${user} claimed **${amount}** points. (${bonus} of that came from your gear.)`,
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
    author: (name: string) => `${name} pulled`,
    spentField: 'Spent',
    spent: (cost: string) => cost,
    spentWithGear: (cost: string, saved: string) => `${cost} (gear saved ${saved})`,
    balanceField: 'Balance',
    footerNew: 'New item!',
    footerOwned: (count: number) => `You now own ${count}`,
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
    /** The robber had no points left to fine. */
    caughtNothingToFine: (robber: string, victim: string) =>
      `${robber} tried to rob ${victim} but got caught. They had nothing left to fine.`,
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
  for (const [name, value] of [
    ['MAX_SETTING_POINTS', MAX_SETTING_POINTS],
    ['MAX_TIMER_MINUTES', MAX_TIMER_MINUTES],
    ['MAX_LEADERBOARD_SIZE', MAX_LEADERBOARD_SIZE],
    ['SETTINGS_REFRESH_MS', SETTINGS_REFRESH_MS],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) problems.push(`${name} must be a whole number of at least 1`);
  }

  if (problems.length > 0) throw new Error(`Invalid constants.ts: ${problems.join('; ')}`);
}
