import type { WebSocket } from 'ws';
import { CONFIG } from '../config.js';
import { MINE_WEB, PINECRAFT_BREAK_MS, PINECRAFT_WEB, PINECRAFT_WORLD } from '../constants/index.js';
import { gearEffects } from '../lib/game/equipment.js';
import { breakMs, energyNow, gearBreakMs, indexOf, mapRows, move, NO_GEAR, pinecraftGear, SPAWN, stepFrom, viewRows, withGear, type PinecraftGear, type PinecraftRules } from '../lib/game/pinecraft.js';
import type { EffectTotals } from '../perks/index.js';
import { getEquipment } from '../services/equipment.js';
import { getBalance } from '../services/economy/index.js';
import { loadWorld, payOre, saveDig, saveWhere, type LoadedWorld } from '../services/pinecraft.js';
import { parseClientMessage, type ClientMessage, type ErrorCode, type ServerMessage, type WorldEvent, type WorldState } from './pinecraft-protocol.js';
import { addWatcher, playerJoined, playerLeft, removeWatcher, toWatchers } from './live.js';
import { playerKey, verifyToken, verifyWatchToken, type Player } from './token.js';

/*
 * The web socket Pinecraft's page plays through (server.ts takes the connections, and only from the
 * site). A connection's first message must be `hello` with the token from the player's link; then
 * the player's world is loaded and they can move. One page per player: a new one takes over from
 * the one before, carrying on with the same world.
 *
 * Blocks take time to break (PINECRAFT_BREAK_MS). The page says when it starts on one (`mine`) and
 * sends the move when it is done; the bot holds that move until the block's time is up, counted from
 * the `mine`, so a page can't break blocks faster than they break.
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
  /** The perks of the member's equipped gear. */
  gear: (guildId: string, userId: string) => Promise<Partial<EffectTotals>>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Random numbers from 0 up to 1 (a lucky ore). */
  chance: () => number;
}

const realDeps: PinecraftDeps = {
  load: loadWorld,
  saveDig,
  saveWhere,
  payOre,
  balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
  rules: () => CONFIG.pinecraft,
  gear: async (guildId, userId) => gearEffects(await getEquipment(guildId, userId), userId),
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  chance: Math.random,
};

/** How often the member's gear is looked up again while they play (they may change it in Discord). */
const GEAR_EVERY_MS = 10_000;

/** How long after the last walk where the miner is gets saved. */
const SAVE_AFTER_MS = 5000;
/** A page is sent the map at most once in this long (it can take a moment to work out for a big one). */
const MAP_EVERY_MS = 1000;

export class PinecraftSession {
  peer: Peer | null = null;
  private queue: Promise<void> = Promise.resolve();
  private saveTimer: NodeJS.Timeout | null = null;
  /** The block the page started breaking (by index), and when. */
  private breaking: { index: number; since: number } | null = null;
  private mapSentAt = -Infinity;
  private gear: PinecraftGear = NO_GEAR;
  private gearAt = -Infinity;

  constructor(
    readonly player: Player,
    private readonly loaded: LoadedWorld,
    private balance: number | null,
    private readonly deps: PinecraftDeps = realDeps,
  ) {}

  /**
   * Looks up the member's gear again when it is GEAR_EVERY_MS old (or `force`d). A failed look-up
   * keeps the gear known last.
   */
  async refreshGear(force = false): Promise<void> {
    const now = this.deps.now();
    if (!force && now - this.gearAt < GEAR_EVERY_MS) return;
    this.gearAt = now;
    try {
      this.gear = pinecraftGear(await this.deps.gear(this.player.guildId, this.player.userId));
    } catch (err) {
      console.error('Could not look up the gear of a Pinecraft miner:', err);
    }
  }

  /** A page is playing this world: it is sent the world as it is, and gets every message about it from now on. */
  attach(peer: Peer): void {
    this.peer = peer;
    peer.send({ t: 'state', seq: 0, state: this.view() });
  }

  /** The page starts breaking the block `dir` of the miner. */
  startBreaking(peer: Peer, dir: Extract<ClientMessage, { t: 'mine' }>['dir']): Promise<void> {
    // Timed from when it came, but worked out after any move before it (which moves the miner).
    const since = this.deps.now();
    this.queue = this.queue.then(() => {
      if (peer !== this.peer) return;
      const { x, y } = stepFrom(this.loaded.world, dir);
      this.breaking = breakMs(this.loaded.world, x, y) === null ? null : { index: indexOf(x, y), since };
    });
    return this.queue;
  }

  /** The map, for someone watching (they ask for it themselves; see servePinecraft). */
  mapNow(): ReturnType<typeof mapRows> {
    return mapRows(this.loaded.world);
  }

  /** The page asks for the map. Resolves once it has been sent (or not, when asked for again too soon). */
  sendMap(peer: Peer): Promise<void> {
    this.queue = this.queue.then(() => {
      const now = this.deps.now();
      if (peer !== this.peer || now - this.mapSentAt < MAP_EVERY_MS) return;
      this.mapSentAt = now;
      peer.send({ t: 'map', map: mapRows(this.loaded.world) });
    });
    return this.queue;
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
    // Into a block: not until it has had its time to break, from when the page started on it.
    await this.refreshGear();
    const at = stepFrom(world, message.dir);
    const base = breakMs(world, at.x, at.y);
    const takes = base === null ? null : gearBreakMs(base, this.gear);
    if (takes !== null) {
      const index = indexOf(at.x, at.y);
      const since = this.breaking?.index === index ? this.breaking.since : this.deps.now();
      const wait = since + takes - PINECRAFT_WEB.breakGraceMs - this.deps.now();
      if (wait > 0) await this.deps.sleep(wait);
      if (peer !== this.peer) return;
    }
    this.breaking = null;
    const result = move(world, message.dir, this.deps.rules(), this.deps.now(), this.gear, this.deps.chance);
    let event: WorldEvent;
    if (result.kind === 'dig') {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.deps.saveDig(guildId, userId, world, result.indices);
      if (result.total > 0) {
        this.balance = await this.deps.payOre(guildId, userId, result.total);
        this.loaded.earned += result.total;
      }
      event = {
        kind: 'dig',
        ground: result.ground,
        ore: result.ore,
        points: result.points,
        lucky: result.lucky,
        blast: result.blast?.map(({ x, y, ground, ore, points, lucky }) => ({ x, y, ground, ore, points, lucky })) ?? null,
      };
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
    const rules = withGear(this.deps.rules(), this.gear);
    const now = this.deps.now();
    const { energy, energyAt } = energyNow(world, rules, now);
    const gear = this.gear;
    const { viewCols, viewRows: rowsAround, look } = PINECRAFT_WEB;
    const left = Math.max(0, world.x - viewCols);
    const top = Math.max(0, world.y - rowsAround);
    const per = rules.energyMinutes * 60_000;
    return {
      player: this.player.name,
      size: PINECRAFT_WORLD.size,
      spawn: { ...SPAWN },
      left,
      top,
      rows: viewRows(world, left, top, world.x + viewCols, world.y + rowsAround, look),
      x: world.x,
      y: world.y,
      energy,
      maxEnergy: rules.maxEnergy,
      nextEnergyMs: energy >= rules.maxEnergy ? null : Math.max(0, energyAt + per - now),
      energyMs: per,
      balance: this.balance,
      earned,
      dug: world.mined.size,
      values: { ...rules.value },
      breakMs: Object.fromEntries(Object.entries(PINECRAFT_BREAK_MS).map(([block, ms]) => [block, gearBreakMs(ms, gear)])) as WorldState['breakMs'],
      oreEnergy: gear.oreEnergy,
      blast: gear.blastEvery > 0 ? { every: gear.blastEvery, left: Math.max(1, gear.blastEvery - world.sinceBlast) } : null,
    };
  }
}

/** Every world being played, by player (playerKey): loading, or loaded. */
const sessions = new Map<string, Promise<PinecraftSession>>();

/** The world a member is playing right now, if it's loaded. */
export const findPinecraftSession = (guildId: string, userId: string): Promise<PinecraftSession> | undefined => sessions.get(playerKey({ guildId, userId }));

/** A few words on what a miner is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'state') return null;
  const { state } = message;
  return `At ${state.x - state.spawn.x},${state.spawn.y - state.y} · ${state.dug.toLocaleString('en-US')} dug · ${state.earned.toLocaleString('en-US')} earned`;
}

/** Loads a player's world, or picks up the one already being played. */
export function sessionFor(player: Player, deps: PinecraftDeps = realDeps): Promise<PinecraftSession> {
  const key = playerKey(player);
  const known = sessions.get(key);
  if (known) return known;
  const loading = (async () => {
    const loaded = await deps.load(player.guildId, player.userId, deps.rules());
    const balance = await deps.balance(player.guildId, player.userId).catch(() => null);
    const session = new PinecraftSession(player, loaded, balance, deps);
    await session.refreshGear(true);
    return session;
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
  const page: Peer = {
    send: (message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
  /** What the game sends through: the page, and (once it's a player's) their watchers too. */
  let peer: Peer = page;
  let session: PinecraftSession | null = null;
  let player: Player | null = null;
  let greeted = false;
  /** Set when this page only watches: whose world, and when it last asked for their map. */
  let watching: { guildId: string; userId: string; mapAt: number } | null = null;

  let budget = MINE_WEB.messagesPerSecond;
  const refill = setInterval(() => (budget = MINE_WEB.messagesPerSecond), 1000);
  refill.unref();
  const hello = setTimeout(() => refuse(page, 'bad_message'), MINE_WEB.helloMs);
  hello.unref();

  socket.on('message', (data, isBinary) => {
    void (async () => {
      if (isBinary || --budget < 0) return refuse(page, 'bad_message');
      const message = parseClientMessage(data.toString());
      if (!message) return refuse(page, 'bad_message');

      // Watching: the only thing a watcher can ask for is the player's map (once a second at most).
      if (watching) {
        if (message.t !== 'map' || Date.now() - watching.mapAt < 1000) return;
        watching.mapAt = Date.now();
        const theirs = await findPinecraftSession(watching.guildId, watching.userId)?.catch(() => undefined);
        if (theirs) page.send({ t: 'map', map: theirs.mapNow() });
        return;
      }

      if (message.t === 'watch') {
        if (greeted) return refuse(page, 'bad_message');
        greeted = true;
        clearTimeout(hello);
        const watch = verifyWatchToken(message.token);
        if (!watch) return refuse(page, 'bad_token');
        const target = { guildId: watch.viewer.guildId, userId: watch.targetId };
        const added = addWatcher('pinecraft', target.guildId, target.userId, page);
        if (!added.ok) return refuse(page, added.reason);
        watching = { ...target, mapAt: 0 };
        return;
      }

      if (message.t === 'hello') {
        if (greeted) return refuse(page, 'bad_message');
        greeted = true;
        clearTimeout(hello);
        const who = verifyToken(message.token);
        if (!who) return refuse(page, 'bad_token');
        try {
          session = await sessionFor(who, deps);
        } catch (err) {
          console.error('Could not load a Pinecraft world:', err);
          return refuse(page, 'failed');
        }
        if (socket.readyState !== socket.OPEN) return;
        player = who;
        peer = playerJoined('pinecraft', who.guildId, who.userId, who.name, page, (m) => describe(m as ServerMessage));
        const before = session.peer;
        session.attach(peer);
        if (before && before !== peer) refuse(before, 'replaced');
        return;
      }

      if (!session || session.peer !== peer || !player) return refuse(page, 'bad_message');
      if (message.t === 'mine') {
        toWatchers('pinecraft', player.guildId, player.userId, { t: 'breaking', dir: message.dir });
        return void (await session.startBreaking(peer, message.dir));
      }
      if (message.t === 'map') return void (await session.sendMap(peer));
      await session.handle(peer, message);
    })();
  });

  socket.on('close', () => {
    clearInterval(refill);
    clearTimeout(hello);
    if (watching) removeWatcher('pinecraft', watching.guildId, watching.userId, page);
    if (session) void leave(session, peer);
    if (player) playerLeft('pinecraft', player.guildId, player.userId, page);
  });
  socket.on('error', () => socket.terminate());
}
