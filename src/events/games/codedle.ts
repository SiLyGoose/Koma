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
  type ModalSubmitInteraction,
} from 'discord.js';
import { CONFIG } from '../../config.js';
import { CODE, CODE_LENGTH, TEXT } from '../../constants/index.js';
import { replyPrivately } from '../../discord/reply.js';
import { createEmbed, type BotEmbed } from '../../lib/embed.js';
import { parseGuess, rollCode, scoreGuess, type Mark } from '../../lib/events/code.js';
import { fmt, mention } from '../../lib/format.js';
import { payShares } from '../../services/events.js';
import { chargeIntoVault, claimVault, getVaultPool, refundFromVault, vaultCost } from '../../services/vault.js';
import { siteGameLink, webConfig } from '../../web/config.js';
import { eventPing } from '../ping.js';
import type { EventContext, GameEvent } from '../types.js';
import { codedleChanged, codedleClosed, codedleOpened, type CodeGuess, type CodedleEnd, type CodedleGame, type GuessOutcome } from './codedle-games.js';
import { LiveMessage, showResult } from './vault-game.js';

/*
 * Codedle: the vault is locked with a random CODE_LENGTH-digit code, and the first person
 * to guess it wins the prize (the vault pool times events.vault.multiplier). It is announced events.codedle.waitSeconds
 * before guessing opens, so everyone has time to open it (on the site too). Then anyone can guess, as
 * often as they like, through a pop-up or on the site's Codedle page (its Play on the site button:
 * web/games/codedle/, the one game through ./codedle-games.ts); each guess costs events.codedle.guessCost,
 * added to the vault. Every guess is scored Wordle-style (lib/events/code.ts), but only the guesser sees their
 * own guesses and hints (privately, after each guess or with My guesses); the live screen only
 * counts them. The full board is revealed when the game ends. If time runs out the code is revealed and the money stays in
 * the vault. Like the other vault games it isn't saved to the database: a restart mid-game
 * ends it without a payout, and guess fees already paid stay in the vault.
 */

export type { CodeGuess };

const SQUARES: Record<Mark, string> = { hit: '🟩', near: '🟨', miss: '⬛' };

export const squares = (marks: readonly Mark[]): string => marks.map((mark) => SQUARES[mark]).join('');

/** The live screen's buttons: Guess, My guesses (both off until guessing opens), and (`site`: the site's link to the game) Play on the site. */
export function guessRow(site: string | null = null, open = true): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CODE.guessId).setLabel(TEXT.codedle.guessButton).setStyle(ButtonStyle.Primary).setDisabled(!open),
    new ButtonBuilder().setCustomId(CODE.mineId).setLabel(TEXT.codedle.mineButton).setStyle(ButtonStyle.Secondary).setDisabled(!open),
    ...(site ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(site).setLabel(TEXT.codedle.siteButton).setEmoji('🔐')] : []),
  );
}

/** A guess not taken, in words (`opensAtUnix`: when guessing opens). */
function refusalText(reason: Extract<GuessOutcome, { ok: false }>['reason'], guessCost: number, opensAtUnix: number): string {
  if (reason === 'bad_guess') return TEXT.codedle.badGuess(CODE_LENGTH);
  if (reason === 'early') return TEXT.codedle.early(opensAtUnix);
  if (reason === 'over') return TEXT.codedle.over;
  if (reason === 'cant_afford') return TEXT.codedle.cantAfford(fmt(guessCost));
  return TEXT.codedle.somethingWrong;
}

/** Who sent `submit`, as the server names them. */
const nameOf = (submit: ModalSubmitInteraction): string =>
  submit.member && 'displayName' in submit.member ? submit.member.displayName : submit.user.displayName;

/**
 * The most recent guesses, oldest first, with a note about any older ones. `withNames` adds who
 * made each guess (the board revealed at the end); a player's own board leaves it out.
 */
function boardText(guesses: readonly CodeGuess[], withNames = true): string {
  if (guesses.length === 0) return TEXT.codedle.boardEmpty;
  const shown = guesses.slice(-CODE.boardMax);
  const lines = shown.map((g) => TEXT.codedle.boardLine(squares(g.marks), g.guess, withNames ? mention(g.userId) : ''));
  const older = guesses.length - shown.length;
  return older > 0 ? [TEXT.codedle.olderGuesses(older), ...lines].join('\n') : lines.join('\n');
}

/** One player's own guesses and their hints, shown only to them. */
export function myBoardText(guesses: readonly CodeGuess[], userId: string): string {
  const mine = guesses.filter((g) => g.userId === userId);
  if (mine.length === 0) return TEXT.codedle.mineEmpty;
  return `${TEXT.codedle.mineTitle(mine.length)}\n${boardText(mine, false)}`;
}

/** The live game: the rules, when guessing opens (`opensAtUnix`; null: it has), and how many guesses there have been. The guesses themselves are private. */
export function codeEmbed(prize: number, guessCost: number, opensAtUnix: number | null, endsAtUnix: number, guesses: readonly CodeGuess[]): BotEmbed {
  return createEmbed()
    .setTitle(TEXT.codedle.title)
    .setDescription(TEXT.codedle.description(fmt(prize), CODE_LENGTH, guessCost > 0 ? fmt(guessCost) : '', opensAtUnix, endsAtUnix))
    .setFooter({ text: TEXT.codedle.guessCount(guesses.length) });
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
  const opensAtMs = Date.now() + cfg.waitSeconds * 1000;
  const endsAtMs = opensAtMs + cfg.seconds * 1000;
  const opensAtUnix = Math.floor(opensAtMs / 1000);
  const endsAtUnix = Math.floor(endsAtMs / 1000);
  const isOpen = (): boolean => Date.now() >= opensAtMs;
  const web = webConfig();
  const site = web ? siteGameLink(web, 'codedle', guild.id) : null;

  const guesses: CodeGuess[] = [];
  let over = false;
  let winner: { userId: string; name: string } | null = null;
  const view = () => {
    const open = isOpen();
    return { embeds: [codeEmbed(prize, cfg.guessCost, open ? null : opensAtUnix, endsAtUnix, guesses)], components: [guessRow(site, open)] };
  };

  const message = await channel.send({ ...view(), ...(await eventPing(guild)) });
  console.log(`Codedle for ${prize} points (base ${basePool}) opened in ${guild.id}.`);
  const live = new LiveMessage(message, CODE.refreshMs);
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: Math.max(0, endsAtMs - Date.now()) });
  // Guessing opens: the message's buttons come on, and the site's pages are told.
  const opening = setTimeout(
    () => {
      live.show(view());
      codedleChanged(guild.id);
    },
    Math.max(0, opensAtMs - Date.now()),
  );

  /** The game, as its pop-up and the site's page both play it. */
  const game: CodedleGame = {
    prize,
    guessCost: cfg.guessCost,
    opensAt: opensAtMs,
    endsAt: endsAtMs,
    guesses,
    async guess(userId, name, text) {
      const guess = parseGuess(text, CODE_LENGTH);
      if (!guess) return { ok: false, reason: 'bad_guess' };
      if (over) return { ok: false, reason: 'over' };
      if (!isOpen()) return { ok: false, reason: 'early' };
      let charged: boolean;
      try {
        charged = await chargeIntoVault(guild.id, userId, cfg.guessCost, 'code_guess');
      } catch (err) {
        console.error(`Could not charge a Codedle guess in ${guild.id}:`, err);
        return { ok: false, reason: 'failed' };
      }
      if (!charged) return { ok: false, reason: 'cant_afford' };
      // The game may have ended while the fee was being taken: then the guess doesn't count, so give the fee back.
      if (over) {
        await refundFromVault(guild.id, userId, cfg.guessCost, 'code_refund').catch((err) =>
          console.error(`Could not refund a late Codedle guess in ${guild.id}:`, err),
        );
        return { ok: false, reason: 'over' };
      }

      // From here on nothing is awaited until the guess is on the board, so two guesses can't both win.
      const marks = scoreGuess(code, guess);
      guesses.push({ userId, name, guess, marks });
      const won = guess === code;
      if (won) {
        over = true;
        winner = { userId, name };
        collector.stop('cracked');
      } else live.show(view());
      codedleChanged(guild.id);
      return { ok: true, guess, marks, won };
    },
  };

  const handleGuess = async (press: ButtonInteraction): Promise<void> => {
    const userId = press.user.id;
    if (over) return replyPrivately(press, TEXT.codedle.over);
    if (!isOpen()) return replyPrivately(press, TEXT.codedle.early(opensAtUnix));

    // A fresh id per press, so an old pop-up left open can't be mistaken for this one.
    const modalId = `code_${randomUUID()}`;
    const shown = await press.showModal(guessModal(modalId)).then(
      () => true,
      () => false,
    );
    if (!shown) return;
    const submit = await press.awaitModalSubmit({ time: CODE.modalMs, filter: (m) => m.customId === modalId && m.user.id === userId }).catch(() => null);
    if (!submit) return;

    const outcome = await game.guess(userId, nameOf(submit), submit.fields.getTextInputValue(CODE.inputId));
    if (!outcome.ok) return replyPrivately(submit, refusalText(outcome.reason, cfg.guessCost, opensAtUnix));
    if (outcome.won) return replyPrivately(submit, TEXT.codedle.youWon(fmt(prize)));
    return replyPrivately(submit, `${TEXT.codedle.wrong(squares(outcome.marks), outcome.guess)}\n\n${myBoardText(guesses, userId)}`);
  };

  /** How it ended, for the site's page (null: the prize couldn't be paid). */
  let end: CodedleEnd | null = null;
  codedleOpened(guild.id, game);
  try {
    collector.on('collect', (press) => {
      if (press.customId === CODE.mineId) {
        void replyPrivately(press, myBoardText(guesses, press.user.id));
        return;
      }
      if (press.customId !== CODE.guessId) return;
      handleGuess(press).catch((err) => console.error(`A Codedle guess failed in ${guild.id}:`, err));
    });
    await new Promise<void>((resolve) => collector.once('end', () => resolve()));
    over = true;
    await live.stop();

    const cracked = winner as { userId: string; name: string } | null;
    if (cracked) {
      try {
        const payout = await payShares(guild.id, [{ userId: cracked.userId, amount: prize }], 'code_prize');
        const taken = payout.paid.reduce((sum, share) => sum + share.amount, 0);
        await claimVault(guild.id, vaultCost(basePool, prize, taken));
        if (taken === 0) throw new Error('the prize could not be paid');
      } catch (err) {
        console.error(`Could not pay the Codedle prize in ${guild.id}:`, err);
        await showResult(message, channel, codeFailedEmbed(), 'Codedle');
        return;
      }
    }
    end = { code, prize, winner: cracked, guesses: [...guesses], endedAt: Date.now() };
    console.log(`Codedle in ${guild.id} ended: ${cracked ? 'cracked' : 'not cracked'} after ${guesses.length} guesses.`);
    await showResult(message, channel, codeResultEmbed(code, prize, guesses, cracked?.userId ?? null), 'Codedle');
  } finally {
    clearTimeout(opening);
    codedleClosed(guild.id, end);
  }
}

export const codedle: GameEvent = {
  id: 'codedle',
  label: 'Codedle',
  description: `The vault is locked with a ${CODE_LENGTH}-digit code. Anyone can guess (for a small fee); each guesser sees Wordle-style hints for their own guesses only. The first to crack it takes the prize.`,
  weight: 1,
  run: runCodedle,
};
