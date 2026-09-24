export const configText = {
  title: 'Settings',
  /** A settings list long enough to need more than one page, like "Settings (2/3)". */
  titlePage: (title: string, page: number, pages: number) => `${title} (${page}/${pages})`,
  /** A group long enough to need more than one page of its own, e.g. "Rob — page 2/2". */
  groupFieldPage: (name: string, page: number, pages: number) => `${name} — page ${page}/${pages}`,
  previousButton: 'Previous',
  nextButton: 'Next',
  notYours: "This isn't your settings list to flip through.",
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
  usageReset: (p: string) =>
    `Usage: \`${p}config reset <setting>\`. See \`${p}config\` for the setting names, or \`${p}config reset equipment.<effect>\` to reset every star tier of an equipment effect at once.`,
  noSuchSetting: (p: string, key: string) => `There is no setting called \`${key}\`. See \`${p}config\` for the list.`,
  askValue: (p: string, key: string) => `What should \`${key}\` be set to? Usage: \`${p}config set ${key} <value>\`.`,
  changed: (key: string, from: string, to: string) => `Changed \`${key}\` from **${from}** to **${to}**.`,
  reset: (key: string, from: string, to: string) => `Reset \`${key}\` from **${from}** to **${to}**.`,
  /** `results` is one row per star tier, from resetEquipmentEffect. */
  resetEquipment: (effect: string, results: readonly { key: string; oldValue: string; newValue: string }[]) =>
    `Reset every star tier of \`${effect}\`:\n${results.map((r) => `Reset \`${r.key}\` from **${r.oldValue}** to **${r.newValue}**.`).join('\n')}`,
  /** Errors from the settings service itself (the admin check is enforced there too). */
  unknownSetting: (key: string) => `There is no setting called \`${key}\`.`,
  breaksRule: (problem: string) => `That would break a rule: ${problem}.`,
  invalidValue: (key: string, problem: string) => `\`${key}\` ${problem}.`,
  /**
   * The `channel` setting: the one channel every command (and random events) is confined to in
   * this server. Not a real SettingSpec entry (it's per-server, not one of the bot's global
   * settings, so it can't go through the usual database), but shown in the General group and set
   * with `config set channel` / cleared with `config reset channel` just like any other setting.
   */
  channelNone: 'None',
  channelInvalid: 'must be a channel mention or id, or "off"',
  channelMissing: "I can't find that channel in this server.",
  channelNotText: 'That is not a text channel I can send messages in. Pick a normal text channel.',
  channelNoPermission: (channel: string) => `I need to see ${channel}, send messages there and embed links. Give me those permissions there first.`,
};
