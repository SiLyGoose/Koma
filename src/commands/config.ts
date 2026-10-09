import { CONFIG, isAdmin, STARS } from '../config.js';
import { CONFIG_BUTTONS, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { EFFECT_IDS } from '../perks/index.js';
import { buildConfigPages, type ConfigGroup } from '../lib/config-page.js';
import { checkEventChannel, type ChannelProblem } from '../events/channel.js';
import { parseChannelArg } from '../lib/parse.js';
import { findEquipmentEffectId, findSpec, formatValue, getPath, SPECS, specsUnder, type SettingSpec } from '../lib/settings-spec.js';
import { changeSetting, getPrefix, isPrefixFromEnv, resetEquipmentEffect, resetSetting, resetSettingsUnder } from '../services/settings.js';
import { getChannelId, setChannelId } from '../services/channel.js';
import { getNewsletterChannelId, setNewsletterChannelId } from '../services/newsletter.js';
import { raidWeek } from '../lib/events/raid-week.js';
import { paginate } from '../discord/paginate.js';
import type { Command, CommandContext } from '../discord/types.js';

// 'Stonks' was added as a settings-spec group (stonks.capHours) without ever being added here,
// so it silently never showed up in `config list` -- fixed by listing it in the same spot it sits
// in the SettingSpec['group'] union, right after 'Events' and before 'Equipment'.
export const GROUPS: SettingSpec['group'][] = ['General', 'Claim', 'Gacha', 'Sell', 'Rob', 'Plinko', 'Blackjack', 'Baccarat', 'Roulette', 'Poker', 'Mines', 'Pinecraft', 'Events', 'Raid', 'Refine', 'Outfit', 'Skip', 'Stonks', 'Wheel', 'Equipment'];

/**
 * The per-server channel settings: `channel` (the one channel commands and events are confined to,
 * services/channel.ts) and `newsletter` (where the newsletter goes, services/newsletter.ts). They
 * aren't SettingSpec entries (each server has its own, in its `guilds` document, not the one global
 * settings document), but they're listed, set and reset like every other setting.
 */
export const PER_SERVER_CHANNELS = ['channel', 'newsletter'] as const;
type ChannelKey = (typeof PER_SERVER_CHANNELS)[number];

const isChannelKey = (key: string): key is ChannelKey => (PER_SERVER_CHANNELS as readonly string[]).includes(key);

/** Where each per-server channel setting is read and written. Only the bot admin can write them (checked in the services). */
const CHANNEL_STORE: Record<ChannelKey, { get(guildId: string): Promise<string | null>; set(actorId: string, guildId: string, channelId: string | null): Promise<{ ok: boolean }> }> = {
  channel: { get: getChannelId, set: setChannelId },
  // A newsletter channel chosen now gets its first weekly digest at the next reset.
  newsletter: { get: getNewsletterChannelId, set: (actorId, guildId, channelId) => setNewsletterChannelId(actorId, guildId, channelId, raidWeek()) },
};

/** Why a channel can't be used, in words. */
function channelProblemText(problem: ChannelProblem, channelId: string): string {
  if (problem === 'missing') return TEXT.config.channelMissing;
  if (problem === 'not_text') return TEXT.config.channelNotText;
  return TEXT.config.channelNoPermission(`<#${channelId}>`);
}

/**
 * Handles `config set <channel setting> <value>` / `config reset <channel setting>` (`channel` or
 * `newsletter`, see PER_SERVER_CHANNELS): validates and stores the channel, then replies with the
 * same "changed"/"reset" wording every other setting uses, so it reads like just another config
 * change even though it's stored separately (one value per server, not the single global settings document).
 */
async function handleChannelChange(ctx: CommandContext, key: ChannelKey, action: 'set' | 'reset', rawValue: string): Promise<void> {
  const store = CHANNEL_STORE[key];
  const before = await store.get(ctx.guildId);
  const beforeDisplay = before === null ? TEXT.config.channelNone : `<#${before}>`;

  const apply = async (newId: string | null, newDisplay: string): Promise<void> => {
    const result = await store.set(ctx.user.id, ctx.guildId, newId);
    if (!result.ok) {
      await ctx.reply(TEXT.config.adminOnly);
      return;
    }
    await ctx.reply((action === 'reset' ? TEXT.config.reset : TEXT.config.changed)(key, beforeDisplay, newDisplay));
  };

  if (action === 'reset') {
    await apply(null, TEXT.config.channelNone);
    return;
  }

  if (!rawValue) {
    await ctx.reply(TEXT.config.askValue(ctx.prefix, key));
    return;
  }
  if (['off', 'none', 'disable'].includes(rawValue.toLowerCase())) {
    await apply(null, TEXT.config.channelNone);
    return;
  }

  const channelId = parseChannelArg(rawValue);
  if (channelId === null) {
    await ctx.reply(TEXT.config.invalidValue(key, TEXT.config.channelInvalid));
    return;
  }
  const checked = await checkEventChannel(ctx.guild, channelId);
  if (!checked.ok) {
    await ctx.reply(channelProblemText(checked.problem, channelId));
    return;
  }
  await apply(channelId, `<#${channelId}>`);
}

function describeValue(spec: SettingSpec): string {
  const value = getPath(CONFIG, spec.key);
  const shown = formatValue(spec, value);

  // With ENV=LOCAL the prefix in use is the one from .env, not the one stored in MongoDB.
  if (spec.key === 'prefix' && isPrefixFromEnv()) return TEXT.config.prefixFromEnvValue(getPrefix());

  // Show each star weight as the chance it actually works out to.
  if (spec.key.startsWith('gacha.starWeights.') && typeof value === 'number') {
    const total = STARS.reduce((sum, stars) => sum + CONFIG.gacha.starWeights[stars], 0);
    if (total > 0) return TEXT.config.starShare(shown, Number(((value / total) * 100).toFixed(1)));
  }
  return shown;
}

/**
 * The lines for one group of the list. Equipment shows one line per effect with all three tiers.
 * General also shows the per-server channel settings (`channel` and `newsletter`), which aren't real
 * SettingSpec entries -- they live in the `guilds` collection, one value per server, not the single
 * global settings document every other setting here comes from (see PER_SERVER_CHANNELS).
 */
function groupLines(group: SettingSpec['group'], channels: Record<ChannelKey, string | null>): string[] {
  if (group === 'Equipment') {
    // The Equipment settings that aren't per-effect (like equipment.borrowed.effectiveness), then one line per effect.
    const perEffect = new Set(EFFECT_IDS.flatMap((id) => STARS.map((stars) => `equipment.${id}.${stars}`)));
    const others = SPECS.filter((spec) => spec.group === group && !perEffect.has(spec.key));
    const general = others.map((spec) => TEXT.config.setting(spec.key, describeValue(spec)));
    return [...general, ...EFFECT_IDS.map((id) => {
      const tiers = STARS.map((stars) => {
        const spec = findSpec(`equipment.${id}.${stars}`) as SettingSpec;
        return describeValue(spec);
      });
      return TEXT.config.equipmentSetting(id, STARS.join('|'), tiers.join(' / '));
    })];
  }
  const lines = SPECS.filter((spec) => spec.group === group).map((spec) => TEXT.config.setting(spec.key, describeValue(spec)));
  if (group === 'General') {
    for (const key of PER_SERVER_CHANNELS) {
      const id = channels[key];
      lines.push(TEXT.config.setting(key, id === null ? TEXT.config.channelNone : `<#${id}>`));
    }
  }
  return lines;
}

export const config: Command = {
  name: 'config',
  category: 'bot',
  aliases: ['settings'],
  description: 'See the bot settings. Only the bot admin can change them.',
  usage: 'config [list | <group> | set <setting> <value> | reset <setting> | reset <start of settings>]',
  slashUsage: 'config list [group] | set | reset',

  async execute(ctx) {
    const { args } = ctx;
    const p = ctx.prefix;
    const action = args[0]?.toLowerCase();

    // "config <group>" (e.g. "config plinko") jumps straight to that group's page instead of
    // opening the book on page one. Matched case-insensitively against the group names below,
    // plus "channel" as a shortcut straight to General (where that setting lives); anything else
    // that isn't list/view/set/reset falls through to the unknown-action reply.
    const jumpGroup =
      action === undefined ? undefined : (GROUPS.find((group) => group.toLowerCase() === action) ?? (isChannelKey(action) ? 'General' : undefined));

    if (action === undefined || action === 'list' || action === 'view' || jumpGroup !== undefined) {
      // Everything else in this list comes straight from the in-memory CONFIG, so a database
      // hiccup here shouldn't take the whole listing down over one extra per-server field --
      // it just shows the channels as unset until the next successful read.
      const [channel, newsletter] = await Promise.all(PER_SERVER_CHANNELS.map((key) => CHANNEL_STORE[key].get(ctx.guildId).catch(() => null)));
      const channels = { channel: channel ?? null, newsletter: newsletter ?? null };
      const groups: ConfigGroup[] = GROUPS.map((group) => ({
        name: group === 'Equipment' ? TEXT.config.equipmentGroup(STARS.map((stars) => `${stars}-star`).join(' / ')) : group,
        lines: groupLines(group, channels),
      }));
      const pages = buildConfigPages(groups);
      const footerText = isAdmin(ctx.user.id) ? TEXT.config.footerAdmin(p) : TEXT.config.footerOthers;

      // A named group's page is found by its formatted display name: either the bare-named page
      // it got if it fit on one, or the first of its numbered sub-pages if it didn't (Equipment
      // is the only group currently big enough to split).
      let startIndex = 0;
      if (jumpGroup !== undefined) {
        const jumpName = groups[GROUPS.indexOf(jumpGroup)]!.name;
        const found = pages.findIndex((page) => page[0]?.name === jumpName || page[0]?.name.startsWith(`${jumpName} — page 1/`));
        if (found >= 0) startIndex = found;
      }

      // Usually one page. A long settings list becomes a book: Previous/Next buttons flip
      // between pages on the same message instead of one giant embed (which is how this broke
      // Discord's per-field/embed limits in the first place).
      const render = (index: number) => {
        const embed = createEmbed()
          .setTitle(pages.length > 1 ? TEXT.config.titlePage(TEXT.config.title, index + 1, pages.length) : TEXT.config.title)
          .addFields(pages[index] ?? []);
        if (index === pages.length - 1) embed.setFooter({ text: footerText });
        return { embeds: [embed] };
      };
      await paginate(
        ctx,
        pages.length,
        render,
        ctx.user.id,
        { previous: TEXT.config.previousButton, next: TEXT.config.nextButton, notYours: TEXT.config.notYours },
        CONFIG_BUTTONS.idleMs,
        startIndex,
      );
      return;
    }

    if (action !== 'set' && action !== 'reset') {
      await ctx.reply(TEXT.config.unknownAction(p));
      return;
    }

    // Everything below changes something, so it is admin only.
    if (!isAdmin(ctx.user.id)) {
      await ctx.reply(TEXT.config.adminOnly);
      return;
    }

    const key = args[1];
    if (!key) {
      await ctx.reply(action === 'set' ? TEXT.config.usageSet(p) : TEXT.config.usageReset(p));
      return;
    }

    // "config reset equipment.<effect>" (no star tier) resets all star tiers of that effect at once,
    // instead of doing equipment.<effect>.1 through .4 one at a time. A single tier can still be reset
    // on its own with the usual equipment.<effect>.<stars> key.
    if (action === 'reset') {
      const effectId = findEquipmentEffectId(key);
      if (effectId) {
        const result = await resetEquipmentEffect(ctx.user.id, effectId);
        if (!result.ok) {
          await ctx.reply(result.error);
          return;
        }
        await ctx.reply(TEXT.config.resetEquipment(result.key, result.results));
        return;
      }
    }

    // `channel` and `newsletter` aren't real SettingSpec entries -- they're per-server (see
    // PER_SERVER_CHANNELS), not the bot's global settings -- but they're set and reset the same way.
    const channelKey = key.toLowerCase();
    if (isChannelKey(channelKey)) {
      await handleChannelChange(ctx, channelKey, action, args.slice(2).join(' '));
      return;
    }

    // "config reset refine.cost" (not a setting, but the start of some): every setting under it, in one go.
    if (action === 'reset' && !findSpec(key) && specsUnder(key).length > 0) {
      const result = await resetSettingsUnder(ctx.user.id, key);
      if (!result.ok) {
        await ctx.reply(result.error);
        return;
      }
      await ctx.reply(TEXT.config.resetMany(result.key, result.results));
      return;
    }

    if (!findSpec(key)) {
      await ctx.reply(TEXT.config.noSuchSetting(p, key));
      return;
    }

    let result;
    if (action === 'set') {
      const value = args.slice(2).join(' ');
      if (!value) {
        await ctx.reply(TEXT.config.askValue(p, key));
        return;
      }
      result = await changeSetting(ctx.user.id, key, value);
    } else {
      result = await resetSetting(ctx.user.id, key);
    }

    if (!result.ok) {
      await ctx.reply(result.error);
      return;
    }
    await ctx.reply((action === 'reset' ? TEXT.config.reset : TEXT.config.changed)(result.key, result.oldValue, result.newValue),
    );
  },
};
