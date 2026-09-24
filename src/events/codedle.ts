import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from 'discord.js';
import { CONFIG } from '../config.js';
import { CODE, CODE_LENGTH, TEXT } from '../constants/index.js';
import { replyPrivately } from '../discord/reply.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { parseGuess, rollCode, ruledOut, scoreGuess, type Mark } from '../lib/events/code.js';
import { fmt, mention } from '../lib/format.js';
import { payShares } from '../services/events.js';
import { chargeIntoVault, getVaultPool, refundFromVault, takeFromVault, vaultCost } from '../services/vault.js';
import type { EventContext, GameEvent } from './types.js';
import { LiveMessage, showResult } from './vault-game.js';

/*
 * Codedle: the vault is locked with a random CODE_LENGTH-digit code, and the first person
 * to guess it wins the prize (the vault pool times events.vault.multiplier). Anyone can guess, as
 * often as they like, through a pop-up; each guess costs events.codedle.guessCost, added to the
 * vault. Every guess is scored Wordle-style on a shared board (lib/events/code.ts), so everyone
 * learns from everyone's guesses. If time runs out the code is revealed and the money stays in
 * the vault. Like the other vault games it isn't saved to the database: a restart mid-game
 * ends it without a payout, and guess fees already paid stay in the vault.
 */

export interface CodeGuess {
  userId: string;
  guess: string;
  marks: Mark[];
}

const SQUARES: Record<Mark, string> = { hit: '🟩', near: '🟨', miss: '⬛' };

export const squares = (marks: readonly Mark[]): string => marks.map((mark) => SQUARES[mark]).join('');

export function guessRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CODE.guessId).setLabel(TEXT.codedle.guessButton).setStyle(ButtonStyle.Primary),
  );
}

/** The most recent guesses, oldest first, with a note about any older ones. */
function boardText(guesses: readonly CodeGuess[]): string {
  if (guesses.length === 0) return TEXT.codedle.boardEmpty;
  const shown = guesses.slice(-CODE.boardMax);
  const lines = shown.map((g) => TEXT.codedle.boardLine(squares(g.marks), g.guess, mention(g.userId)));
  const older = guesses.length - shown.length;
  return older > 0 ? [TEXT.codedle.olderGuesses(older), ...lines].join('\n') : lines.join('\n');
}

/** The live game: the rules, the board and which digits are ruled out. */
export function codeEmbed(prize: number, guessCost: number, endsAtUnix: number, guesses: readonly CodeGuess[]): BotEmbed {
  const embed = createEmbed()
    .setTitle(TEXT.codedle.title)
    .setDescription(TEXT.codedle.description(fmt(prize), CODE_LENGTH, guessCost > 0 ? fmt(guessCost) : '', endsAtUnix))
    .addFields({ name: TEXT.codedle.boardField, value: boardText(guesses) });
  const out = ruledOut(guesses);
  if (out.length > 0) embed.addFields({ name: TEXT.codedle.ruledOutField, value: out.join(' ') });
  return embed.setFooter({ text: TEXT.codedle.guessCount(guesses.length) });
}

/** How it ended: cracked by `winner`, or not (the code is revealed either way). */
export function codeResultEmbed(code: string, prize: number, guesses: readonly CodeGuess[], winner: string | null): BotEmbed {
  const embed = createEmbed();
  if (winner) embed.setTitle(TEXT.codedle.crackedTitle).setDescription(TEXT.codedle.cracked(mention(winner), code, fmt(prize), guesses.length));
  else embed.setTitle(TEXT.codedle.lockedTitle).setDescription(TEXT.codedle.locked(code, guesses.length));
  return embed.addFields({ name: TEXT.codedle.boardField, value: boardText(guesses) });
}

export const codeFailedEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.codedle.failedTitle).setDescription(TEXT.codedle.failed);

function guessModal(modalId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(TEXT.codedle.modalTitle)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(CODE.inputId)
          .setLabel(TEXT.codedle.inputLabel(CODE_LENGTH))
          .setPlaceholder(TEXT.codedle.inputPlaceholder(CODE_LENGTH))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(CODE_LENGTH)
          .setMaxLength(CODE_LENGTH * 2),
      ),
    );
}

async function runCodedle(ctx: EventContext): Promise<void> {
  const { guild, channel } = ctx;
  // Settings are read once, so a change while the game runs doesn't alter it half way.
  const cfg = { ...CONFIG.events.codedle };
  const basePool = await getVaultPool(guild.id);
  if (basePool <= 0) {
    console.log(`Skipped Codedle in ${guild.id}: nothing has been lost to gambling yet.`);
    return;
  }
  const prize = Math.round(basePool * CONFIG.events.vault.multiplier);
  const code = rollCode(CODE_LENGTH);
  const endsAtMs = Date.now() + cfg.seconds * 1000;
  const endsAtUnix = Math.floor(endsAtMs / 1000);

  const guesses: CodeGuess[] = [];
  let over = false;
  let winner: string | null = null;
  const view = () => ({ embeds: [codeEmbed(prize, cfg.guessCost, endsAtUnix, guesses)], components: [guessRow()] });

  const message = await channel.send(view());
  console.log(`Codedle for ${prize} points (base ${basePool}) opened in ${guild.id}.`);
  const live = new LiveMessage(message, CODE.refreshMs);
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: cfg.seconds * 1000 });

  const handleGuess = async (press: ButtonInteraction): Promise<void> => {
    const userId = press.user.id;
    if (over) return replyPrivately(press, TEXT.codedle.over);

    // A fresh id per press, so an old pop-up left open can't be mistaken for this one.
    const modalId = `code_${randomUUID()}`;
    const shown = await press.showModal(guessModal(modalId)).then(
      () => true,
      () => false,
    );
    if (!shown) return;
    const submit = await press.awaitModalSubmit({ time: CODE.modalMs, filter: (m) => m.customId === modalId && m.user.id === userId }).catch(() => null);
    if (!submit) return;

    const guess = parseGuess(submit.fields.getTextInputValue(CODE.inputId), CODE_LENGTH);
    if (!guess) return replyPrivately(submit, TEXT.codedle.badGuess(CODE_LENGTH));
    if (over) return replyPrivately(submit, TEXT.codedle.over);

    let charged: boolean;
    try {
      charged = await chargeIntoVault(guild.id, userId, cfg.guessCost, 'code_guess');
    } catch (err) {
      console.error(`Could not charge a Codedle guess in ${guild.id}:`, err);
      return replyPrivately(submit, TEXT.codedle.somethingWrong);
    }
    if (!charged) return replyPrivately(submit, TEXT.codedle.cantAfford(fmt(cfg.guessCost)));
    // The game may have ended while the fee was being taken: then the guess doesn't count, so give the fee back.
    if (over) {
      await refundFromVault(guild.id, userId, cfg.guessCost, 'code_refund').catch((err) =>
        console.error(`Could not refund a late Codedle guess in ${guild.id}:`, err),
      );
      return replyPrivately(submit, TEXT.codedle.over);
    }

    // From here on nothing is awaited until the guess is on the board, so two guesses can't both win.
    const marks = scoreGuess(code, guess);
    guesses.push({ userId, guess, marks });
    if (guess === code) {
      over = true;
      winner = userId;
      collector.stop('cracked');
      return replyPrivately(submit, TEXT.codedle.youWon(fmt(prize)));
    }
    live.show(view());
    return replyPrivately(submit, TEXT.codedle.wrong(squares(marks), guess));
  };

  collector.on('collect', (press) => {
    if (press.customId !== CODE.guessId) return;
    handleGuess(press).catch((err) => console.error(`A Codedle guess failed in ${guild.id}:`, err));
  });
  await new Promise<void>((resolve) => collector.once('end', () => resolve()));
  over = true;
  await live.stop();

  if (winner) {
    try {
      const payout = await payShares(guild.id, [{ userId: winner, amount: prize }], 'code_prize');
      const taken = payout.paid.reduce((sum, share) => sum + share.amount, 0);
      await takeFromVault(guild.id, vaultCost(basePool, prize, taken));
      if (taken === 0) throw new Error('the prize could not be paid');
    } catch (err) {
      console.error(`Could not pay the Codedle prize in ${guild.id}:`, err);
      await showResult(message, channel, codeFailedEmbed(), 'Codedle');
      return;
    }
  }
  console.log(`Codedle in ${guild.id} ended: ${winner ? 'cracked' : 'not cracked'} after ${guesses.length} guesses.`);
  await showResult(message, channel, codeResultEmbed(code, prize, guesses, winner), 'Codedle');
}

export const codedle: GameEvent = {
  id: 'codedle',
  label: 'Codedle',
  description: `The vault is locked with a ${CODE_LENGTH}-digit code. Anyone can guess (for a small fee); every guess shows Wordle-style hints to everyone. The first to crack it takes the prize.`,
  weight: 1,
  run: runCodedle,
};
