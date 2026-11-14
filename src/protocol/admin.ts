/* The site's admin page: the bot's settings, as GET /api/admin/settings shows them, and what changing them says. Only the bot admin is answered. */

/** One setting (the bot's lib/settings-spec.ts SettingSpec, in words the page can show). */
export interface SettingView {
  /** Its name: a dot path into the settings, like "claim.min". */
  key: string;
  /** The group it's listed under (SettingsView's `groups`). */
  group: string;
  description: string;
  /** 'int' and 'number' are numbers ('int' whole ones); 'string' is text. */
  type: 'int' | 'number' | 'string';
  /** The least and most it can be (as stored: a percentage's 0.4 is 40%). */
  min?: number;
  max?: number;
  /** Shown and typed as a percentage: 0.4 is "40%". */
  percent?: boolean;
  /** Shown and typed as a multiplier: 2.5 is "2.5x". */
  multiplier?: boolean;
  /** For text: what a good value looks like, in words. */
  expects?: string;
  /** What it is now, and its default, as stored. */
  value: number | string;
  default: number | string;
  /** Both as the bot shows them (like "40%", "2.5x" or "1,000"). */
  shown: string;
  defaultShown: string;
  /** Why it can't be changed here, if it can't (the prefix, while the bot takes it from its .env). */
  locked?: string;
}

/** GET /api/admin/settings: every setting, in the groups' order (the config command's). */
export interface SettingsView {
  groups: string[];
  settings: SettingView[];
}

/** One setting changed: its name, and what it was and is now, as the bot shows them. */
export interface SettingChange {
  key: string;
  oldValue: string;
  newValue: string;
}

/**
 * POST /api/admin/settings {changes: {setting: value}} (each value as typed into the config command: "40%", "2.5x",
 * "1,000"…): the settings as they are after it, and what changed. All or nothing: if any can't be changed, none is,
 * and it's answered 400 { error: 'invalid_setting', problems: SettingProblem[] }.
 */
export interface SettingsSaved {
  settings: SettingsView;
  changed: SettingChange[];
}

/** What's wrong with a setting given (`key`), or with them together (`key` null: a rule between settings they'd break). */
export interface SettingProblem {
  key: string | null;
  error: string;
}
