/** How many changed settings a bulk reset lists, to keep its reply to one Discord message. */
const RESET_LINES = 25;
export const configText = {
    title: 'Settings',
    /** A settings list long enough to need more than one page, like "Settings (2/3)". */
    titlePage: (title, page, pages) => `${title} (${page}/${pages})`,
    /** A group long enough to need more than one page of its own, e.g. "Rob — page 2/2". */
    groupFieldPage: (name, page, pages) => `${name} — page ${page}/${pages}`,
    previousButton: 'Previous',
    nextButton: 'Next',
    notYours: "This isn't your settings list to flip through.",
    footerAdmin: (p) => `Change one with ${p}config set <setting> <value>, or put it back with ${p}config reset <setting>.`,
    footerOthers: 'Only the bot admin can change these.',
    /** `tiers` is like "1-star / 2-star / 3-star / 4-star". */
    equipmentGroup: (tiers) => `Equipment (${tiers} items)`,
    setting: (key, value) => `\`${key}\`: **${value}**`,
    /** `tiers` is like "1|2|3|4" and `values` like "5% / 10% / 15% / 20%". */
    equipmentSetting: (effect, tiers, values) => `\`equipment.${effect}.${tiers}\`: **${values}**`,
    /** Shown after a star weight: the chance it works out to, like "(70%)". */
    starShare: (value, percent) => `${value} (${percent}%)`,
    unknownAction: (p) => `Use \`${p}config\` to see the settings, or \`${p}config set <setting> <value>\` (admin only).`,
    adminOnly: 'Only the bot admin can change settings.',
    /** Shown when someone tries to change the prefix while the bot runs with ENV=LOCAL. */
    prefixFromEnv: "This bot is running with ENV=LOCAL, so its prefix comes from the .env file and can't be changed here.",
    /** The prefix in the settings list while it comes from .env. */
    prefixFromEnvValue: (prefix) => `${prefix} (from .env)`,
    usageSet: (p) => `Usage: \`${p}config set <setting> <value>\`. See \`${p}config\` for the setting names.`,
    usageReset: (p) => `Usage: \`${p}config reset <setting>\`. See \`${p}config\` for the setting names. The start of some names resets all of them at once: \`${p}config reset refine.cost\` resets every refine cost, \`${p}config reset refine.cost.2\` only the 2-star ones.`,
    noSuchSetting: (p, key) => `There is no setting called \`${key}\`. See \`${p}config\` for the list.`,
    askValue: (p, key) => `What should \`${key}\` be set to? Usage: \`${p}config set ${key} <value>\`.`,
    changed: (key, from, to) => `Changed \`${key}\` from **${from}** to **${to}**.`,
    reset: (key, from, to) => `Reset \`${key}\` from **${from}** to **${to}**.`,
    /** `results` is one row per star tier, from resetEquipmentEffect. */
    resetEquipment: (effect, results) => `Reset every tier of \`${effect}\`:\n${results.map((r) => `Reset \`${r.key}\` from **${r.oldValue}** to **${r.newValue}**.`).join('\n')}`,
    /**
     * `results` is one row per setting under `prefix`, from resetSettingsUnder: the ones that changed
     * (at most RESET_LINES of them, to fit a message), and how many were already at their default.
     */
    resetMany: (prefix, results) => {
        const changed = results.filter((r) => r.oldValue !== r.newValue);
        const lines = changed.slice(0, RESET_LINES).map((r) => `\`${r.key}\`: **${r.oldValue}** → **${r.newValue}**`);
        if (changed.length > RESET_LINES)
            lines.push(`…and ${changed.length - RESET_LINES} more.`);
        const same = results.length - changed.length;
        const head = changed.length === 0
            ? `Every setting under \`${prefix}\` (${results.length}) was already at its default.`
            : `Reset ${changed.length} setting${changed.length === 1 ? '' : 's'} under \`${prefix}\` to the default${same > 0 ? ` (${same} already ${same === 1 ? 'was' : 'were'})` : ''}:`;
        return [head, ...lines].join('\n');
    },
    /** Errors from the settings service itself (the admin check is enforced there too). */
    unknownSetting: (key) => `There is no setting called \`${key}\`.`,
    breaksRule: (problem) => `That would break a rule: ${problem}.`,
    invalidValue: (key, problem) => `\`${key}\` ${problem}.`,
    /**
     * The `channel` setting: the one channel every command (and random events) is confined to in
     * this server. Not a real SettingSpec entry (it's per-server, not one of the bot's global
     * settings, so it can't go through the usual database), but shown in the General group and set
     * with `config set channel` / cleared with `config reset channel` just like any other setting.
     */
    channelNone: 'None',
    /** The `events` setting left unset: random events pop up in the `channel` one. */
    eventsChannelSame: 'Same as `channel`',
    channelInvalid: 'must be a channel mention or id, or "off"',
    channelMissing: "I can't find that channel in this server.",
    channelNotText: 'That is not a text channel I can send messages in. Pick a normal text channel.',
    /**
     * The `notifyRole` and `raidRole` settings: the roles this server pings for events and for raids
     * (and hands out on its role message). Per-server like the channels, and set the same way.
     */
    roleInvalid: 'must be a role mention or id, or "off"',
    roleMissing: "I can't find that role in this server.",
    channelNoPermission: (channel) => `I need to see ${channel}, send messages there and embed links. Give me those permissions there first.`,
};
//# sourceMappingURL=config.js.map