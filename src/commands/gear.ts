import { RAID_COMBAT, REFINE, SLOT_EMOJI, SLOT_LABELS, TEXT } from '../constants/index.js';
import { CONFIG } from '../config.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import {
  attackMultiplierOf,
  critChanceOf,
  critMultiplierOf,
  emptyGear,
  guardCutOf,
  guardTakenShare,
  healMultiplierOf,
  playerMaxHp,
  rallyMultiplierOf,
  raidGearFrom,
  type RaidGear,
} from '../lib/events/raid.js';
import { canUseItem, describeEffects, describeTotals, equippedGear, itemEffectiveness, showsMasterwork, totalEffects } from '../lib/game/items/equipment.js';
import { formatMultiplier, formatPercent, mentionList, starString } from '../lib/format.js';
import { blightPurgeExtra } from '../perks/index.js';
import { getEquipment } from '../services/items/equipment.js';
import { SLOTS } from '../types.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

/**
 * `gear stats`: the numbers a member fights a raid with (lib/events/raid.ts), worked out with their
 * raid gear, and which of them the gear changed. `playerHp` is the raid.playerHp setting.
 */
export function raidStatsEmbed(name: string, gear: RaidGear, playerHp: number, prefix: string): BotEmbed {
  const t = TEXT.gear;
  const { attack, heal, support } = RAID_COMBAT;
  const range = (min: number, max: number): string => (min === max ? `${min}` : `${min}–${max}`);
  const base = { gear: emptyGear() };
  const geared = { gear };
  const mark = t.statsGearMark;
  /** Attack damage (a crit's, with `crit`) for `who`: the setting's range, times their attack (and crit) multiplier. */
  const damage = (who: { gear: RaidGear }, crit: boolean): string => {
    const times = attackMultiplierOf(who) * (crit ? critMultiplierOf(who) : 1);
    return range(Math.round(attack.min * times), Math.round(attack.max * times));
  };
  const hp = playerMaxHp(playerHp, geared);
  const healAmount = Math.round(heal.amount * healMultiplierOf(geared));
  const revive = Math.max(1, Math.round(hp * heal.reviveShare * healMultiplierOf(geared)));
  const critChanged = gear.raidCritChance > 0 || gear.raidCritDamage > 0 || gear.raidAttack > 0;

  const lines = [
    t.statsHp(hp, gear.raidHp > 0 ? playerHp : null, mark),
    t.statsAttack(damage(geared, false), gear.raidAttack > 0 ? damage(base, false) : null, mark),
    ...(gear.maxHpDamage > 0 ? [t.statsMaxHpDamage(formatPercent(gear.maxHpDamage), mark)] : []),
    t.statsCrit(formatPercent(critChanceOf(geared)), damage(geared, true), critChanged ? mark : ''),
    t.statsHeal(healAmount, revive, gear.raidSupport > 0 || gear.healBonus > 0 || gear.raidHp > 0 ? mark : ''),
  ];
  if (gear.healSplash > 0) lines.push(t.statsHealSplash(formatPercent(gear.healSplash), Math.max(1, Math.round(heal.amount * healMultiplierOf(geared) * gear.healSplash)), mark));
  lines.push(
    t.statsGuard(formatPercent(guardTakenShare(geared)), gear.guardBoost > 0 ? formatPercent(guardTakenShare(base)) : null, mark),
    t.statsGuardCut(formatPercent(guardCutOf(geared)), gear.guardBoost > 0 ? formatPercent(guardCutOf(base)) : null, mark),
    t.statsRally(formatMultiplier(rallyMultiplierOf(geared)), support.rallyTurns, gear.rallyBoost > 0 ? formatMultiplier(rallyMultiplierOf(base)) : null, mark),
  );
  if (gear.healCut > 0) lines.push(t.statsHealCut(formatPercent(gear.healCut), mark));
  if (gear.blightPurge > 0) lines.push(t.statsBlightPurge(blightPurgeExtra(gear.blightPurge), mark));
  const hasGear = Object.values(gear).some((value) => value > 0);
  if (!hasGear) lines.push('', t.statsNoGear(prefix));

  const embed = createEmbed().setTitle(t.statsTitle(name)).setDescription(lines.join('\n'));
  if (hasGear) embed.setFooter({ text: t.statsFooter });
  return embed;
}

export const gear: Command = {
  name: 'gear',
  category: 'gear',
  aliases: ['equipment'],
  description: 'See what you (or another member) have equipped and what it does. `gear stats` shows the raid stats that gear gives.',
  usage: 'gear [stats] [@user]',
  slashUsage: 'gear [stats] [user]',

  async execute(ctx) {
    const stats = ctx.args[0]?.toLowerCase() === 'stats';
    const args = stats ? ctx.args.slice(1) : ctx.args;
    let target = ctx.user;
    if (args[0]) {
      const resolved = await resolveUserArg(ctx, args[0]);
      if (!resolved) {
        await ctx.reply(memberNotFound(ctx, stats ? 'gear stats @user' : 'gear @user'));
        return;
      }
      target = resolved;
    }
    const isSelf = target.id === ctx.user.id;
    const equipment = await getEquipment(ctx.guildId, target.id);

    if (stats) {
      const gear = raidGearFrom(totalEffects(equippedGear(equipment), target.id));
      await ctx.reply({ embeds: [raidStatsEmbed(target.displayName, gear, CONFIG.raid.playerHp, ctx.prefix)] });
      return;
    }

    const embed = createEmbed().setTitle(TEXT.gear.title(target.displayName));
    for (const slot of SLOTS) {
      const id = equipment[slot];
      const item = id ? ITEMS_BY_ID.get(id) : undefined;
      const label = TEXT.gear.slotName(SLOT_LABELS[slot], SLOT_EMOJI[slot], equipment.locked?.[slot] === true);
      if (!item || item.slot !== slot) {
        embed.addFields({
          name: label,
          value: id
            ? TEXT.gear.unknownItem(id)
            : isSelf
              ? TEXT.gear.emptySelf(ctx.prefix)
              : TEXT.gear.emptyOther,
        });
        continue;
      }
      // Someone else's exclusive item works at part strength: show the effects they really get, and say why.
      const share = itemEffectiveness(item, target.id);
      const level = equipment.levels?.[slot] ?? REFINE.maxLevel;
      const forged = equipment.bonuses?.[slot] ?? true;
      const lines = describeEffects(item, share, level, forged);
      if (item.usableBy && !canUseItem(item, target.id)) lines.unshift(TEXT.gear.exclusive(mentionList(item.usableBy), formatPercent(share)));
      embed.addFields({
        name: label,
        value: [TEXT.gear.item(item.name, starString(item.stars), level, showsMasterwork(item, level, forged)), ...lines].join('\n'),
      });
    }

    const totals = describeTotals(totalEffects(equippedGear(equipment), target.id));
    if (totals.length > 0) embed.addBlankField().addFields({ name: TEXT.gear.totalsField, value: totals.join('\n') });

    await ctx.reply({ embeds: [embed] });
  },
};
