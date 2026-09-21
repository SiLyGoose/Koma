import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, type ButtonInteraction, type Message } from 'discord.js';
import { CONFIG } from '../config.js';
import { BLACKJACK, BLACKJACK_IMAGE_NAME, TEXT } from '../constants.js';
import { renderTable, type SeatView } from './images/blackjack-image.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { fmt, money, signed } from '../lib/format.js';
import { handValue, isBlackjack, isBust, newShoe, payoutFor, payoutRatio, Round, type Card, type Outcome, type Seat } from '../lib/game/blackjack.js';
import { doubleBet, refundBet, renewLeases, settleBet } from '../services/blackjack.js';
import type { EditOptions } from '../discord/types.js';
import type { Profile } from '../discord/profile.js';

/*
 * Plays one round of blackjack on a Discord message: deals the cards one by one (the picture is
 * swapped for every card), lets each player act in turn with buttons, plays the dealer, and pays
 * out. The rules are in lib/game/blackjack.ts and the points are in services/blackjack.ts; this is
 * only the part that talks to Discord and keeps time.
 *
 * Every bet given to `playRound` has already been taken from its owner. However the round ends,
 * each bet is either settled (paid out, or lost) or refunded, exactly once.
 */

const HIT_ID = 'bj_hit';
const STAND_ID = 'bj_stand';
const DOUBLE_ID = 'bj_double';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const mention = (userId: string): string => `<@${userId}>`;

// ---------------------------------------------------------------------------
// Who is at a table
// ---------------------------------------------------------------------------

const seated = new Set<string>();
const seatKey = (guildId: string, userId: string): string => `${guildId}:${userId}`;

/** Marks a member as being at a table. False when they already are (a member is at one table at a time, in each server). */
export function enterTable(guildId: string, userId: string): boolean {
  const key = seatKey(guildId, userId);
  if (seated.has(key)) return false;
  seated.add(key);
  return true;
}

export function leaveTable(guildId: string, userId: string): void {
  seated.delete(seatKey(guildId, userId));
}

/** Keeps the bets of a table marked as in use while it is being played. Returns a function that stops it. */
export function startHeartbeat(gameId: string): () => void {
  const timer = setInterval(() => {
    renewLeases(gameId).catch((err) => console.error('Could not renew the blackjack bets of a table:', err));
  }, BLACKJACK.heartbeatMs);
  timer.unref();
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------------------
// What is shown
// ---------------------------------------------------------------------------

/** A player at a table, with the bet that was taken for them (`bet` goes up when they double). */
export interface TablePlayer {
  userId: string;
  betId: string;
  bet: number;
  /** Their name and profile picture for the table picture. Left out, the seat says "PLAYER n". */
  profile?: Profile;
}

export interface RoundResult {
  userId: string;
  /** 'returned' when the bet had already been given back and nothing was paid. */
  outcome: Outcome | 'returned';
  bet: number;
  payout: number;
  /** payout - bet: positive when the player won points, negative when they lost some. */
  net: number;
  total: number;
  /** Their balance after being paid, or null if it isn't known (it could not be paid). */
  balance: number | null;
}

type Row = ActionRowBuilder<ButtonBuilder>;

interface FrameOptions {
  headline: string;
  /** The seat whose turn it is. */
  active?: number | null;
  /** The dealer's second card is face down. */
  hideHole?: boolean;
  /** Shows the players' lines under the headline (left off while the cards are dealt). */
  lines?: boolean;
  outcomes?: readonly Outcome[];
  results?: readonly RoundResult[];
  components?: Row[];
  /** What to show for each seat's player: their name and picture. */
  profiles?: readonly (Profile | undefined)[];
}

function statusText(seat: Seat, active: boolean): string {
  if (seat.status === 'blackjack') return TEXT.blackjack.statusBlackjack;
  if (seat.status === 'bust') return TEXT.blackjack.statusBust;
  if (seat.doubled) return TEXT.blackjack.statusDoubled;
  if (seat.status === 'stood') return TEXT.blackjack.statusStand;
  return active ? TEXT.blackjack.statusActive : '';
}

const OUTCOME_VERB: Record<Outcome, string> = {
  blackjack: TEXT.blackjack.outcomeBlackjack,
  win: TEXT.blackjack.outcomeWin,
  push: TEXT.blackjack.outcomePush,
  lose: TEXT.blackjack.outcomeLose,
  bust: TEXT.blackjack.outcomeBust,
};

/** The message for one moment of a round: the table picture, and who is doing what. */
function frame(round: Round, options: FrameOptions): EditOptions {
  const hideHole = options.hideHole ?? false;
  const seats: SeatView[] = round.seats.map((seat, i) => ({
    name: options.profiles?.[i]?.name,
    avatar: options.profiles?.[i]?.avatar,
    cards: seat.cards,
    bet: seat.bet,
    badge: options.outcomes ? options.outcomes[i] : seat.status === 'bust' ? 'bust' : seat.status === 'blackjack' ? 'blackjack' : null,
    active: i === options.active,
  }));
  const dealerBadge = hideHole || round.dealer.length < 2 ? null : isBust(round.dealer) ? 'bust' : isBlackjack(round.dealer) ? 'blackjack' : null;
  const picture = renderTable({ seats, dealer: round.dealer, hideHole, dealerBadge });

  const lines: string[] = [];
  if (options.results) {
    round.seats.forEach((seat, i) => {
      const result = options.results?.[i];
      if (!result) return;
      lines.push(
        result.outcome === 'returned'
          ? TEXT.blackjack.betReturned(mention(seat.userId))
          : TEXT.blackjack.resultLine(i + 1, mention(seat.userId), OUTCOME_VERB[result.outcome], result.total, signed(result.net)),
      );
    });
  } else if (options.lines) {
    round.seats.forEach((seat, i) => {
      const { total, soft } = handValue(seat.cards);
      lines.push(TEXT.blackjack.playerLine(i + 1, mention(seat.userId), total, soft, statusText(seat, i === options.active), fmt(seat.bet)));
    });
  }
  if (options.lines || options.results) {
    const up = round.dealer[0];
    const dealerTotal = hideHole ? (up ? `${handValue([up]).total} + ?` : '?') : String(handValue(round.dealer).total);
    const dealerStatus = dealerBadge === 'bust' ? TEXT.blackjack.statusBust : dealerBadge === 'blackjack' ? TEXT.blackjack.statusBlackjack : '';
    lines.push(TEXT.blackjack.dealerLine(dealerTotal, dealerStatus));
  }

  const embed: BotEmbed = createEmbed()
    .setTitle(options.results ? TEXT.blackjack.resultTitle : TEXT.blackjack.title)
    .setDescription([options.headline, '', ...lines].join('\n').trim())
    .setImage(`attachment://${BLACKJACK_IMAGE_NAME}`)
    .setFooter({ text: TEXT.blackjack.footer(payoutRatio(CONFIG.blackjack.naturalPayout)) });
  if (options.results && options.results.length === 1) {
    const balance = options.results[0]?.balance;
    if (balance !== null && balance !== undefined) embed.addFields({ name: TEXT.blackjack.balanceField, value: money(balance) });
  }
  return { embeds: [embed], files: [{ attachment: picture, name: BLACKJACK_IMAGE_NAME }], attachments: [], components: options.components ?? [] };
}

/** The table with the players' bets and no cards yet: what a solo game shows while it starts. */
export function openingMessage(players: readonly TablePlayer[]): { embeds: [BotEmbed]; files: { attachment: Buffer; name: string }[] } {
  const picture = renderTable({ seats: players.map((p) => ({ name: p.profile?.name, avatar: p.profile?.avatar, cards: [], bet: p.bet })), dealer: [] });
  const embed = createEmbed()
    .setTitle(TEXT.blackjack.title)
    .setDescription(TEXT.blackjack.dealing(players.length))
    .setImage(`attachment://${BLACKJACK_IMAGE_NAME}`)
    .setFooter({ text: TEXT.blackjack.footer(payoutRatio(CONFIG.blackjack.naturalPayout)) });
  return { embeds: [embed], files: [{ attachment: picture, name: BLACKJACK_IMAGE_NAME }] };
}

function turnButtons(round: Round, seat: number): Row[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(HIT_ID).setLabel(TEXT.blackjack.hitButton).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(STAND_ID).setLabel(TEXT.blackjack.standButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(DOUBLE_ID)
        .setLabel(TEXT.blackjack.doubleButton(fmt(round.seat(seat).bet)))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!round.canDouble(seat)),
    ),
  ];
}

// ---------------------------------------------------------------------------
// The round
// ---------------------------------------------------------------------------

type Action = { kind: 'hit' | 'stand' | 'double'; interaction: ButtonInteraction } | { kind: 'timeout' };

export interface RoundOptions {
  /** The cards to deal, taken from the end. Only for tests: a real round shuffles a new shoe. */
  shoe?: Card[];
  /** The buttons under the finished round (a solo game offers to play again). */
  finalComponents?: (results: readonly RoundResult[]) => Row[];
}

/**
 * Plays one round on `message` (the message is edited all the way through), then returns how each
 * player did. Returns null if something went wrong: the bets were returned and the message says so.
 */
export async function playRound(message: Message, players: readonly TablePlayer[], options: RoundOptions = {}): Promise<RoundResult[] | null> {
  const round = new Round(players.map((p) => ({ userId: p.userId, bet: p.bet })), options.shoe ?? newShoe(BLACKJACK.decks));
  const profiles = players.map((p) => p.profile);
  /** The message for a moment of this round, with the players' names and pictures. */
  const view = (frameOptions: FrameOptions): EditOptions => frame(round, { ...frameOptions, profiles });
  /** Bets that were given back before the round finished, so they must not be paid again. */
  const returned = new Set<number>();
  let ui = true;
  let currentSeat = -1;
  let waiter: { seat: number; resolve: (action: Action) => void } | null = null;

  /** Edits the message. If that stops working (it was deleted), the round carries on without it and the players stand. */
  const show = async (edit: EditOptions): Promise<void> => {
    if (!ui) return;
    try {
      await message.edit(edit);
    } catch (err) {
      ui = false;
      console.error('Could not update a blackjack table, finishing the round without it:', err);
      // Nobody can press anything now: a player being waited on stands at once.
      const stuck = waiter;
      waiter = null;
      stuck?.resolve({ kind: 'timeout' });
    }
  };
  const pause = async (ms: number): Promise<void> => {
    if (ui) await sleep(ms);
  };

  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button });
  collector.on('collect', (press) => {
    void (async () => {
      if (press.customId !== HIT_ID && press.customId !== STAND_ID && press.customId !== DOUBLE_ID) return;
      const who = players.findIndex((p) => p.userId === press.user.id);
      if (who === -1) {
        await press.reply({ content: TEXT.blackjack.notAtTable, flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      const wanted = waiter;
      if (!wanted || wanted.seat !== who) {
        // Their own second press of the same button is just acknowledged; a press out of turn is told so.
        if (who === currentSeat) await press.deferUpdate().catch(() => {});
        else await press.reply({ content: TEXT.blackjack.notYourTurn, flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      waiter = null; // taken: a second press can't act again
      await press.deferUpdate().catch(() => {});
      wanted.resolve({ kind: press.customId === HIT_ID ? 'hit' : press.customId === STAND_ID ? 'stand' : 'double', interaction: press });
    })();
  });

  /** Waits for the player of `seat` to press a button, until `deadline`. */
  const waitForAction = (seat: number, deadline: number): Promise<Action> =>
    new Promise<Action>((resolve) => {
      if (!ui) {
        resolve({ kind: 'timeout' });
        return;
      }
      const timer = setTimeout(
        () => {
          if (waiter === entry) waiter = null;
          resolve({ kind: 'timeout' });
        },
        Math.max(1, deadline - Date.now()),
      );
      const entry = {
        seat,
        resolve: (action: Action) => {
          clearTimeout(timer);
          resolve(action);
        },
      };
      waiter = entry;
    });

  try {
    // The cards go out one at a time.
    const opening = `${TEXT.blackjack.dealing(players.length)}`;
    for (const target of round.dealOrder()) {
      round.deal(target);
      await show(view({ headline: opening, hideHole: true }));
      await pause(BLACKJACK.dealMs);
    }
    round.settleNaturals();

    if (round.dealerHasBlackjack()) {
      // Nobody plays: the dealer turns the card over, and only a blackjack of their own saves a player.
      await show(view({ headline: TEXT.blackjack.dealerBlackjack, lines: true }));
      await pause(BLACKJACK.dealerMs);
    } else {
      /** Said above the next thing that is shown, once: a player who timed out. */
      let note = '';
      for (let seat = round.nextToPlay(-1); seat !== -1; seat = round.nextToPlay(seat)) {
        currentSeat = seat;
        const player = players[seat] as TablePlayer;
        while (round.isActive(seat)) {
          const deadline = Date.now() + CONFIG.blackjack.turnSeconds * 1000;
          const turn = TEXT.blackjack.turn(mention(player.userId), `<t:${Math.ceil(deadline / 1000)}:R>`);
          // Ready for a press before the buttons appear, so a quick press is never missed.
          const pending = waitForAction(seat, deadline);
          await show(view({ headline: note ? `${note}\n${turn}` : turn, active: seat, hideHole: true, lines: true, components: turnButtons(round, seat) }));
          note = '';

          const action = await pending;
          if (action.kind === 'timeout') {
            if (ui) note = TEXT.blackjack.timedOut(mention(player.userId));
            round.stand(seat);
          } else if (action.kind === 'hit') {
            round.hit(seat);
          } else if (action.kind === 'stand') {
            round.stand(seat);
          } else if (round.canDouble(seat)) {
            const doubled = await doubleBet(player.betId);
            if (doubled.ok) {
              player.bet = doubled.bet;
              round.double(seat);
            } else if (doubled.reason === 'too_poor') {
              await action.interaction
                .followUp({ content: TEXT.blackjack.doubleCantAfford(fmt(round.seat(seat).bet), fmt(doubled.balance)), flags: MessageFlags.Ephemeral })
                .catch(() => {});
            } else {
              // The bet was already returned (this table looked dead for a while): they can't play on.
              returned.add(seat);
              round.stand(seat);
            }
          }
        }
        waiter = null;
        currentSeat = -1;
      }

      // The dealer turns the hidden card over and draws.
      await show(view({ headline: note ? `${note}\n${TEXT.blackjack.dealerPlays}` : TEXT.blackjack.dealerPlays, lines: true }));
      await pause(BLACKJACK.dealerMs);
      if (round.dealerMustPlay()) {
        while (round.dealerDraw()) {
          await show(view({ headline: TEXT.blackjack.dealerPlays, lines: true }));
          await pause(BLACKJACK.dealerMs);
        }
      }
    }

    // Everyone is paid.
    const outcomes = round.outcomes();
    const results: RoundResult[] = [];
    for (let i = 0; i < players.length; i++) {
      const player = players[i] as TablePlayer;
      const seat = round.seat(i);
      const outcome = outcomes[i] as Outcome;
      const total = handValue(seat.cards).total;
      const payout = payoutFor(seat.bet, outcome, CONFIG.blackjack.naturalPayout);
      let paid: { ok: true; balance: number } | { ok: false } | 'failed' = { ok: false };
      if (!returned.has(i)) {
        try {
          paid = await settleBet(player.betId, payout);
        } catch (err) {
          // The service kept the points for the sweeper; the player is told the result all the same.
          console.error(`Could not settle the blackjack bet of ${player.userId}:`, err);
          paid = 'failed';
        }
      }
      if (paid !== 'failed' && !paid.ok) {
        results.push({ userId: player.userId, outcome: 'returned', bet: seat.bet, payout: 0, net: 0, total, balance: null });
      } else {
        results.push({ userId: player.userId, outcome, bet: seat.bet, payout, net: payout - seat.bet, total, balance: paid === 'failed' ? null : paid.balance });
      }
    }

    await show(view({ headline: '', hideHole: false, outcomes, results, components: options.finalComponents?.(results) ?? [] }));
    return results;
  } catch (err) {
    console.error('A blackjack round failed, returning the bets:', err);
    await Promise.all(
      players.map((p) =>
        refundBet(p.betId).catch((refundErr) => console.error(`Could not return the blackjack bet of ${p.userId} (the sweeper will):`, refundErr)),
      ),
    );
    const cancelled = createEmbed().setTitle(TEXT.blackjack.title).setDescription(TEXT.blackjack.cancelled);
    try {
      await message.edit({ embeds: [cancelled], files: [], attachments: [], components: [] });
    } catch {
      // The message is gone; nothing more to tell.
    }
    return null;
  } finally {
    collector.stop();
  }
}
