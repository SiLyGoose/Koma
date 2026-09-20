import { CONFIG, DEFAULTS, isAdmin } from '../config.js';
import { TEXT } from '../constants.js';
import { collections } from '../db.js';
import {
  checkConstraints,
  findSpec,
  formatValue,
  getPath,
  parseInput,
  setPath,
  SPECS,
  validateValue,
  type SettingSpec,
} from '../lib/settings-spec.js';

/*
 * All the bot's settings live in one MongoDB document (settings collection, _id "global").
 * At startup any missing setting is filled in from DEFAULTS, then the document is loaded into
 * CONFIG, which the rest of the code reads. The bot re-reads the document periodically, so
 * edits made directly in MongoDB take effect without a restart. Changes made with the config
 * command apply immediately.
 */

const SETTINGS_ID = 'global';
export const DEFAULT_PREFIX = DEFAULTS.prefix;

export function getPrefix(): string {
  return CONFIG.prefix;
}

let lastWarning = '';
function warn(message: string): void {
  // The refresh runs every minute, so only log when the problem changes.
  if (message !== lastWarning) console.warn(message);
  lastWarning = message;
}

/** Fills in any setting missing from the database with its default, then loads everything. */
export async function loadSettings(): Promise<void> {
  const { settings } = collections();
  const doc = await settings.findOne({ _id: SETTINGS_ID });

  const missing: Record<string, unknown> = {};
  for (const spec of SPECS) {
    if (getPath(doc, spec.key) === undefined) missing[spec.key] = getPath(DEFAULTS, spec.key);
  }

  if (Object.keys(missing).length > 0) {
    try {
      await settings.updateOne({ _id: SETTINGS_ID }, { $set: missing }, { upsert: true });
    } catch (err) {
      // Another instance may have created the document at the same moment.
      if ((err as { code?: unknown }).code !== 11000) {
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
export async function refreshSettings(): Promise<void> {
  const doc = await collections().settings.findOne({ _id: SETTINGS_ID });
  if (!doc) return;

  const next = structuredClone(CONFIG);
  const problems: string[] = [];
  for (const spec of SPECS) {
    const stored = getPath(doc, spec.key);
    if (stored === undefined) continue;
    const problem = validateValue(spec, stored);
    if (problem) {
      problems.push(`${spec.key} ${problem} (got ${JSON.stringify(stored)})`);
    } else {
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
  } else {
    lastWarning = '';
  }

  for (const spec of SPECS) setPath(CONFIG, spec.key, getPath(next, spec.key));
}

// ---------------------------------------------------------------------------
// Changing settings (admin only)
// ---------------------------------------------------------------------------

export type ChangeResult =
  | { ok: true; key: string; oldValue: string; newValue: string }
  | { ok: false; reason: 'forbidden' | 'unknown_setting' | 'invalid'; error: string };

const FORBIDDEN: ChangeResult = { ok: false, reason: 'forbidden', error: TEXT.config.adminOnly };

function unknownSetting(key: string): ChangeResult {
  return { ok: false, reason: 'unknown_setting', error: TEXT.config.unknownSetting(key) };
}

async function applyChange(spec: SettingSpec, value: string | number): Promise<ChangeResult> {
  const candidate = structuredClone(CONFIG);
  setPath(candidate, spec.key, value);
  const problem = checkConstraints(candidate);
  if (problem) return { ok: false, reason: 'invalid', error: TEXT.config.breaksRule(problem) };

  const oldValue = getPath(CONFIG, spec.key);
  await collections().settings.updateOne({ _id: SETTINGS_ID }, { $set: { [spec.key]: value } }, { upsert: true });
  setPath(CONFIG, spec.key, value);

  return { ok: true, key: spec.key, oldValue: formatValue(spec, oldValue), newValue: formatValue(spec, value) };
}

/** Sets one setting. Only the admin may do this; the check lives here so no caller can skip it. */
export async function changeSetting(actorId: string, key: string, rawValue: string): Promise<ChangeResult> {
  if (!isAdmin(actorId)) return FORBIDDEN;
  const spec = findSpec(key);
  if (!spec) return unknownSetting(key);

  const parsed = parseInput(spec, rawValue);
  if (!parsed.ok) return { ok: false, reason: 'invalid', error: TEXT.config.invalidValue(spec.key, parsed.error) };
  return applyChange(spec, parsed.value);
}

/** Puts one setting back to its default. Only the admin may do this. */
export async function resetSetting(actorId: string, key: string): Promise<ChangeResult> {
  if (!isAdmin(actorId)) return FORBIDDEN;
  const spec = findSpec(key);
  if (!spec) return unknownSetting(key);
  return applyChange(spec, getPath(DEFAULTS, spec.key) as string | number);
}
