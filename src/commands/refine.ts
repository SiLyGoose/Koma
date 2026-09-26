import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { REFINE, REFINE_BUTTONS, TEXT } from '../constants/index.js';
import { ITEMS_BY_ID, findItem } from '../data/items.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { describeEffects, itemEffectiveness } from '../lib/game/equipment.js';
import { starString } from '../lib/format.js';
import { getInventory } from '../services/economy/index.js';
import { refineItem, type RefineResult } from '../services/refine.js';
import type { ItemDef } from '../types.js';
import type { Command, CommandContext, SentReply } from '../discord/types.js';
import { followUpPrivately, replyPrivately } from '../discord/reply.js';

type Refined = Extract<RefineResult, { ok: true }>;

/** Why a refine didn't happen, in words. */
function refusalText(p: string, item: ItemDef, result: Exclude<RefineResult, { ok: true }>): string {
  const t = TEXT.refine;
  if (result.reason === 'busy') return t.busy;
  if (result.reason === 'maxed') return t.maxed(item.name, REFINE.maxLevel);
  if (result.reason === 'no_duplicate') return t.noDuplicate(item.name, result.level);
  return t.notOwned(p, item.name);
}

/** The result of a refine: the item's effects before and after. */
function resultEmbed(ctx: CommandContext, result: Refined): BotEmbed {
  const t = TEXT.refine;
  const { item } = result;
  const share = itemEffectiveness(item, ctx.user.id);
  const effects = (level: number) => describeEffects(item, share, level).join('\n') || t.noEffects;
  return createEmbed()
    .setTitle(t.title(starString(item.stars), item.name))
    .setDescription(t.done(ctx.user.toString(), result.from, result.to, result.duplicatesLeft))
    .addFields(
      { name: t.beforeField(result.from), value: effects(result.from), inline: true },
      { name: t.afterField(result.to), value: effects(result.to), inline: true },
    )
    .setFooter({ text: t.footer(REFINE.maxLevel) });
}

/** The "Refine again" button, while the item can still go up and there is a duplicate to use; no buttons otherwise. */
function buttonRows(result: Refined): ActionRowBuilder<ButtonBuilder>[] {
  if (result.to >= REFINE.maxLevel || result.duplicatesLeft <= 0) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(REFINE_BUTTONS.againId).setLabel(TEXT.refine.againButton(result.to + 1)).setStyle(ButtonStyle.Primary),
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
  description: `Refine an item you own: use up a duplicate of it to raise it one level (up to R${REFINE.maxLevel}, its full strength).`,
  usage: 'refine <item name>',
  slashUsage: 'refine <item>',

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
    const lookup = findItem(query, owned);
    if (lookup.kind === 'ambiguous') {
      await ctx.reply(t.ambiguous(lookup.matches.map((item) => item.name)));
      return;
    }
    if (lookup.kind === 'none') {
      const anywhere = findItem(query);
      await ctx.reply(anywhere.kind === 'found' ? t.notOwned(p, anywhere.item.name) : t.noSuchItem(p, query));
      return;
    }

    const { item } = lookup;
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
