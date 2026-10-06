import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { ITEM_SUGGEST, TEXT } from '../constants/index.js';
import { ITEMS, findItem, suggestItems } from '../data/items.js';
import { createEmbed } from '../lib/embed.js';
import { starString } from '../lib/format.js';
import type { ItemDef } from '../types.js';
import { replyPrivately } from './reply.js';
import type { CommandContext, SentReply } from './types.js';

/** The item a command is about, and the context to answer in (after a "Did you mean...?", on its message). */
export interface ItemPick {
  item: ItemDef;
  ctx: CommandContext;
}

/** What resolveItem says when it can't settle on an item. */
export interface ItemLookupText {
  /** `query` could be several items: their names. */
  ambiguous: (names: string[]) => string;
  /** Nothing is called `query`, or close to it (and also what a "No" to the question turns into). */
  noSuchItem: string;
}

/** For commands about the member's own items: what they own, and what to say about an item they don't. */
export interface OwnedItems {
  items: readonly ItemDef[];
  notOwned: (name: string) => string;
}

/**
 * A context whose first reply replaces what `sent` shows (text, embeds and buttons) instead of
 * sending a new message, so a command carried on after a button press answers on the message
 * that was pressed. Later replies are sent as usual.
 */
export function answerOn(ctx: CommandContext, sent: SentReply): CommandContext {
  let used = false;
  return {
    ...ctx,
    async reply(options) {
      if (used) return ctx.reply(options);
      used = true;
      const wanted = typeof options === 'string' ? { content: options } : options;
      await sent.edit({
        content: wanted.content ?? null,
        embeds: wanted.embeds ?? [],
        components: wanted.components ?? [],
        ...(wanted.files ? { files: wanted.files } : {}),
      });
      return sent;
    },
  };
}

/** The question's buttons: Yes/No for one guess, or one per guess and "None of these". */
function questionRow(choices: readonly ItemDef[]): ActionRowBuilder<ButtonBuilder> {
  const t = TEXT.suggest;
  const picks = choices.map((item, i) =>
    new ButtonBuilder()
      .setCustomId(`${ITEM_SUGGEST.prefix}${i}`)
      .setLabel(choices.length === 1 ? t.yesButton : item.name)
      .setStyle(ButtonStyle.Primary),
  );
  const no = new ButtonBuilder()
    .setCustomId(ITEM_SUGGEST.noId)
    .setLabel(choices.length === 1 ? t.noButton : t.noneButton)
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...picks, no);
}

/**
 * Asks whether `query`, which named no item, meant one of `choices` (from suggestItems). Only the
 * member who asked can answer. A pick resolves to that item and a context whose next reply
 * replaces the question (see answerOn), so the command's answer and its buttons land on the same
 * message. A "No", or no answer within ITEM_SUGGEST.timeoutMs, replaces the question with
 * `declined` and resolves to null.
 */
export async function askDidYouMean(ctx: CommandContext, query: string, choices: readonly ItemDef[], declined: string): Promise<ItemPick | null> {
  const t = TEXT.suggest;
  const [only] = choices;
  const embed = createEmbed()
    .setTitle(t.title)
    .setDescription(
      choices.length === 1 && only
        ? t.one(query, starString(only.stars), only.name)
        : t.many(query, choices.map((item) => t.line(starString(item.stars), item.name)).join('\n')),
    )
    .setFooter({ text: t.footer(ITEM_SUGGEST.timeoutMs / 1000) });
  const sent = await ctx.reply({ embeds: [embed], components: [questionRow(choices)], ephemeral: false });
  const message = await sent.fetchMessage();

  return new Promise<ItemPick | null>((resolve) => {
    let decided = false;
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: ITEM_SUGGEST.timeoutMs });

    const decline = async () => {
      await sent.edit({ content: declined, embeds: [], components: [] }).catch(() => {});
      resolve(null);
    };

    collector.on('collect', (interaction) => {
      void (async () => {
        if (interaction.user.id !== ctx.user.id) {
          await replyPrivately(interaction, t.notYours);
          return;
        }
        if (decided) return;
        decided = true;
        // Acknowledge now; the command's answer replaces the question once it has one.
        await interaction.deferUpdate().catch(() => {});
        collector.stop('answered');
        const item = interaction.customId.startsWith(ITEM_SUGGEST.prefix) ? choices[Number(interaction.customId.slice(ITEM_SUGGEST.prefix.length))] : undefined;
        if (item) resolve({ item, ctx: answerOn(ctx, sent) });
        else await decline();
      })();
    });

    collector.on('end', () => {
      if (decided) return;
      decided = true;
      void decline();
    });
  });
}

/**
 * Finds the item `query` names, for a command about one item. An exact or partial name (findItem)
 * is used straight away; a name that could be several items is answered with `text.ambiguous`.
 * A misspelled one is asked about first (askDidYouMean); with nothing close, `text.noSuchItem`.
 *
 * With `owned`, only the member's own items count, and an item they don't have (named right, or
 * the only close guess) is answered with `owned.notOwned` rather than asked about.
 *
 * Resolves to null when the command has nothing to do (the reply has been sent).
 */
export async function resolveItem(ctx: CommandContext, query: string, text: ItemLookupText, owned?: OwnedItems): Promise<ItemPick | null> {
  const pool = owned?.items ?? ITEMS;
  const lookup = findItem(query, pool);
  if (lookup.kind === 'found') return { item: lookup.item, ctx };
  if (lookup.kind === 'ambiguous') {
    await ctx.reply(text.ambiguous(lookup.matches.map((item) => item.name)));
    return null;
  }

  // Tell "you don't have it" apart from "there is no such item".
  if (owned) {
    const anywhere = findItem(query);
    if (anywhere.kind === 'found') {
      await ctx.reply(owned.notOwned(anywhere.item.name));
      return null;
    }
  }

  const guesses = suggestItems(query, pool);
  if (guesses.length > 0) return askDidYouMean(ctx, query, guesses, text.noSuchItem);

  // A typo of an item they don't have: nothing to ask, they can't use it either way.
  const [unowned, ...others] = owned ? suggestItems(query) : [];
  await ctx.reply(unowned && others.length === 0 && owned ? owned.notOwned(unowned.name) : text.noSuchItem);
  return null;
}
