import { CONFIG, DEFAULTS } from '../../config.js';
import { CURRENCY_EMOJI, TEXT } from '../../constants/index.js';
import { formatValue, getPath, GROUPS, SPECS, type SettingSpec } from '../../lib/settings-spec.js';
import { changeSettings, isPrefixFromEnv, type ManyChangeResult } from '../../services/settings.js';
import type { SettingsSaved, SettingsView, SettingView } from '../../protocol/admin.js';
import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';

/* The site's admin page: the bot's settings (the live CONFIG), and changing them as the config command does (services/settings.ts). */

/** Changing the settings (services/settings.ts's, unless a test says otherwise). Each checks it's the admin asking itself. */
export interface SettingsStore {
  change: (actorId: string, changes: Readonly<Record<string, string>>) => Promise<ManyChangeResult>;
  /** Whether the prefix comes from the bot's .env rather than the settings (ENV=LOCAL). */
  prefixFromEnv: () => boolean;
}

export const settingsStore: SettingsStore = { change: changeSettings, prefixFromEnv: isPrefixFromEnv };

/** The descriptions are written for Discord: its points emoji, in words here (a capital one, starting a sentence). */
function plain(text: string): string {
  const words = text.replaceAll(CURRENCY_EMOJI, 'points');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type AdminService = ReturnType<typeof adminService>;

export function adminService(deps: ApiDeps) {
  const store = deps.settings ?? settingsStore;

  function setting(spec: SettingSpec): SettingView {
    const value = getPath(CONFIG, spec.key) as number | string;
    const fallback = getPath(DEFAULTS, spec.key) as number | string;
    return {
      key: spec.key,
      group: spec.group,
      description: plain(spec.description),
      type: spec.type,
      ...(spec.min !== undefined && { min: spec.min }),
      ...(spec.max !== undefined && { max: spec.max }),
      ...(spec.percent && { percent: true }),
      ...(spec.multiplier && { multiplier: true }),
      ...(spec.expects !== undefined && { expects: spec.expects }),
      value,
      default: fallback,
      shown: formatValue(spec, value),
      defaultShown: formatValue(spec, fallback),
      ...(spec.key === 'prefix' && store.prefixFromEnv() && { locked: TEXT.config.prefixFromEnv }),
    };
  }

  const view = (): SettingsView => ({ groups: [...GROUPS], settings: SPECS.map(setting) });

  /** The settings after a change, or why it couldn't be made. */
  function answer(result: ManyChangeResult): SettingsSaved {
    if (result.ok) return { settings: view(), changed: [...result.results] };
    if (result.reason === 'forbidden') throw new ApiError('not_admin');
    throw new ApiError('invalid_setting', { problems: result.problems });
  }

  return {
    view,
    change: async (userId: string, changes: Readonly<Record<string, string>>): Promise<SettingsSaved> => answer(await store.change(userId, changes)),
  };
}
