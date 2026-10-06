import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { LOCK_BUTTONS, SLOT_EMOJI, TEXT } from '../constants/index.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { starString } from '../lib/format.js';
import type { InventoryStack } from '../lib/game/items/copies.js';
import { getInventory } from '../services/economy/index.js';
import { itemStacks, setOneLocked } from '../services/items/lock.js';
import type { ItemDef } from '../types.js';
import type { Command, CommandContext } from '../discord/types.js';
import { followUpPrivately, replyPrivately } from '../discord/reply.js';
import { resolveItem } from '../discord/item-pick.js';

type Verb = 'lock' | 'unlock';

/** Discord's limit: 5 rows of 5 buttons. */
const MAX_BUTTONS = 25;

/** The kinds of copy `verb` can act on: for lock the unlocked ones, for unlock the locked ones. */
async function choices(ctx: CommandContext, item: ItemDef, verb: Verb): Promise<InventoryStack[]> {
  return (await itemStacks(ctx.guildId, ctx.user.id, item.id)).filter((stack) => stack.locked === (verb === 'unlock'));
}

/** The picker: what to press, and what the last press did (`note`). */
function pickerEmbed(item: ItemDef, verb: Verb, note: string | null): BotEmbed {
  const t = TEXT.lock;
  return createEmbed()
    .setTitle(t.pickTitle(starString(item.stars), item.name, SLOT_EMOJI[item.slot]))
    .setDescription([t.pick(item.name, verb), ...(note ? ['', note] : [])].join('\n'));
}

/** One button per kind of copy, `LOCK_BUTTONS.prefix` + its index in `stacks`. */
function buttonRows(stacks: readonly InventoryStack[], verb: Verb): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = stacks.slice(0, MAX_BUTTONS).map((stack, i) =>
    new ButtonBuilder()
      .setCustomId(`${LOCK_BUTTONS.prefix}${i}`)
      .setLabel(TEXT.lock.button(stack.level, stack.count, stack.worn))
      .setEmoji(verb === 'lock' ? '🔒' : '🔓')
      .setStyle(ButtonStyle.Secondary),
  );
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  return rows;
}

/**
 * Shows a button for each kind of copy (level, worn) and locks (or unlocks) one copy of the kind pressed. Only
 * the member who asked can press them; they go away once nothing is left to do, or after LOCK_BUTTONS.idleMs.
 */
async function pick(ctx: CommandContext, item: ItemDef, verb: Verb, first: InventoryStack[]): Promise<void> {
  let stacks = first;
  const sent = await ctx.reply({ embeds: [pickerEmbed(item, verb, null)], components: buttonRows(stacks, verb), ephemeral: false });
  const message = await sent.fetchMessage();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: LOCK_BUTTONS.idleMs });
  let running: Promise<void> = Promise.resolve();
  let busy = false;

  collector.on('collect', (interaction) => {
    void (async () => {
      if (interaction.user.id !== ctx.user.id) {
        await replyPrivately(interaction, TEXT.lock.notYours);
        return;
      }
      await interaction.deferUpdate().catch(() => {});
      const stack = stacks[Number(interaction.customId.slice(LOCK_BUTTONS.prefix.length))];
      if (busy || !interaction.customId.startsWith(LOCK_BUTTONS.prefix) || !stack) return;

      busy = true;
      running = (async () => {
        try {
          const done = await setOneLocked(ctx.guildId, ctx.user.id, stack, verb === 'lock');
          if (!done) await followUpPrivately(interaction, TEXT.lock.gone);
          stacks = await choices(ctx, item, verb);
          const note = done ? TEXT.lock.done(item.name, stack.level, verb) : null;
          if (stacks.length === 0) {
            await interaction.editReply({ embeds: [pickerEmbed(item, verb, [note, TEXT.lock.allDone(verb)].filter(Boolean).join('\n'))], components: [] });
            collector.stop();
            return;
          }
          await interaction.editReply({ embeds: [pickerEmbed(item, verb, note)], components: buttonRows(stacks, verb) });
        } catch (err) {
          console.error(`A ${verb} button failed:`, err);
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

/**
 * `lock` and `unlock`: one copy of an item the member owns at a time (services/items/lock.ts). When their copies
 * differ (level, worn), buttons ask which kind; when they're all alike, one is done straight away.
 */
function lockCommand(verb: Verb): Command {
  const locking = verb === 'lock';
  return {
    name: verb,
    category: 'items',
    description: locking
      ? "Lock a copy of an item you own, so it can't be sold or used up by a refine."
      : 'Unlock a copy of an item you own, so it can be sold or used up by a refine again.',
    usage: `${verb} <item name>`,
    slashUsage: `${verb} <item>`,
    details: 'When your copies differ (refine level, equipped), buttons ask which one; each press does one copy.',

    async execute(ctx) {
      const p = ctx.prefix;
      const query = ctx.args.join(' ').trim();
      if (!query) {
        await ctx.reply(TEXT.lock.askWhich(p, verb));
        return;
      }

      const owned = (await getInventory(ctx.guildId, ctx.user.id))
        .map((entry) => ITEMS_BY_ID.get(entry.itemId))
        .filter((item): item is ItemDef => item !== undefined);
      const found = await resolveItem(
        ctx,
        query,
        { ambiguous: TEXT.refine.ambiguous, noSuchItem: TEXT.refine.noSuchItem(p, query) },
        { items: owned, notOwned: (name) => TEXT.refine.notOwned(p, name) },
      );
      if (!found) return;
      // After a "Did you mean...?", the answer goes on that question's message.
      ctx = found.ctx;
      const { item } = found;
      const stacks = await choices(ctx, item, verb);
      const [only] = stacks;
      if (!only) {
        await ctx.reply(TEXT.lock.nothingTo(item.name, verb));
        return;
      }
      // All alike: no choice to make.
      if (stacks.length === 1) {
        const done = await setOneLocked(ctx.guildId, ctx.user.id, only, locking);
        await ctx.reply(done ? TEXT.lock.done(item.name, only.level, verb) : TEXT.lock.gone);
        return;
      }
      await pick(ctx, item, verb, stacks);
    },
  };
}

export const lock = lockCommand('lock');
export const unlock = lockCommand('unlock');
