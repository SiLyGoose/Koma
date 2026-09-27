import type { WebSocket } from 'ws';
import { CONFIG } from '../config.js';
import { MINE_WEB, PINECRAFT_ORE_TABLE, PINECRAFT_ORES, PINECRAFT_WEB, PINECRAFT_WORLD, type PinecraftOre } from '../constants/index.js';
import { energyNow, move, viewRows, type PinecraftRules } from '../lib/game/pinecraft.js';
import { getBalance } from '../services/economy/index.js';
import { loadWorld, payOre, saveDig, saveWhere, type LoadedWorld } from '../services/pinecraft.js';
import { parseClientMessage, type ClientMessage, type ErrorCode, type ServerMessage, type WorldEvent, type WorldState } from './pinecraft-protocol.js';
import { playerKey, verifyToken, type Player } from './token.js';

/*
 * The web socket Pinecraft's page plays through (server.ts takes the connections, and only from the
 * site). A connection's first message must be `hello` with the token from the player's link; then
 * the player's world is loaded and they can move. One page per player: a new one takes over from
 * the one before, carrying on with the same world.
 *
 * The world is kept in memory while it is played. A block dug is saved before its ore is paid, and
 * where the miner is gets saved a few seconds after they stop walking, and when the page goes away.
 */

/** Where messages go: a WebSocket, or a fake one in tests. */
export interface Peer {
  send(message: ServerMessage): void;
  close(): void;
}

/** The database side, so tests can stand in for it. */
export interface PinecraftDeps {
  load: (guildId: string, userId: string, rules: PinecraftRules) => Promise<LoadedWorld>;
  saveDig: typeof saveDig;
  saveWhere: typeof saveWhere;
  payOre: typeof payOre;
  balance: (guildId: string, userId: string) => Promise<number>;
  rules: () => PinecraftRules;
  now: () => number;
}

const realDeps: PinecraftDeps = {
  load: loadWorld,
  saveDig,
  saveWhere,
  payOre,
  balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
  rules: () => CONFIG.pinecraft,
  now: Date.now,
};

/** How long after the last walk where the miner is gets saved. */
const SAVE_AFTER_MS = 5000;

const FROM = Object.fromEntries(PINECRAFT_ORES.map((ore) => [ore, PINECRAFT_ORE_TABLE[ore].from])) as Record<PinecraftOre, number>;

export class PinecraftSession {
  peer: Peer | null = null;
  private queue: Promise<void> = Promise.resolve();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly player: Player,
    private readonly loaded: LoadedWorld,
    private balance: number | null,
    private readonly deps: PinecraftDeps = realDeps,
  ) {}

  /** A page is playing this world: it is sent the world as it is, and gets every message about it from now on. */
  attach(peer: Peer): void {
    this.peer = peer;
    peer.send({ t: 'state', seq: 0, state: this.view() });
  }

  /** A move from the page. Resolves once it has been worked out. */
  handle(peer: Peer, message: Extract<ClientMessage, { t: 'move' }>): Promise<void> {
    this.queue = this.queue
      .then(() => this.apply(peer, message))
      .catch((err) => {
        console.error('A Pinecraft move failed:', err);
        peer.send({ t: 'error', code: 'failed' });
        peer.close();
      });
    return this.queue;
  }

  private async apply(peer: Peer, message: Extract<ClientMessage, { t: 'move' }>): Promise<void> {
    if (peer !== this.peer) return;
    const { world } = this.loaded;
    const { guildId, userId } = this.player;
    const result = move(world, message.dir, this.deps.rules(), this.deps.now());
    let event: WorldEvent;
    if (result.kind === 'dig') {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.deps.saveDig(guildId, userId, world, result.index);
      if (result.ore && result.points > 0) {
        this.balance = await this.deps.payOre(guildId, userId, result.ore, result.points);
        this.loaded.earned += result.points;
      }
      event = { kind: 'dig', ground: result.ground, ore: result.ore, points: result.points };
    } else {
      if (result.kind === 'walk') this.saveSoon();
      event = { kind: result.kind };
    }
    peer.send({ t: 'state', seq: message.seq, state: this.view(), event });
  }

  private saveSoon(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), SAVE_AFTER_MS);
    this.saveTimer.unref();
  }

  /** Saves where the miner is (after any move being worked out). */
  save(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.queue = this.queue
      .then(() => this.deps.saveWhere(this.player.guildId, this.player.userId, this.loaded.world))
      .catch((err) => console.error('Could not save where a Pinecraft miner is:', err));
    return this.queue;
  }

  /** The world as the page may see it. */
  view(): WorldState {
    const { world, earned } = this.loaded;
    const rules = this.deps.rules();
    const now = this.deps.now();
    const { energy, energyAt } = energyNow(world, rules, now);
    const top = Math.max(0, world.y - PINECRAFT_WEB.rowsAbove);
    const bottom = Math.min(PINECRAFT_WORLD.depth - 1, world.y + PINECRAFT_WEB.rowsBelow);
    const per = rules.energyMinutes * 60_000;
    return {
      player: this.player.name,
      width: PINECRAFT_WORLD.width,
      depth: PINECRAFT_WORLD.depth,
      sky: PINECRAFT_WORLD.sky,
      top,
      rows: viewRows(world, top, bottom, PINECRAFT_WEB.lookRows),
      x: world.x,
      y: world.y,
      energy,
      maxEnergy: rules.maxEnergy,
      nextEnergyMs: energy >= rules.maxEnergy ? null : Math.max(0, energyAt + per - now),
      energyMs: per,
      balance: this.balance,
      earned,
      values: { ...rules.value },
      from: FROM,
    };
  }
}

/** Every world being played, by player (playerKey): loading, or loaded. */
const sessions = new Map<string, Promise<PinecraftSession>>();

/** Loads a player's world, or picks up the one already being played. */
export function sessionFor(player: Player, deps: PinecraftDeps = realDeps): Promise<PinecraftSession> {
  const key = playerKey(player);
  const known = sessions.get(key);
  if (known) return known;
  const loading = (async () => {
    const loaded = await deps.load(player.guildId, player.userId, deps.rules());
    const balance = await deps.balance(player.guildId, player.userId).catch(() => null);
    return new PinecraftSession(player, loaded, balance, deps);
  })();
  sessions.set(key, loading);
  loading.catch(() => sessions.delete(key));
  return loading;
}

/** The page playing `session` went away: save, and forget the world unless another page took over. */
export async function leave(session: PinecraftSession, peer: Peer): Promise<void> {
  if (session.peer !== peer) return;
  session.peer = null;
  await session.save();
  const key = playerKey(session.player);
  if (session.peer === null && (await sessions.get(key)) === session) sessions.delete(key);
}

function refuse(peer: Peer, code: ErrorCode): void {
  peer.send({ t: 'error', code });
  peer.close();
}

/** Plays Pinecraft over a web socket just opened (server.ts has checked where it came from). */
export function servePinecraft(socket: WebSocket, deps: PinecraftDeps = realDeps): void {
  const peer: Peer = {
    send: (message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
  let session: PinecraftSession | null = null;
  let greeted = false;

  let budget = MINE_WEB.messagesPerSecond;
  const refill = setInterval(() => (budget = MINE_WEB.messagesPerSecond), 1000);
  refill.unref();
  const hello = setTimeout(() => refuse(peer, 'bad_message'), MINE_WEB.helloMs);
  hello.unref();

  socket.on('message', (data, isBinary) => {
    void (async () => {
      if (isBinary || --budget < 0) return refuse(peer, 'bad_message');
      const message = parseClientMessage(data.toString());
      if (!message) return refuse(peer, 'bad_message');

      if (message.t === 'hello') {
        if (greeted) return refuse(peer, 'bad_message');
        greeted = true;
        clearTimeout(hello);
        const player = verifyToken(message.token);
        if (!player) return refuse(peer, 'bad_token');
        try {
          session = await sessionFor(player, deps);
        } catch (err) {
          console.error('Could not load a Pinecraft world:', err);
          return refuse(peer, 'failed');
        }
        if (socket.readyState !== socket.OPEN) return;
        const before = session.peer;
        session.attach(peer);
        if (before && before !== peer) refuse(before, 'replaced');
        return;
      }

      if (!session || session.peer !== peer) return refuse(peer, 'bad_message');
      await session.handle(peer, message);
    })();
  });

  socket.on('close', () => {
    clearInterval(refill);
    clearTimeout(hello);
    if (session) void leave(session, peer);
  });
  socket.on('error', () => socket.terminate());
}
