import { MAX_BLACKJACK_NATURAL, MAX_BLACKJACK_SECONDS, BLACKJACK } from './blackjack.js';
import { ADMIN_USER_ID, SETTINGS_REFRESH_MS, MAX_REDUCTION, CURRENCY_EMOJI, TOKEN_EMOJI, CURRENCY_NAME, MAX_SETTING_POINTS, MAX_TIMER_MINUTES, MAX_LEADERBOARD_SIZE, MAX_PREFIX_LENGTH, MAX_GIVE_AMOUNT, CHANCE_STEPS } from './core.js';
import { D20_ANIMATION, D20 } from './d20.js';
import { AVATAR, SLASH_DEFER_AFTER_MS, SLASH_EXCLUDED, AUTOCOMPLETE_MAX_CHOICES, FIELD_MAX_LENGTH, DATABANK_ITEMS_PER_PAGE, DATABANK_BUTTONS, CONFIG_BUTTONS } from './discord.js';
import { EVENTS, MAX_CRATE_SECONDS, CRATE, MAX_EVENT_SECONDS, MAX_VAULT_MULTIPLIER, MAX_HEIST_ROUNDS, HEIST, SPLIT_STEAL, CODE, CODE_LENGTH } from './events.js';
import { STAR_SYMBOL, PERCENT_DECIMALS } from './formatting.js';
import { MULTI_PULLS, MAX_PITY, GACHA_ANIMATION, STAR_COLORS } from './gacha.js';
import { MAX_RAID_BOOST, MAX_RAID_ROUNDS, MAX_RAID_SECONDS, RAID, RAID_COMBAT, RAID_EMOJI } from './raid.js';
import { PLINKO_ROWS, MAX_PLINKO_MULTIPLIER, PLINKO_ANIMATION, PLINKO_BUTTONS } from './plinko.js';
import { ROB_LOCK, SUCCESS_TITLES, FAILURE_TITLES } from './rob.js';
import { MAX_STONKS_HOURS } from './stonks.js';
import { MAX_WHEEL_SLICES, MAX_WHEEL_MULTIPLIER, WHEEL_ANIMATION } from './wheel.js';

// Checked when the bot starts, so a typo here stops it with a clear message instead of
// causing odd behavior later.

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
  if (!/^<a?:\w{2,32}:\d{17,20}>$/.test(TOKEN_EMOJI)) problems.push('TOKEN_EMOJI must be a full custom emoji code, like <:name:123456789012345678>');
  if (!/^[a-z][a-z ]*$/.test(CURRENCY_NAME)) problems.push('CURRENCY_NAME must be lowercase words, like points');
  if (!/^\d{17,20}$/.test(ADMIN_USER_ID)) problems.push('ADMIN_USER_ID must be a Discord user id (17 to 20 digits)');
  if (MAX_PREFIX_LENGTH < 1) problems.push('MAX_PREFIX_LENGTH must be at least 1');
  if (CHANCE_STEPS < 100) problems.push('CHANCE_STEPS must be at least 100');
  if (MULTI_PULLS < 2 || MULTI_PULLS > 30) problems.push('MULTI_PULLS must be from 2 to 30');
  if (!(Number.isInteger(GACHA_ANIMATION.frames) && GACHA_ANIMATION.frames >= 2 && GACHA_ANIMATION.frames <= 120)) {
    problems.push('GACHA_ANIMATION.frames must be a whole number from 2 to 120');
  }
  if (!(Number.isInteger(GACHA_ANIMATION.flashFrames) && GACHA_ANIMATION.flashFrames >= 1 && GACHA_ANIMATION.flashFrames <= 30)) {
    problems.push('GACHA_ANIMATION.flashFrames must be a whole number from 1 to 30');
  }
  if (!(GACHA_ANIMATION.frameMs >= 20)) problems.push('GACHA_ANIMATION.frameMs must be at least 20 (GIF counts in hundredths of a second)');
  if (!(GACHA_ANIMATION.igniteAt > 0 && GACHA_ANIMATION.igniteAt < 1)) problems.push('GACHA_ANIMATION.igniteAt must be between 0 and 1');
  if (!(GACHA_ANIMATION.holdMs >= 0)) problems.push('GACHA_ANIMATION.holdMs cannot be negative');
  for (const [stars, color] of Object.entries(STAR_COLORS)) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) problems.push(`STAR_COLORS[${stars}] must be a colour like #ff4a5a`);
  }
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
  if (!(DATABANK_BUTTONS.idleMs >= 5000)) problems.push('DATABANK_BUTTONS.idleMs must be at least 5000');
  if (!(CONFIG_BUTTONS.idleMs >= 5000)) problems.push('CONFIG_BUTTONS.idleMs must be at least 5000');
  if (!(BLACKJACK.imageScale >= 1 && BLACKJACK.imageScale <= 3 && Number.isInteger(640 * BLACKJACK.imageScale) && Number.isInteger(400 * BLACKJACK.imageScale))) {
    problems.push('BLACKJACK.imageScale must be from 1 to 3 and give a whole number of pixels (640 x scale and 400 x scale), like 1, 1.5 or 2');
  }
  if (!(BLACKJACK.dealMs >= 500 && BLACKJACK.dealerMs >= 500)) problems.push('BLACKJACK.dealMs and dealerMs must be at least 500 (Discord limits message edits)');
  if (!(Number.isInteger(BLACKJACK.decks) && BLACKJACK.decks >= 1 && BLACKJACK.decks <= 8)) problems.push('BLACKJACK.decks must be a whole number from 1 to 8');
  if (!(Number.isInteger(BLACKJACK.maxSeats) && BLACKJACK.maxSeats >= 1 && BLACKJACK.maxSeats <= 6)) {
    problems.push('BLACKJACK.maxSeats must be a whole number from 1 to 6 (the table picture has room for 6)');
  }
  if (!(BLACKJACK.buttonsIdleMs >= 5000 && BLACKJACK.modalMs >= 5000)) problems.push('BLACKJACK.buttonsIdleMs and modalMs must be at least 5000');
  if (!(BLACKJACK.heartbeatMs >= 1000 && BLACKJACK.leaseMs >= 2 * BLACKJACK.heartbeatMs)) {
    problems.push('BLACKJACK.leaseMs must be at least twice BLACKJACK.heartbeatMs (and heartbeatMs at least 1000), or a live table could be mistaken for a dead one');
  }
  if (!(BLACKJACK.sweepMs >= 5000)) problems.push('BLACKJACK.sweepMs must be at least 5000');
  if (!(Number.isInteger(AVATAR.size) && AVATAR.size >= 16 && AVATAR.size <= 4096 && (AVATAR.size & (AVATAR.size - 1)) === 0)) {
    problems.push('AVATAR.size must be a power of two from 16 to 4096 (Discord only serves those sizes)');
  }
  if (!(AVATAR.timeoutMs >= 500 && AVATAR.maxBytes >= 1000 && Number.isInteger(AVATAR.cacheMax) && AVATAR.cacheMax >= 1)) {
    problems.push('AVATAR.timeoutMs must be at least 500, maxBytes at least 1000 and cacheMax a whole number of at least 1');
  }
  if (!(EVENTS.tickMs >= 10_000)) problems.push('EVENTS.tickMs must be at least 10000');
  if (!(EVENTS.staleMs > EVENTS.tickMs)) problems.push('EVENTS.staleMs must be longer than EVENTS.tickMs');
  if (!(CRATE.refreshMs >= 1000)) problems.push('CRATE.refreshMs must be at least 1000 (Discord limits message edits)');
  if (!(Number.isInteger(CRATE.listMax) && CRATE.listMax >= 1 && CRATE.listMax <= 50)) problems.push('CRATE.listMax must be a whole number from 1 to 50');
  for (const [name, game] of [
    ['HEIST', HEIST],
    ['SPLIT_STEAL', SPLIT_STEAL],
    ['CODE', { refreshMs: CODE.refreshMs, listMax: CODE.boardMax }],
    ['RAID', RAID],
  ] as const) {
    if (!(game.refreshMs >= 1000)) problems.push(`${name}.refreshMs must be at least 1000 (Discord limits message edits)`);
    if (!(Number.isInteger(game.listMax) && game.listMax >= 1 && game.listMax <= 50)) problems.push(`${name}.listMax must be a whole number from 1 to 50`);
  }
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
    ['MAX_BLACKJACK_NATURAL', MAX_BLACKJACK_NATURAL],
    ['MAX_BLACKJACK_SECONDS', MAX_BLACKJACK_SECONDS],
    ['MAX_CRATE_SECONDS', MAX_CRATE_SECONDS],
    ['MAX_EVENT_SECONDS', MAX_EVENT_SECONDS],
    ['MAX_HEIST_ROUNDS', MAX_HEIST_ROUNDS],
    ['MAX_RAID_SECONDS', MAX_RAID_SECONDS],
    ['MAX_RAID_ROUNDS', MAX_RAID_ROUNDS],
    ['MAX_RAID_BOOST', MAX_RAID_BOOST],
    ['CODE_LENGTH', CODE_LENGTH],
    ['MAX_VAULT_MULTIPLIER', MAX_VAULT_MULTIPLIER],
    ['MAX_STONKS_HOURS', MAX_STONKS_HOURS],
    ['DATABANK_ITEMS_PER_PAGE', DATABANK_ITEMS_PER_PAGE],
    ['SETTINGS_REFRESH_MS', SETTINGS_REFRESH_MS],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) problems.push(`${name} must be a whole number of at least 1`);
  }

  if (!(Number.isInteger(RAID.logSize) && RAID.logSize >= 1 && RAID.logSize <= 25)) problems.push('RAID.logSize must be a whole number from 1 to 25');
  if (!(Number.isInteger(RAID.barWidth) && RAID.barWidth >= 1 && RAID.barWidth <= 20)) problems.push('RAID.barWidth must be a whole number from 1 to 20');
  // One row of buttons holds No boost, the presets and Custom: at most 5.
  if (RAID.boostPresets.length > 3 || RAID.boostPresets.some((p) => !Number.isInteger(p) || p < 1)) problems.push('RAID.boostPresets must be up to 3 whole numbers of at least 1');
  if (!(RAID_COMBAT.attack.min >= 1 && RAID_COMBAT.attack.min <= RAID_COMBAT.attack.max)) problems.push('RAID_COMBAT.attack needs 1 <= min <= max');
  for (const [name, emoji] of Object.entries(RAID_EMOJI)) {
    if (!/^<a?:\w{2,32}:\d{17,20}>$/.test(emoji)) problems.push(`RAID_EMOJI.${name} must be a full custom emoji code, like <:name:123456789012345678>`);
  }
  const { cc } = RAID_COMBAT;
  if (!(Number.isInteger(cc.rounds) && cc.rounds >= 1)) problems.push('RAID_COMBAT.cc.rounds must be a whole number of at least 1');
  if (cc.cooldown.length !== RAID_COMBAT.enrage.multipliers.length || cc.targets.length !== RAID_COMBAT.enrage.multipliers.length) {
    problems.push('RAID_COMBAT.cc needs one cooldown and one target count per enrage level (thresholds + 1)');
  }
  if ([...cc.cooldown, ...cc.targets].some((n) => !(Number.isInteger(n) && n >= 1))) problems.push('RAID_COMBAT.cc cooldowns and target counts must be whole numbers of at least 1');
  if (!(RAID_COMBAT.moves.hoard.min >= 0 && RAID_COMBAT.moves.hoard.min <= RAID_COMBAT.moves.hoard.max)) problems.push('RAID_COMBAT.moves.hoard needs 0 <= min <= max');
  if (!(RAID_COMBAT.moves.sweep.minTargets >= 1 && RAID_COMBAT.moves.sweep.minTargets <= RAID_COMBAT.moves.sweep.maxTargets)) {
    problems.push('RAID_COMBAT.moves.sweep needs 1 <= minTargets <= maxTargets');
  }
  const enrage = RAID_COMBAT.enrage;
  if (enrage.multipliers.length !== enrage.thresholds.length + 1 || RAID_COMBAT.weights.length !== enrage.multipliers.length) {
    problems.push('RAID_COMBAT needs one enrage multiplier and one set of move weights per enrage level (thresholds + 1)');
  }
  for (const [level, weights] of RAID_COMBAT.weights.entries()) {
    const values = Object.values(weights);
    if (values.some((w) => !(w >= 0)) || values.filter((w) => w > 0).length < 2) problems.push(`RAID_COMBAT.weights[${level}] needs at least two moves above 0 and none below`);
  }

  if (!(CODE_LENGTH >= 1 && CODE_LENGTH <= 10)) problems.push('CODE_LENGTH must be from 1 to 10 (the pop-up box and the board have to fit it)');
  if (!(CODE.modalMs >= 10_000 && CODE.modalMs <= 900_000)) problems.push('CODE.modalMs must be from 10000 to 900000 (Discord drops a pop-up after 15 minutes)');

  if (problems.length > 0) throw new Error(`Invalid constants (src/constants/): ${problems.join('; ')}`);
}
