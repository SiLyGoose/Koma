import type { WebSocket } from 'ws';
import { CODE_LENGTH, CODEDLE_WEB } from '../../../constants/index.js';
import { codedleIn, lastCodedle, onCodedleChange, type CodeGuess, type CodedleEnd, type CodedleGame } from '../../../events/games/codedle-games.js';
import { openGameConnection, refuse, serveSocket, type Connection, type Peer } from '../connection.js';
import { parseClientMessage, type ClientMessage, type CodedleRow, type CodedleState, type ServerMessage } from './protocol.js';

/*
 * The web socket Codedle's page plays through (connection.ts does the greeting). Codedle is a random event, run by its
 * Discord message (events/games/codedle.ts); a page plays the same game (events/games/codedle-games.ts), its guesses
 * charged and scored as the pop-up's are. Every page in a server is told the game again whenever it changes, each with
 * only its own player's guesses until the vault opens. One page per player: a new one takes over. It isn't watched.
 */

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'state') return null;
  const { live } = message.state;
  if (!live) return 'Waiting for the vault';
  return `Cracking the vault · ${live.mine.length} ${live.mine.length === 1 ? 'guess' : 'guesses'}`;
}

/** A guess as a page shows it: with who made it (`named`: a revealed board's), and whether it was the player's. */
const row = (guess: CodeGuess, userId: string, named: boolean): CodedleRow => ({
  guess: guess.guess,
  marks: [...guess.marks],
  ...(named && { name: guess.name ?? 'Someone' }),
  ...(guess.userId === userId && { mine: true }),
});

/** The game as `userId` sees it: the one going on (their own guesses only), and how the last ended (everyone's). */
export function codedleState(userId: string, game: CodedleGame | null, last: CodedleEnd | null): CodedleState {
  return {
    length: CODE_LENGTH,
    boardMax: CODEDLE_WEB.boardMax,
    live: game && {
      prize: game.prize,
      guessCost: game.guessCost,
      endsAt: game.endsAt,
      guesses: game.guesses.length,
      guessers: new Set(game.guesses.map((guess) => guess.userId)).size,
      mine: game.guesses.filter((guess) => guess.userId === userId).map((guess) => row(guess, userId, false)),
    },
    last: last && {
      code: last.code,
      prize: last.prize,
      winner: last.winner?.name ?? null,
      won: last.winner?.userId === userId,
      board: last.guesses.slice(-CODEDLE_WEB.boardMax).map((guess) => row(guess, userId, true)),
      guesses: last.guesses.length,
      endedAt: last.endedAt,
    },
  };
}

/** The page connected for each player, by server and then by player. */
const pages = new Map<string, Map<string, Peer<ServerMessage>>>();

const tell = (guildId: string, userId: string, peer: Peer<ServerMessage>): void =>
  peer.send({ t: 'state', state: codedleState(userId, codedleIn(guildId), lastCodedle(guildId)) });

// A server's game changed: every page there is told it again.
onCodedleChange((guildId) => {
  for (const [userId, peer] of pages.get(guildId) ?? []) tell(guildId, userId, peer);
});

/** Plays Codedle with the page `page`. */
export function openCodedleConnection(page: Peer<ServerMessage>): Connection {
  return openGameConnection<ClientMessage, ServerMessage>(
    { live: 'codedle', limits: CODEDLE_WEB, parse: parseClientMessage, describe: (m) => describe(m as ServerMessage) },
    page,
    {
      async hello(hello) {
        const { guildId, userId } = hello.player;
        const peer = hello.join();
        let here = pages.get(guildId);
        if (!here) pages.set(guildId, (here = new Map()));
        const before = here.get(userId);
        here.set(userId, peer);
        if (before) refuse(before, 'replaced');
        tell(guildId, userId, peer);
      },

      async message(player, peer, message) {
        const game = codedleIn(player.guildId);
        if (!game) return peer.send({ t: 'answer', seq: message.seq, ok: false, reason: 'over' });
        const outcome = await game.guess(player.userId, player.name, message.guess);
        peer.send(outcome.ok ? { t: 'answer', seq: message.seq, ...outcome } : { t: 'answer', seq: message.seq, ok: false, reason: outcome.reason });
      },

      left(player, peer) {
        const here = pages.get(player.guildId);
        if (here?.get(player.userId) !== peer) return;
        here.delete(player.userId);
        if (here.size === 0) pages.delete(player.guildId);
      },
    },
  );
}

/** Plays Codedle over a web socket just opened. */
export function serveCodedle(socket: WebSocket): void {
  serveSocket<ServerMessage>(socket, openCodedleConnection);
}
