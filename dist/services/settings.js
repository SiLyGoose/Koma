import { CONFIG, DEFAULTS, isAdmin, STARS } from '../config.js';
import { TEXT } from '../constants/index.js';
import { collections } from '../db.js';
import { checkConstraints, findEquipmentEffectId, findSpec, formatValue, getPath, parseInput, setPath, SPECS, specsUnder, validateValue, } from '../lib/settings-spec.js';
/*
 * All the bot's settings live in one MongoDB document (settings collection, _id "global").
 * At startup any missing setting is filled in from DEFAULTS, then the document is loaded into
 * CONFIG, which the rest of the code reads. The bot re-reads the document periodically, so
 * edits made directly in MongoDB take effect without a restart. Changes made with the config
 * command apply immediately.
 */
const SETTINGS_ID = 'global';
export const DEFAULT_PREFIX = DEFAULTS.prefix;
/**
 * Set when the bot runs with ENV=LOCAL: the prefix then comes from .env (see
 * lib/prefix-source.ts) and the `prefix` setting in MongoDB is ignored. Null means the prefix
 * is read from MongoDB like every other setting.
 */
let envPrefix = null;
export function setEnvPrefix(prefix) {
    envPrefix = prefix;
}
/** True when the prefix comes from .env instead of MongoDB. */
export function isPrefixFromEnv() {
    return envPrefix !== null;
}
export function getPrefix() {
    return envPrefix ?? CONFIG.prefix;
}
let lastWarning = '';
function warn(message) {
    // The refresh runs every minute, so only log when the problem changes.
    if (message !== lastWarning)
        console.warn(message);
    lastWarning = message;
}
/** Fills in any setting missing from the database with its default, then loads everything. */
export async function loadSettings() {
    const { settings } = collections();
    const doc = await settings.findOne({ _id: SETTINGS_ID });
    const missing = {};
    for (const spec of SPECS) {
        if (getPath(doc, spec.key) === undefined)
            missing[spec.key] = getPath(DEFAULTS, spec.key);
    }
    if (Object.keys(missing).length > 0) {
        try {
            await settings.updateOne({ _id: SETTINGS_ID }, { $set: missing }, { upsert: true });
        }
        catch (err) {
            // Another instance may have created the document at the same moment.
            if (err.code !== 11000) {
                console.warn('Could not write default settings to the database:', err);
            }
        }
    }
    await refreshSettings();
}
/**
 * Re-reads the settings document into CONFIG. Anything missing or invalid is ignored, and if
 * the values are inconsistent together the whole update is skipped, so a typo in the database
 * can never break the bot: it keeps running on the last good values.
 */
export async function refreshSettings() {
    const doc = await collections().settings.findOne({ _id: SETTINGS_ID });
    if (!doc)
        return;
    const next = structuredClone(CONFIG);
    const problems = [];
    for (const spec of SPECS) {
        const stored = getPath(doc, spec.key);
        if (stored === undefined)
            continue;
        const problem = validateValue(spec, stored);
        if (problem) {
            problems.push(`${spec.key} ${problem} (got ${JSON.stringify(stored)})`);
        }
        else {
            setPath(next, spec.key, stored);
        }
    }
    const cross = checkConstraints(next);
    if (cross) {
        warn(`Ignoring settings from the database: ${cross}. Keeping the last good values.`);
        return;
    }
    if (problems.length > 0) {
        warn(`Ignoring invalid settings in the database: ${problems.join('; ')}`);
    }
    else {
        lastWarning = '';
    }
    for (const spec of SPECS)
        setPath(CONFIG, spec.key, getPath(next, spec.key));
}
const FORBIDDEN = { ok: false, reason: 'forbidden', error: TEXT.config.adminOnly };
const PREFIX_FROM_ENV = { ok: false, reason: 'invalid', error: TEXT.config.prefixFromEnv };
function unknownSetting(key) {
    return { ok: false, reason: 'unknown_setting', error: TEXT.config.unknownSetting(key) };
}
async function applyChange(spec, value) {
    const candidate = structuredClone(CONFIG);
    setPath(candidate, spec.key, value);
    const problem = checkConstraints(candidate);
    if (problem)
        return { ok: false, reason: 'invalid', error: TEXT.config.breaksRule(problem) };
    const oldValue = getPath(CONFIG, spec.key);
    await collections().settings.updateOne({ _id: SETTINGS_ID }, { $set: { [spec.key]: value } }, { upsert: true });
    setPath(CONFIG, spec.key, value);
    return { ok: true, key: spec.key, oldValue: formatValue(spec, oldValue), newValue: formatValue(spec, value) };
}
/** Sets one setting. Only the admin may do this; the check lives here so no caller can skip it. */
export async function changeSetting(actorId, key, rawValue) {
    if (!isAdmin(actorId))
        return FORBIDDEN;
    const spec = findSpec(key);
    if (!spec)
        return unknownSetting(key);
    if (spec.key === 'prefix' && isPrefixFromEnv())
        return PREFIX_FROM_ENV;
    const parsed = parseInput(spec, rawValue);
    if (!parsed.ok)
        return { ok: false, reason: 'invalid', error: TEXT.config.invalidValue(spec.key, parsed.error) };
    return applyChange(spec, parsed.value);
}
/**
 * Sets several settings at once, from text as the config command takes it (`changes`: setting -> value): the site's
 * admin page saves everything changed on it in one go. Each value is checked, then the rules once, on all of them
 * changed (one at a time, raising claim.min past the old claim.max would fail even with claim.max raised too), and
 * they're saved in one write; or, if anything is wrong, none of them, with every problem found. Only the admin may do this.
 */
export async function changeSettings(actorId, changes) {
    if (!isAdmin(actorId))
        return { ok: false, reason: 'forbidden' };
    const problems = [];
    const parsed = [];
    for (const [key, raw] of Object.entries(changes)) {
        const spec = findSpec(key);
        if (!spec)
            problems.push({ key, error: TEXT.config.unknownSetting(key) });
        else if (spec.key === 'prefix' && isPrefixFromEnv())
            problems.push({ key: spec.key, error: TEXT.config.prefixFromEnv });
        else {
            const result = parseInput(spec, raw);
            if (result.ok)
                parsed.push({ spec, value: result.value });
            else
                problems.push({ key: spec.key, error: TEXT.config.invalidValue(spec.key, result.error) });
        }
    }
    if (problems.length > 0)
        return { ok: false, reason: 'invalid', problems };
    const candidate = structuredClone(CONFIG);
    for (const { spec, value } of parsed)
        setPath(candidate, spec.key, value);
    const rule = checkConstraints(candidate);
    if (rule)
        return { ok: false, reason: 'invalid', problems: [{ key: null, error: TEXT.config.breaksRule(rule) }] };
    const results = parsed.map(({ spec, value }) => ({ key: spec.key, oldValue: formatValue(spec, getPath(CONFIG, spec.key)), newValue: formatValue(spec, value) }));
    if (parsed.length > 0) {
        await collections().settings.updateOne({ _id: SETTINGS_ID }, { $set: Object.fromEntries(parsed.map(({ spec, value }) => [spec.key, value])) }, { upsert: true });
    }
    for (const { spec, value } of parsed)
        setPath(CONFIG, spec.key, value);
    return { ok: true, results };
}
/** Puts one setting back to its default. Only the admin may do this. */
export async function resetSetting(actorId, key) {
    if (!isAdmin(actorId))
        return FORBIDDEN;
    const spec = findSpec(key);
    if (!spec)
        return unknownSetting(key);
    if (spec.key === 'prefix' && isPrefixFromEnv())
        return PREFIX_FROM_ENV;
    return applyChange(spec, getPath(DEFAULTS, spec.key));
}
/**
 * Puts every setting under `prefix` back to its default in one go (`refine.cost`, `refine.cost.2`,
 * `raid`: see specsUnder), so the admin doesn't have to reset them one at a time. They're changed
 * together: the rules are checked once, on all of them at their defaults (one at a time, a rule tying
 * two of them together could fail half way), and saved in one write. Only the admin may do this.
 */
export async function resetSettingsUnder(actorId, prefix) {
    if (!isAdmin(actorId))
        return FORBIDDEN;
    // The prefix, when it's set by the environment, stays as it is.
    const specs = specsUnder(prefix).filter((spec) => !(spec.key === 'prefix' && isPrefixFromEnv()));
    if (specs.length === 0)
        return unknownSetting(prefix);
    const candidate = structuredClone(CONFIG);
    for (const spec of specs)
        setPath(candidate, spec.key, getPath(DEFAULTS, spec.key));
    const problem = checkConstraints(candidate);
    if (problem)
        return { ok: false, reason: 'invalid', error: TEXT.config.breaksRule(problem) };
    const results = specs.map((spec) => ({ key: spec.key, oldValue: formatValue(spec, getPath(CONFIG, spec.key)), newValue: formatValue(spec, getPath(DEFAULTS, spec.key)) }));
    await collections().settings.updateOne({ _id: SETTINGS_ID }, { $set: Object.fromEntries(specs.map((spec) => [spec.key, getPath(DEFAULTS, spec.key)])) }, { upsert: true });
    for (const spec of specs)
        setPath(CONFIG, spec.key, getPath(DEFAULTS, spec.key));
    return { ok: true, key: prefix.trim().replace(/\.+$/, ''), results };
}
/**
 * Puts every star tier of one equipment effect back to its default in one go, so the admin does not
 * have to reset `equipment.<effect>.1` through `.4` one at a time. Only the admin may do this.
 */
export async function resetEquipmentEffect(actorId, effectId) {
    if (!isAdmin(actorId))
        return FORBIDDEN;
    const id = findEquipmentEffectId(`equipment.${effectId}`);
    if (!id)
        return unknownSetting(`equipment.${effectId}`);
    const results = [];
    for (const stars of STARS) {
        const spec = findSpec(`equipment.${id}.${stars}`);
        const result = await applyChange(spec, getPath(DEFAULTS, spec.key));
        if (!result.ok)
            return result;
        results.push({ key: result.key, oldValue: result.oldValue, newValue: result.newValue });
    }
    return { ok: true, key: `equipment.${id}`, results };
}
//# sourceMappingURL=settings.js.map