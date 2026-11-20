import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { REFINE, REFINE_BUTTONS, SLOT_EMOJI, TEXT } from '../constants/index.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { describeEffects, itemEffectiveness } from '../lib/game/items/equipment.js';
import { fmt, itemStars, money } from '../lib/format.js';
import { getInventory } from '../services/economy/index.js';
import { refineItem, type RefineResult } from '../services/items/refine.js';
import { heroOnly } from '../lib/game/heroes.js';
import { tmStoneName } from '../constants/technomagic.js';
import type { ItemDef } from '../types.js';
import type { Command, CommandContext, SentReply } from '../discord/types.js';
import { followUpPrivately, replyPrivately } from '../discord/reply.js';
import { resolveItem } from '../discord/item-pick.js';

type Refined = Extract<RefineResult, { ok: true }>;

/** Why a refine didn't happen, in words. */
function refusalText(p: string, item: ItemDef, result: Exclude<RefineResult, { ok: true }>): string {
  const t = TEXT.refine;
  if (result.reason === 'busy') return t.busy;
  if (result.reason === 'not_refineable') return t.notRefineable(item.name);
  // (A hero's gear is awakened, King's Raid's: its stars.)
  const hero = heroOnly(item);
  if (result.reason === 'maxed') return t.maxed(item.name, REFINE.maxLevel, hero);
  if (result.reason === 'too_poor') return t.tooPoor(item.name, result.level + 1, fmt(result.price), fmt(result.balance), hero);
  if (result.reason === 'no_duplicate') return t.noDuplicate(item.name, result.level, hero);
  if (result.reason === 'no_stones') return t.noStones(item.name, result.level + 1, tmStoneName(result.cls), result.need, result.have);
  return t.notOwned(p, item.name);
}

/** The result of a refine: the item's effects before and after. */
function resultEmbed(ctx: CommandContext, result: Refined): BotEmbed {
  const t = TEXT.refine;
  const { item } = result;
  const share = itemEffectiveness(item, ctx.user.id);
  const effects = (level: number) => describeEffects(item, share, level).join('\n') || t.noEffects;
  const hero = heroOnly(item);
  return createEmbed()
    .setTitle(t.title(item.name, SLOT_EMOJI[item.slot]))
    .setDescription(
      [
        result.stones
          ? t.doneStones(ctx.user.toString(), result.from, result.to, tmStoneName(result.stones.class), result.stones.paid, result.stones.left, fmt(result.paid))
          : t.done(ctx.user.toString(), result.from, result.to, result.duplicatesLeft, fmt(result.paid), hero),
        ...(result.maxedCopies > 0 ? [`ℹ️ ${t.alsoMaxed(item.name, REFINE.maxLevel, result.maxedCopies, hero)}`] : []),
      ].join('\n'),
    )
    .addFields(
      { name: t.beforeField(result.from, hero), value: effects(result.from), inline: true },
      { name: t.afterField(result.to, hero), value: effects(result.to), inline: true },
      { name: t.balanceField, value: money(result.balance), inline: true },
    )
    .setFooter({ text: t.footer(REFINE.maxLevel, hero) });
}

/**
 * The "Refine again" button (with what the next refine costs), while the item can still go up and
 * there is a duplicate to use; no buttons otherwise. It's greyed out while they can't pay for it.
 */
function buttonRows(result: Refined): ActionRowBuilder<ButtonBuilder>[] {
  // (A TechnoMagic piece's: while they have the stones the next star takes.)
  const more = result.stones ? result.stones.next !== null && result.stones.left >= result.stones.next : result.duplicatesLeft > 0;
  if (result.to >= REFINE.maxLevel || !more || result.nextCost === null) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(REFINE_BUTTONS.againId)
        .setLabel(TEXT.refine.againButton(result.to + 1, fmt(result.nextCost), heroOnly(result.item)))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(result.balance < result.nextCost),
    ),
  ];
}

/**
 * Listens to the "Refine again" button. Only the member who refined can use it. Each press refines
 * the item once more and shows the new result on the same message; the button goes away once the
 * item reaches the top level, the duplicates run out, a refine is refused, or REFINE_BUTTONS.idleMs
 * passes without a press.
 */
async function watchButton(ctx: CommandContext, sent: SentReply, item: ItemDef): Promise<void> {
  const message = await sent.fetchMessage();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: REFINE_BUTTONS.idleMs });
  let running: Promise<void> = Promise.resolve();
  let busy = false;

  collector.on('collect', (interaction) => {
    void (async () => {
      if (interaction.user.id !== ctx.user.id) {
        await replyPrivately(interaction, TEXT.refine.notYours);
        return;
      }
      await interaction.deferUpdate().catch(() => {});
      if (busy || interaction.customId !== REFINE_BUTTONS.againId) return;

      busy = true;
      running = (async () => {
        try {
          const result = await refineItem(ctx.guildId, ctx.user.id, item);
          if (!result.ok) {
            await followUpPrivately(interaction, refusalText(ctx.prefix, item, result));
            collector.stop();
            return;
          }
          const components = buttonRows(result);
          await interaction.editReply({ embeds: [resultEmbed(ctx, result)], components });
          if (components.length === 0) collector.stop();
        } catch (err) {
          console.error('A refine button failed:', err);
        } finally {
          busy = false;
        }
      })();
      await running;
    })();
  });

  collector.on('end', () => {
    void (async () => {
      await running;
      await message.edit({ components: [] }).catch(() => {});
    })();
  });
}

export const refine: Command = {
  name: 'refine',
  category: 'items',
  aliases: ['rf', 'enhance', 'awaken'],
  description: `Refine an item you own: use up a duplicate of it for a star more (up to ★${REFINE.maxLevel}, its full strength). A hero's gear is awakened, as in King's Raid: from ★0, a duplicate a star, up to ★${REFINE.maxLevel}.`,
  usage: 'refine <item name>',
  slashUsage: 'refine <item>',
  details: `Raises your highest copy that isn't ★${REFINE.maxLevel} yet, using up your lowest spare (never one you wear, keep in a loadout, have fully refined or locked).`,

  async execute(ctx) {
    const p = ctx.prefix;
    const t = TEXT.refine;
    const query = ctx.args.join(' ').trim();
    if (!query) {
      await ctx.reply(t.askWhich(p));
      return;
    }

    const owned = (await getInventory(ctx.guildId, ctx.user.id))
      .map((entry) => ITEMS_BY_ID.get(entry.itemId))
      .filter((item): item is ItemDef => item !== undefined);
    const pick = await resolveItem(ctx, query, { ambiguous: t.ambiguous, noSuchItem: t.noSuchItem(p, query) }, { items: owned, notOwned: (name) => t.notOwned(p, name) });
    if (!pick) return;
    // After a "Did you mean...?", the refine goes on that question's message.
    ctx = pick.ctx;
    const { item } = pick;
    const result = await refineItem(ctx.guildId, ctx.user.id, item);
    if (!result.ok) {
      await ctx.reply(refusalText(p, item, result));
      return;
    }

    const components = buttonRows(result);
    const sent = await ctx.reply({ embeds: [resultEmbed(ctx, result)], components });
    if (components.length > 0) await watchButton(ctx, sent, item);
  },
};
