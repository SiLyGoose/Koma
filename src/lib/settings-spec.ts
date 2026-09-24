import {
  CURRENCY_EMOJI,
  MAX_BLACKJACK_NATURAL,
  MAX_BLACKJACK_SECONDS,
  MAX_CRATE_SECONDS,
  MAX_LEADERBOARD_SIZE,
  MAX_PITY,
  MAX_PLINKO_MULTIPLIER,
  MAX_PREFIX_LENGTH,
  MAX_SETTING_POINTS,
  MAX_STONKS_HOURS,
  MAX_TIMER_MINUTES,
  MAX_VAULT_MULTIPLIER,
  MAX_VAULT_SECONDS,
  NUMBER_LOCALE,
  PERCENT_DECIMALS,
  PITY_STARS,
  PLINKO_ROWS,
} from '../constants.js';
import { EFFECT_IDS, EFFECTS, type EffectId } from '../perks/index.js';
import { STARS } from '../types.js';
import type { Settings } from '../config.js';

/*
 * Describes every setting: its name, what it means, and what values are allowed.
 * Used to validate values read from MongoDB and values typed into the admin config command.
 * Setting names are dot paths into the settings document, e.g. "claim.min".
 */

export interface SettingSpec {
  key: string;
  group: 'General' | 'Claim' | 'Gacha' | 'Sell' | 'Rob' | 'Plinko' | 'Blackjack' | 'Events' | 'Stonks' | 'Equipment';
  description: string;
  type: 'int' | 'number' | 'string';
  min?: number;
  max?: number;
  /** Shown and accepted as a percentage: 0.4 or "40%". */
  percent?: boolean;
  /** Shown and accepted as a multiplier of a bet: 2.5 or "2.5x". */
  multiplier?: boolean;
  /** For strings: what a valid value looks like. */
  pattern?: RegExp;
  /** Human wording for `pattern`, used in error messages. */
  expects?: string;
  /** Tidies typed input before it is validated. */
  normalize?: (raw: string) => string;
}

const MAX_POINTS = MAX_SETTING_POINTS;

function int(key: string, group: SettingSpec['group'], description: string, min: number, max: number): SettingSpec {
  return { key, group, description, type: 'int', min, max };
}

export const SPECS: readonly SettingSpec[] = [
  {
    key: 'prefix',
    group: 'General',
    description: 'Text a message must start with to run a command.',
    type: 'string',
    pattern: new RegExp(`^\\S{1,${MAX_PREFIX_LENGTH}}$`),
    expects: `1 to ${MAX_PREFIX_LENGTH} characters with no spaces`,
  },
  {
    key: 'embedColor',
    group: 'General',
    description: 'Color of the stripe on every embed.',
    type: 'string',
    pattern: /^#[0-9a-fA-F]{6}$/,
    expects: 'a hex color like #5865F2',
    normalize: (raw) => (raw.startsWith('#') ? raw : `#${raw}`).toUpperCase(),
  },
  int('leaderboardSize', 'General', 'Rows shown on the leaderboard.', 1, MAX_LEADERBOARD_SIZE),

  int('claim.min', 'Claim', `Lowest number of ${CURRENCY_EMOJI} an hourly claim can give.`, 0, MAX_POINTS),
  int('claim.max', 'Claim', `Highest number of ${CURRENCY_EMOJI} an hourly claim can give.`, 0, MAX_POINTS),

  int('gacha.cost', 'Gacha', `Cost of one pull, in ${CURRENCY_EMOJI}.`, 1, MAX_POINTS),
  int('gacha.starWeights.1', 'Gacha', 'Relative chance of a 1-star pull.', 0, MAX_POINTS),
  int('gacha.starWeights.2', 'Gacha', 'Relative chance of a 2-star pull.', 0, MAX_POINTS),
  int('gacha.starWeights.3', 'Gacha', 'Relative chance of a 3-star pull.', 0, MAX_POINTS),
  int('gacha.starWeights.4', 'Gacha', 'Relative chance of a 4-star pull.', 0, MAX_POINTS),
  int(
    'gacha.pity.softStart',
    'Gacha',
    `Pull number (since the last ${PITY_STARS}-star) where the ${PITY_STARS}-star chance starts rising.`,
    1,
    MAX_PITY,
  ),
  int(
    'gacha.pity.hardPity',
    'Gacha',
    `Pull number (since the last ${PITY_STARS}-star) that is guaranteed to give one (0 turns pity off).`,
    0,
    MAX_PITY,
  ),

  int('sell.price.1', 'Sell', `${CURRENCY_EMOJI} for selling one 1-star item.`, 0, MAX_POINTS),
  int('sell.price.2', 'Sell', `${CURRENCY_EMOJI} for selling one 2-star item.`, 0, MAX_POINTS),
  int('sell.price.3', 'Sell', `${CURRENCY_EMOJI} for selling one 3-star item.`, 0, MAX_POINTS),
  int('sell.price.4', 'Sell', `${CURRENCY_EMOJI} for selling one 4-star item.`, 0, MAX_POINTS),

  { key: 'rob.successChance', group: 'Rob', description: 'Chance a rob succeeds.', type: 'number', min: 0, max: 1, percent: true },
  int('rob.minStolen', 'Rob', `Lowest number of ${CURRENCY_EMOJI} a successful rob takes.`, 1, MAX_POINTS),
  int('rob.maxStolen', 'Rob', `Highest number of ${CURRENCY_EMOJI} a successful rob takes.`, 1, MAX_POINTS),
  int('rob.minVictimBalance', 'Rob', `Members with fewer ${CURRENCY_EMOJI} than this cannot be robbed (1 means anyone who has some).`, 1, MAX_POINTS),
  int('rob.failFine', 'Rob', `Fine a caught robber pays the victim. A member needs at least this many ${CURRENCY_EMOJI} to rob.`, 0, MAX_POINTS),
  int('rob.cooldownMinutes', 'Rob', 'Minutes a robber must wait between attempts.', 1, MAX_TIMER_MINUTES),
  int(
    'rob.victimProtectionMinutes',
    'Rob',
    'Minutes a member is protected from robbery after being robbed, counted from that robbery (0 turns it off).',
    0,
    MAX_TIMER_MINUTES,
  ),
  {
    key: 'rob.minChance',
    group: 'Rob',
    description: 'Lowest success chance equipment can push a rob down to (never raises a lower base chance).',
    type: 'number',
    min: 0,
    max: 1,
    percent: true,
  },
  {
    key: 'rob.maxChance',
    group: 'Rob',
    description: 'Highest success chance equipment can push a rob up to (never lowers a higher base chance).',
    type: 'number',
    min: 0,
    max: 1,
    percent: true,
  },

  int('plinko.minBet', 'Plinko', 'Smallest bet on plinko.', 1, MAX_POINTS),
  int('plinko.maxBet', 'Plinko', 'Biggest bet on plinko.', 1, MAX_POINTS),
  // One payout per slot counting in from the edge (the board is mirrored), generated from PLINKO_ROWS.
  ...Array.from({ length: PLINKO_ROWS / 2 + 1 }, (_, i): SettingSpec => {
    const place = i + 1;
    const where = place === 1 ? 'the two outermost slots' : place === PLINKO_ROWS / 2 + 1 ? 'the middle slot' : `the two slots ${i} in from the edge`;
    return {
      key: `plinko.payout.${place}`,
      group: 'Plinko',
      description: `What ${where} pay, as a multiple of the bet (2x pays double, 0.5x pays half back).`,
      type: 'number',
      min: 0,
      max: MAX_PLINKO_MULTIPLIER,
      multiplier: true,
    };
  }),

  int('blackjack.minBet', 'Blackjack', 'Smallest bet on blackjack.', 1, MAX_POINTS),
  int('blackjack.maxBet', 'Blackjack', 'Biggest bet on blackjack (a double can go above it).', 1, MAX_POINTS),
  {
    key: 'blackjack.naturalPayout',
    group: 'Blackjack',
    description: 'What a blackjack pays as a multiple of the bet, on top of getting the bet back (1.5x is 3 to 2, 1x is even money).',
    type: 'number',
    min: 0,
    max: MAX_BLACKJACK_NATURAL,
    multiplier: true,
  },
  int('blackjack.joinSeconds', 'Blackjack', 'Seconds a blackjack party stays open for joining.', 5, MAX_BLACKJACK_SECONDS),
  int('blackjack.turnSeconds', 'Blackjack', 'Seconds a blackjack player has to act before they stand.', 5, MAX_BLACKJACK_SECONDS),

  int('events.minMinutes', 'Events', 'Fewest minutes between one random event and the next.', 5, MAX_TIMER_MINUTES),
  int('events.maxMinutes', 'Events', 'Most minutes between one random event and the next.', 5, MAX_TIMER_MINUTES),
  int('events.crate.minPoints', 'Events', `Fewest ${CURRENCY_EMOJI} a point crate can hold.`, 1, MAX_POINTS),
  int('events.crate.maxPoints', 'Events', `Most ${CURRENCY_EMOJI} a point crate can hold.`, 1, MAX_POINTS),
  int('events.crate.seconds', 'Events', 'Seconds the point crate stays open for grabbing.', 10, MAX_CRATE_SECONDS),

  int('events.vault.minPlayers', 'Events', 'Fewest people who have to join a vault breaker before it can succeed.', 2, 50),
  int('events.vault.joinSeconds', 'Events', 'Seconds a vault breaker stays open for joining.', 30, MAX_VAULT_SECONDS),
  {
    key: 'events.vault.multiplier',
    group: 'Events',
    description: 'What a vault breaker attempts, as a multiple of the points lost to gambling since the last one.',
    type: 'number',
    min: 1,
    max: MAX_VAULT_MULTIPLIER,
    multiplier: true,
  },
  int('events.vault.fine', 'Events', 'What every joiner pays, added back to the vault, when the crack fails.', 0, MAX_POINTS),

  int(
    'stonks.capHours',
    'Stonks',
    "Hours after a claim is first ready that STONKS!'s claim multiplier takes to reach its cap (equipment.stackosaurus.<stars>) and stop climbing.",
    1,
    MAX_STONKS_HOURS,
  ),
  {
    key: 'events.vault.baseChance',
    group: 'Events',
    description: 'The vault breaker success chance with exactly minPlayers joined.',
    type: 'number',
    min: 0,
    max: 1,
    percent: true,
  },
  {
    key: 'events.vault.chancePerPlayer',
    group: 'Events',
    description: 'Added to the vault breaker success chance for every joiner past minPlayers.',
    type: 'number',
    min: 0,
    max: 1,
    percent: true,
  },
  {
    key: 'events.vault.maxChance',
    group: 'Events',
    description: 'The vault breaker success chance can never climb past this, however many join.',
    type: 'number',
    min: 0,
    max: 1,
    percent: true,
  },

  // One setting per effect per star tier, generated from the effect registry.
  ...EFFECT_IDS.flatMap((id) =>
    STARS.map(
      (stars): SettingSpec => ({
        key: `equipment.${id}.${stars}`,
        group: 'Equipment',
        description: `${EFFECTS[id].description} For ${stars}-star items.`,
        type: 'number',
        min: EFFECTS[id].min,
        max: EFFECTS[id].max,
        percent: true,
      }),
    ),
  ),
];

export function findSpec(key: string): SettingSpec | undefined {
  const wanted = key.trim().toLowerCase();
  return SPECS.find((spec) => spec.key.toLowerCase() === wanted);
}

/**
 * Matches "equipment.<effect>" with no star tier (e.g. from `config reset equipment.robChance`), the
 * form that means "every star tier of this effect", and returns the effect's canonical id. Returns
 * undefined for anything else, including a full `equipment.<effect>.<stars>` key.
 */
export function findEquipmentEffectId(key: string): EffectId | undefined {
  const match = /^equipment\.([^.]+)$/i.exec(key.trim());
  if (!match) return undefined;
  const wanted = (match[1] as string).toLowerCase();
  return EFFECT_IDS.find((id) => id.toLowerCase() === wanted);
}

// ---------------------------------------------------------------------------
// Dot-path helpers
// ---------------------------------------------------------------------------

export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setPath(target: object, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = target as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (next === null || typeof next !== 'object') current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1] as string] = value;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function formatNumber(spec: SettingSpec, n: number): string {
  if (spec.multiplier) return `${Number(n.toFixed(2))}x`;
  return spec.percent ? `${Number((n * 100).toFixed(PERCENT_DECIMALS))}%` : n.toLocaleString(NUMBER_LOCALE);
}

function rangeText(spec: SettingSpec): string {
  const { min, max } = spec;
  if (min !== undefined && max !== undefined) return ` between ${formatNumber(spec, min)} and ${formatNumber(spec, max)}`;
  if (min !== undefined) return ` of at least ${formatNumber(spec, min)}`;
  if (max !== undefined) return ` of at most ${formatNumber(spec, max)}`;
  return '';
}

/** Returns a problem description like "must be a whole number between 1 and 25", or null if fine. */
export function validateValue(spec: SettingSpec, value: unknown): string | null {
  if (spec.type === 'string') {
    if (typeof value !== 'string' || (spec.pattern !== undefined && !spec.pattern.test(value))) {
      return `must be ${spec.expects ?? 'text'}`;
    }
    return null;
  }

  const kind =
    spec.type === 'int' ? 'a whole number' : spec.percent ? 'a percentage like 40% or 0.4' : spec.multiplier ? 'a multiplier like 2.5 or 2.5x' : 'a number';
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (spec.type === 'int' && !Number.isInteger(value)) ||
    (spec.min !== undefined && value < spec.min) ||
    (spec.max !== undefined && value > spec.max)
  ) {
    return `must be ${kind}${rangeText(spec)}`;
  }
  return null;
}

export type ParseResult = { ok: true; value: string | number } | { ok: false; error: string };

/** Turns text typed by the admin into a value for the setting, and validates it. */
export function parseInput(spec: SettingSpec, raw: string): ParseResult {
  const text = raw.trim();
  let value: string | number;

  if (spec.type === 'string') {
    value = spec.normalize ? spec.normalize(text) : text;
  } else if (text === '') {
    value = Number.NaN;
  } else if (spec.multiplier && /x$/i.test(text)) {
    const number = text.slice(0, -1).trim();
    value = number === '' ? Number.NaN : Number(number);
  } else if (spec.percent && text.endsWith('%')) {
    value = Number(text.slice(0, -1).trim()) / 100;
  } else {
    value = Number(text.replace(/[,_]/g, ''));
  }

  const problem = validateValue(spec, value);
  return problem ? { ok: false, error: problem } : { ok: true, value };
}

export function formatValue(spec: SettingSpec, value: unknown): string {
  if (typeof value === 'number') return formatNumber(spec, value);
  return String(value);
}

/** Checks rules that involve more than one setting. Returns a problem, or null if fine. */
export function checkConstraints(settings: Settings): string | null {
  if (settings.claim.min > settings.claim.max) {
    return 'claim.min cannot be higher than claim.max';
  }
  if (settings.rob.minStolen > settings.rob.maxStolen) {
    return 'rob.minStolen cannot be higher than rob.maxStolen';
  }
  if (settings.plinko.minBet > settings.plinko.maxBet) {
    return 'plinko.minBet cannot be higher than plinko.maxBet';
  }
  if (settings.blackjack.minBet > settings.blackjack.maxBet) {
    return 'blackjack.minBet cannot be higher than blackjack.maxBet';
  }
  if (settings.events.minMinutes > settings.events.maxMinutes) {
    return 'events.minMinutes cannot be higher than events.maxMinutes';
  }
  if (settings.events.crate.minPoints > settings.events.crate.maxPoints) {
    return 'events.crate.minPoints cannot be higher than events.crate.maxPoints';
  }
  if (settings.events.vault.baseChance > settings.events.vault.maxChance) {
    return 'events.vault.baseChance cannot be higher than events.vault.maxChance';
  }
  if (settings.rob.minChance > settings.rob.maxChance) {
    return 'rob.minChance cannot be higher than rob.maxChance';
  }
  const { softStart, hardPity } = settings.gacha.pity;
  if (hardPity > 0 && softStart > hardPity) {
    return 'gacha.pity.softStart cannot be higher than gacha.pity.hardPity';
  }
  const weights = settings.gacha.starWeights;
  if (STARS.reduce((sum, stars) => sum + weights[stars], 0) <= 0) {
    return 'at least one of gacha.starWeights.1 to .4 must be above 0';
  }
  return null;
}

/** Every problem with a full settings object, one string per problem. */
export function validateSettings(settings: Settings): string[] {
  const problems: string[] = [];
  for (const spec of SPECS) {
    const problem = validateValue(spec, getPath(settings, spec.key));
    if (problem) problems.push(`${spec.key} ${problem}`);
  }
  if (problems.length === 0) {
    const cross = checkConstraints(settings);
    if (cross) problems.push(cross);
  }
  return problems;
}
