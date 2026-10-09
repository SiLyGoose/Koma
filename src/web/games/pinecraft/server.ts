import { randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import { CONFIG } from '../../../config.js';
import { DEFAULT_OUTFIT } from '../../../data/outfits.js';
import { MINE_WEB, PINECRAFT_BREAK_MS, PINECRAFT_WEB, PINECRAFT_WORLD } from '../../../constants/index.js';
import { gearEffects } from '../../../lib/game/items/equipment.js';
import { onGearChange } from '../../../services/items/gear-events.js';
import { breakMs, energyNow, gearBreakMs, indexOf, mapRows, move, newWorld, NO_GEAR, pinecraftGear, pinecraftWeek, SPAWN, stepFrom, viewRows, withGear, type PinecraftGear, type PinecraftRules } from '../../../lib/game/pinecraft.js';
import type { EffectTotals } from '../../../perks/index.js';
import { getEquipment } from '../../../services/items/equipment.js';
import { getBalance } from '../../../services/economy/index.js';
import { outfitOf } from '../../../services/outfits.js';
import { loadWorld, newWeek, payOre, saveDig, saveWhere, type LoadedWorld } from '../../../services/pinecraft.js';
import { parseClientMessage, type ClientMessage, type ErrorCode, type PinecraftPickaxe, type ServerMessage, type WorldEvent, type WorldState } from './protocol.js';
import { openGameConnection, refuse as refuseConnection, serveSocket, type Peer as ConnectionPeer } from '../connection.js';
import { toWatchers } from '../live.js';
import { playerKey, type Player } from '../../auth/token.js';

/*
 * The web socket Pinecraft's page plays through (connection.ts does the greeting and watching). Once
 * the player says hello their world is loaded and they can move. One page per player: a new one takes over from
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
export type Peer = ConnectionPeer<ServerMessage>;

/** The database side, so tests can stand in for it. */
export interface PinecraftDeps {
  load: (guildId: string, userId: string, rules: PinecraftRules) => Promise<LoadedWorld>;
  saveDig: typeof saveDig;
  saveWhere: typeof saveWhere;
  newWeek: typeof newWeek;
  payOre: typeof payOre;
  balance: (guildId: string, userId: string) => Promise<number>;
  rules: () => PinecraftRules;
  /** The perks of the member's equipped gear, the id of their weapon (null for none), and the outfit they wear. */
  gear: (guildId: string, userId: string) => Promise<{ effects: Partial<EffectTotals>; weapon: string | null; outfit: string }>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Random numbers from 0 up to 1 (a lucky ore). */
  chance: () => number;
}

const realDeps: PinecraftDeps = {
  load: loadWorld,
  saveDig,
  saveWhere,
  newWeek,
  payOre,
  balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
  rules: () => CONFIG.pinecraft,
  gear: async (guildId, userId) => {
    const [equipment, outfit] = await Promise.all([getEquipment(guildId, userId), outfitOf(guildId, userId)]);
    return { effects: gearEffects(equipment, userId), weapon: equipment.weapon ?? null, outfit };
  },
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  chance: Math.random,
};

/** The pickaxe drawn for each weapon that is one; any other weapon (or none) gets the wooden one. */
const PICKAXE_OF: Readonly<Record<string, PinecraftPickaxe>> = {
  'golden-pickaxe': 'gold',
  'diamond-pickaxe': 'diamond',
  'ruby-pickaxe': 'ruby',
  'amethyst-pickaxe': 'amethyst',
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
  private pickaxe: PinecraftPickaxe = 'wood';
  private outfit = DEFAULT_OUTFIT;
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
      const { effects, weapon, outfit } = await this.deps.gear(this.player.guildId, this.player.userId);
      this.gear = pinecraftGear(effects);
      this.pickaxe = (weapon !== null && PICKAXE_OF[weapon]) || 'wood';
      this.outfit = outfit;
    } catch (err) {
      console.error('Could not look up the gear of a Pinecraft miner:', err);
    }
  }

  /**
   * A page is playing this world: it gets every message about it from now on, starting with the
   * world as it is, with the member's gear looked up fresh (they may have changed it since this world
   * was loaded). Resolves once that has been sent.
   */
  attach(peer: Peer): Promise<void> {
    this.peer = peer;
    this.queue = this.queue.then(async () => {
      await this.refreshGear(true);
      if (peer === this.peer) peer.send({ t: 'state', seq: 0, state: this.view() });
    });
    return this.queue;
  }

  /**
   * The member's gear changed (gear-events.ts): it's looked up again, and the page is sent the world
   * with it, as an answer to none of its moves (seq -1), so the miner stays where the page has them.
   */
  gearChanged(): Promise<void> {
    this.queue = this.queue.then(async () => {
      await this.refreshGear(true);
      this.peer?.send({ t: 'state', seq: -1, state: this.view() });
    });
    return this.queue;
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

  /**
   * A new week since the world was loaded: it starts over (a new seed, nothing dug, the miner back in
   * the room; energy kept). True when it did.
   */
  private async rollOver(): Promise<boolean> {
    const week = pinecraftWeek(this.deps.now()).key;
    if (week === this.loaded.week) return false;
    const old = this.loaded.world;
    const fresh = newWorld(randomInt(0, 2 ** 32), this.deps.rules(), this.deps.now());
    this.loaded.world = { ...fresh, energy: old.energy, energyAt: old.energyAt };
    this.loaded.week = week;
    this.breaking = null;
    await this.deps.newWeek(this.player.guildId, this.player.userId, this.loaded.world, week);
    return true;
  }

  private async apply(peer: Peer, message: Extract<ClientMessage, { t: 'move' }>): Promise<void> {
    if (peer !== this.peer) return;
    // A new week: the move is dropped, and the page is shown the new mine.
    if (await this.rollOver()) return peer.send({ t: 'state', seq: message.seq, state: this.view() });
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
        free: result.free,
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
      week: this.loaded.week,
      resetsAt: pinecraftWeek(now).next.getTime(),
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
      pickaxe: this.pickaxe,
      outfit: this.outfit,
    };
  }
}

/** Every world being played, by player (playerKey): loading, or loaded. */
const sessions = new Map<string, Promise<PinecraftSession>>();

/** The world a member is playing right now, if it's loaded. */
export const findPinecraftSession = (guildId: string, userId: string): Promise<PinecraftSession> | undefined => sessions.get(playerKey({ guildId, userId }));

// A miner playing when their gear changes (on the site, or in Discord) gets it at once.
onGearChange((guildId, userId) => {
  void findPinecraftSession(guildId, userId)
    ?.then((session) => session.gearChanged())
    .catch((err) => console.error('Could not give a Pinecraft miner their new gear:', err));
});

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

const refuse: (peer: Peer, code: ErrorCode) => void = refuseConnection;

/** Plays Pinecraft over a web socket just opened (server.ts has checked where it came from). */
export function servePinecraft(socket: WebSocket, deps: PinecraftDeps = realDeps): void {
  serveSocket<ServerMessage>(socket, (page) => {
    let session: PinecraftSession | null = null;
    /** When a watcher last asked for the player's map. */
    let mapAt = 0;

    return openGameConnection(
      { live: 'pinecraft', limits: MINE_WEB, parse: parseClientMessage, describe: (m) => describe(m as ServerMessage) },
      page,
      {
        async hello(hello) {
          let loaded: PinecraftSession;
          try {
            loaded = await sessionFor(hello.player, deps);
          } catch (err) {
            console.error('Could not load a Pinecraft world:', err);
            return refuse(page, 'failed');
          }
          if (hello.gone) return;
          session = loaded;
          const peer = hello.join();
          const before = session.peer;
          const attached = session.attach(peer);
          if (before && before !== peer) refuse(before, 'replaced');
          await attached;
        },

        async message(player, peer, message) {
          if (!session || session.peer !== peer) return refuse(page, 'bad_message');
          if (message.t === 'mine') {
            toWatchers('pinecraft', player.guildId, player.userId, { t: 'breaking', dir: message.dir });
            return void (await session.startBreaking(peer, message.dir));
          }
          if (message.t === 'map') return void (await session.sendMap(peer));
          await session.handle(peer, message);
        },

        // Watching: the only thing a watcher can ask for is the player's map (once a second at most).
        async watching(target, watcher, message) {
          if (message.t !== 'map' || Date.now() - mapAt < 1000) return;
          mapAt = Date.now();
          const theirs = await findPinecraftSession(target.guildId, target.userId)?.catch(() => undefined);
          if (theirs) watcher.send({ t: 'map', map: theirs.mapNow() });
        },

        left(_player, peer) {
          if (session) void leave(session, peer);
        },
      },
    );
  });
}
