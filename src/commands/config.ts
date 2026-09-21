import { CONFIG, isAdmin, STARS } from '../config.js';
import { TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { EFFECT_IDS } from '../data/effects.js';
import { findSpec, formatValue, getPath, SPECS, type SettingSpec } from '../lib/settings-spec.js';
import { changeSetting, getPrefix, isPrefixFromEnv, resetSetting } from '../services/settings.js';
import type { Command } from '../discord/types.js';

const GROUPS: SettingSpec['group'][] = ['General', 'Claim', 'Gacha', 'Sell', 'Rob', 'Plinko', 'Events', 'Equipment'];

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

/** The lines for one group of the list. Equipment shows one line per effect with all three tiers. */
function groupLines(group: SettingSpec['group']): string[] {
  if (group === 'Equipment') {
    return EFFECT_IDS.map((id) => {
      const tiers = STARS.map((stars) => {
        const spec = findSpec(`equipment.${id}.${stars}`) as SettingSpec;
        return describeValue(spec);
      });
      return TEXT.config.equipmentSetting(id, STARS.join('|'), tiers.join(' / '));
    });
  }
  return SPECS.filter((spec) => spec.group === group).map((spec) => TEXT.config.setting(spec.key, describeValue(spec)));
}

export const config: Command = {
  name: 'config',
  aliases: ['settings'],
  description: 'See the bot settings. Only the bot admin can change them.',
  usage: 'config [set <setting> <value> | reset <setting>]',
  slashUsage: 'config list | set | reset',

  async execute(ctx) {
    const { args } = ctx;
    const p = ctx.prefix;
    const action = args[0]?.toLowerCase();

    if (action === undefined || action === 'list' || action === 'view') {
      const embed = createEmbed()
        .setTitle(TEXT.config.title)
        .setFooter({
          text: isAdmin(ctx.user.id) ? TEXT.config.footerAdmin(p) : TEXT.config.footerOthers,
        });
      for (const group of GROUPS) {
        embed.addFields({
          name: group === 'Equipment' ? TEXT.config.equipmentGroup(STARS.map((stars) => `${stars}-star`).join(' / ')) : group,
          value: groupLines(group).join('\n'),
        });
      }
      await ctx.reply({ embeds: [embed] });
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
