import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { LOADOUT_BUTTONS, LOADOUTS, REFINE, SLOT_EMOJI, TEXT } from '../constants/index.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { findLoadout, LOADOUT_NUMBERS } from '../lib/game/loadouts.js';
import { getLoadoutViews, getLoadouts, renameLoadout, switchLoadout, type RenameResult, type ResolvedLoadout, type SwitchResult } from '../services/loadouts.js';
import { SLOTS, type GearIds } from '../types.js';
import type { Command, CommandContext, SentReply } from '../discord/types.js';
import { followUpPrivately, replyPrivately } from '../discord/reply.js';

/** The names of the items in a loadout's gear, in slot order. */
function itemNames(gear: GearIds): string[] {
  return SLOTS.map((slot) => gear[slot]).filter((id): id is string => !!id).map((id) => ITEMS_BY_ID.get(id)?.name ?? id);
}

/** The list of a member's loadouts, with `notice` (like "Switched to...") above it. */
function listEmbed(ctx: CommandContext, loadouts: readonly ResolvedLoadout[], notice?: string): BotEmbed {
  const t = TEXT.loadout;
  const embed = createEmbed().setTitle(t.title(ctx.user.displayName)).setFooter({ text: t.footer(ctx.prefix) });
  if (notice) embed.setDescription(notice);
  for (const loadout of loadouts) {
    const lines = SLOTS.map((slot) => {
      const id = loadout.gear[slot];
      const item = id ? ITEMS_BY_ID.get(id) : undefined;
      return t.slot(SLOT_EMOJI[slot], item ? t.item(item.name, loadout.gear.levels?.[slot] ?? REFINE.maxLevel) : null);
    });
    embed.addFields({ name: t.heading(loadout.number, loadout.name, loadout.active), value: lines.join('\n') });
  }
  return embed;
}

/** A button for every loadout the member isn't using, so they can switch in one press. */
export function buttonRows(loadouts: readonly ResolvedLoadout[]): ActionRowBuilder<ButtonBuilder>[] {
  const others = loadouts.filter((loadout) => !loadout.active);
  if (others.length === 0) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      others.map((loadout) =>
        new ButtonBuilder()
          .setCustomId(`${LOADOUT_BUTTONS.switchPrefix}${loadout.number}`)
          .setLabel(loadout.name)
          .setStyle(ButtonStyle.Secondary),
      ),
    ),
  ];
}

/** What a successful switch says. */
function switchedNotice(ctx: CommandContext, result: Extract<SwitchResult, { ok: true }>): string {
  const t = TEXT.loadout;
  return result.alreadyActive ? t.alreadyActive(result.name) : t.switched(ctx.prefix, result.name, itemNames(result.gear));
}

/**
 * Listens to the switch buttons. Only the member whose loadouts these are can press them. Each
 * press switches and shows the list again on the same message; the buttons go away after
 * LOADOUT_BUTTONS.idleMs without a press.
 */
async function watchButtons(ctx: CommandContext, sent: SentReply): Promise<void> {
  const message = await sent.fetchMessage();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: LOADOUT_BUTTONS.idleMs });
  let running: Promise<void> = Promise.resolve();
  let busy = false;

  collector.on('collect', (interaction) => {
    void (async () => {
      if (interaction.user.id !== ctx.user.id) {
        await replyPrivately(interaction, TEXT.loadout.notYours);
        return;
      }
      await interaction.deferUpdate().catch(() => {});
      const number = Number(interaction.customId.slice(LOADOUT_BUTTONS.switchPrefix.length));
      if (busy || !interaction.customId.startsWith(LOADOUT_BUTTONS.switchPrefix) || !LOADOUT_NUMBERS.includes(number)) return;

      busy = true;
      running = (async () => {
        try {
          const result = await switchLoadout(ctx.guildId, ctx.user.id, number);
          if (!result.ok) {
            await followUpPrivately(interaction, TEXT.loadout.busy);
            return;
          }
          const loadouts = await getLoadouts(ctx.guildId, ctx.user.id);
          await interaction.editReply({ embeds: [listEmbed(ctx, loadouts, switchedNotice(ctx, result))], components: buttonRows(loadouts) });
        } catch (err) {
          console.error('A loadout button failed:', err);
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

/** Shows the member's loadouts with their switch buttons. */
async function show(ctx: CommandContext, notice?: string): Promise<void> {
  const loadouts = await getLoadouts(ctx.guildId, ctx.user.id);
  const components = buttonRows(loadouts);
  const sent = await ctx.reply({ embeds: [listEmbed(ctx, loadouts, notice)], components });
  if (components.length > 0) await watchButtons(ctx, sent);
}

function renameFailure(result: Exclude<RenameResult, { ok: true }>, name: string): string {
  const t = TEXT.loadout;
  switch (result.reason) {
    case 'too_long':
      return t.tooLong(LOADOUTS.maxNameLength);
    case 'bad_characters':
      return t.badCharacters;
    case 'no_letters':
      return t.noLetters;
    case 'reserved':
      return t.reserved(name);
    case 'taken':
      return t.taken(result.number, name);
  }
}

async function rename(ctx: CommandContext, args: string[]): Promise<void> {
  const t = TEXT.loadout;
  const number = Number(args[0]);
  if (!/^\d+$/.test(args[0] ?? '') || !LOADOUT_NUMBERS.includes(number)) {
    await ctx.reply(t.renameUsage(ctx.prefix, LOADOUTS.count));
    return;
  }
  const name = args.slice(1).join(' ');
  const result = await renameLoadout(ctx.guildId, ctx.user.id, number, name);
  if (!result.ok) {
    await ctx.reply(renameFailure(result, name.trim()));
    return;
  }
  await ctx.reply(name.trim() === '' ? t.renamedDefault(result.before, result.after) : t.renamed(result.before, result.after));
}

async function switchTo(ctx: CommandContext, query: string): Promise<void> {
  const t = TEXT.loadout;
  const lookup = findLoadout(await getLoadoutViews(ctx.guildId, ctx.user.id), query);
  if (lookup.kind === 'ambiguous') {
    await ctx.reply(t.ambiguous(lookup.names));
    return;
  }
  if (lookup.kind === 'none') {
    await ctx.reply(t.notFound(ctx.prefix, query));
    return;
  }

  const result = await switchLoadout(ctx.guildId, ctx.user.id, lookup.number);
  if (!result.ok) {
    await ctx.reply(t.busy);
    return;
  }
  await show(ctx, switchedNotice(ctx, result));
}

export const loadout: Command = {
  name: 'loadout',
  aliases: ['loadouts'],
  description: `Keep ${LOADOUTS.count} sets of gear and switch between them. Equipping changes the loadout you are using.`,
  usage: 'loadout [number or name] | loadout rename <number> [name]',
  slashUsage: 'loadout list|switch|rename',

  async execute(ctx) {
    const [first, ...rest] = ctx.args;
    const action = first?.toLowerCase();
    if (action === undefined || action === 'list') return show(ctx);
    if (action === 'rename') return rename(ctx, rest);
    return switchTo(ctx, ctx.args.join(' '));
  },
};
