import { CONFIG } from '../config.js';
import { MINE, MINE_SIZE } from '../constants/index.js';
import { allBet } from '../lib/game/bet.js';
import { dynamiteOn, payoutFor, startRun, step, type MineRules, type MineRun } from '../lib/game/mine.js';
import { getBalance } from '../services/economy/index.js';
import { claimMiner, releaseMiner, renewMineLease, saveMultiplier, settleRun, startMineRun, type SettleRunResult } from '../services/mine.js';
import type { ClientMessage, ErrorCode, Lobby, RunEvent, RunState, RunStatus, SeenTile, ServerMessage, StartRefusal } from './mine-protocol.js';
import { playerKey, type Player } from './token.js';

/*
 * A run in the mine played from the web page: the bot keeps the field and works out every move,
 * the page only shows what it is told (see mine-protocol.ts). One session per run, looked up by the
 * player it belongs to. The page can connect, drop and connect again for as long as the run lasts.
 * A run is started either by the mine command in Discord, or from the page's lobby (startWebRun).
 *
 * The run ends with dynamite, a cash out, or MINE.idleMs without a move (which cashes out), and is
 * settled here: `ended` then says how, for whoever started it to show.
 */

/** Where the session sends its messages: a WebSocket, or a fake one in tests. */
export interface Peer {
  send(message: ServerMessage): void;
  close(): void;
}

/** How a run ended, and what it paid (null when it had already been settled elsewhere, or couldn't be). */
export interface RunEnd {
  status: Exclude<RunStatus, 'digging'>;
  settled: Extract<SettleRunResult, { ok: true }> | null;
}

/** The points side, so tests can stand in for the database. */
export interface SessionDeps {
  settle: typeof settleRun;
  save: typeof saveMultiplier;
  renew: typeof renewMineLease;
}

const realDeps: SessionDeps = { settle: settleRun, save: saveMultiplier, renew: renewMineLease };

/** What a session is made from: the run, who plays it, and the bet taken for it. */
export interface SessionInit {
  runId: string;
  player: Player;
  bet: number;
  /** Their points after the bet was taken. */
  balance: number | null;
  run: MineRun;
  rules: MineRules;
}

type Play = Extract<ClientMessage, { t: 'move' | 'cashout' }>;

/** Every run being played on the web, by player (playerKey). */
const sessions = new Map<string, MineSession>();

/** The run a member is playing on the web, if any. */
export const findSession = (player: Pick<Player, 'guildId' | 'userId'>): MineSession | undefined => sessions.get(playerKey(player));

export class MineSession {
  readonly ended: Promise<RunEnd>;
  readonly runId: string;
  readonly player: Player;
  readonly bet: number;
  private finish!: (end: RunEnd) => void;
  private balance: number | null;
  private readonly run: MineRun;
  private readonly rules: MineRules;
  private status: RunStatus = 'digging';
  private payout: number | null = null;
  private peer: Peer | null = null;
  /** Messages are worked out one at a time, in the order they came. */
  private queue: Promise<void> = Promise.resolve();
  private idle: NodeJS.Timeout | null = null;
  private readonly beat: NodeJS.Timeout;

  constructor(
    init: SessionInit,
    private readonly deps: SessionDeps = realDeps,
  ) {
    this.runId = init.runId;
    this.player = init.player;
    this.bet = init.bet;
    this.balance = init.balance;
    this.run = init.run;
    this.rules = init.rules;
    this.ended = new Promise((resolve) => (this.finish = resolve));
    sessions.set(playerKey(this.player), this);
    this.beat = setInterval(() => {
      this.deps.renew(this.runId).catch((err) => console.error('Could not renew the lease of a mine run:', err));
    }, MINE.heartbeatMs);
    this.beat.unref();
    this.resetIdle();
  }

  get over(): boolean {
    return this.status !== 'digging';
  }

  /**
   * A page is playing this run: it is sent the run as it is (after its message `seq`, 0 when it
   * just connected), and gets every message about it from now on. The server makes sure only one
   * page per player is connected.
   */
  attach(peer: Peer, seq = 0): void {
    this.peer = peer;
    peer.send({ t: 'state', seq, state: this.view() });
  }

  /** The page went away. The run goes on (and cashes out by itself if it isn't picked up again). */
  detach(peer: Peer): void {
    if (this.peer === peer) this.peer = null;
  }

  /** A move or cash out from the page. Resolves once it has been worked out. */
  handle(peer: Peer, message: Play): Promise<void> {
    this.queue = this.queue.then(() => this.apply(peer, message)).catch((err) => this.fail(err));
    return this.queue;
  }

  private async apply(peer: Peer, message: Play): Promise<void> {
    if (this.over || peer !== this.peer) return;
    this.resetIdle();
    if (message.t === 'cashout') return this.end('cashed', { kind: 'cashout' }, message.seq);

    const result = step(this.run, message.dir, this.rules);
    if (result.kind === 'boom') return this.end('boom', { kind: 'boom' }, message.seq);
    if (result.kind === 'ore' || result.kind === 'cleared') {
      const saved = await this.deps.save(this.runId, this.run.multiplier);
      // Gone from the database: the sweeper already cashed it out, so there is nothing left to play.
      if (!saved) return this.close('failed', null, { kind: 'failed' }, message.seq);
    }
    peer.send({ t: 'state', seq: message.seq, state: this.view(), event: result });
  }

  /** Settles the run and tells the page and whoever started it. */
  private async end(status: RunEnd['status'], event: RunEvent, seq: number): Promise<void> {
    this.status = status;
    const settled = await this.deps.settle(this.runId, status === 'boom' ? 0 : this.run.multiplier);
    this.close(status, settled.ok ? settled : null, event, seq);
  }

  private close(status: RunEnd['status'], settled: RunEnd['settled'], event: RunEvent, seq: number): void {
    this.status = status;
    this.payout = settled?.payout ?? null;
    if (settled) this.balance = settled.balance;
    clearInterval(this.beat);
    if (this.idle) clearTimeout(this.idle);
    if (sessions.get(playerKey(this.player)) === this) sessions.delete(playerKey(this.player));
    this.peer?.send({ t: 'state', seq, state: this.view(), event });
    this.finish({ status, settled });
  }

  /** Something went wrong partway: cash out at the multiplier reached (the sweeper does it if even that fails). */
  private async fail(err: unknown): Promise<void> {
    console.error('A mine run on the web failed:', err);
    if (this.over && findSession(this.player) !== this) return;
    let settled: RunEnd['settled'] = null;
    try {
      const result = await this.deps.settle(this.runId, this.run.status === 'boom' ? 0 : this.run.multiplier);
      if (result.ok) settled = result;
    } catch (again) {
      console.error('Could not cash out a failed mine run (the sweeper will):', again);
    }
    this.close('failed', settled, { kind: 'failed' }, 0);
  }

  private resetIdle(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      this.queue = this.queue.then(() => (this.over ? undefined : this.end('idle', { kind: 'idle' }, 0))).catch((err) => this.fail(err));
    }, MINE.idleMs);
    this.idle.unref();
  }

  /** The run as the page may see it: only what has been dug, until the run is over. */
  view(): RunState {
    const { run, rules, bet } = this;
    const reveal = this.over;
    const tiles: SeenTile[] = run.tiles.map((tile, i) => (!reveal && !run.dug[i] ? null : tile.kind === 'ore' ? tile.ore : tile.kind));
    return {
      player: this.player.name,
      size: MINE_SIZE,
      tiles,
      dug: [...run.dug],
      pos: run.pos,
      field: run.field,
      oresLeft: run.oresLeft,
      dynamite: dynamiteOn(rules, run.field),
      bet,
      balance: this.balance,
      multiplier: run.multiplier,
      cashOut: payoutFor(bet, run.multiplier),
      status: this.status,
      payout: this.payout,
      idleMs: MINE.idleMs,
      values: { ...rules.value },
      fieldBonus: rules.fieldBonus,
    };
  }
}

/** Tells a page why it can't play, and hangs up. */
export function refuse(peer: Peer, code: ErrorCode): void {
  peer.send({ t: 'error', code });
  peer.close();
}

/** What the lobby shows `player`: their balance, what a bet can be, and how a new run is laid out. */
export async function lobbyFor(player: Player, lastBet: number | null): Promise<Lobby> {
  const cfg = CONFIG.mine;
  const { points } = await getBalance(player.guildId, player.userId);
  return {
    player: player.name,
    balance: points,
    minBet: cfg.minBet,
    maxBet: cfg.maxBet,
    lastBet,
    ores: cfg.ores,
    dynamite: dynamiteOn(cfg, 1),
    values: { ...cfg.value },
    fieldBonus: cfg.fieldBonus,
  };
}

export type WebStart = { ok: true; session: MineSession } | ({ ok: false } & StartRefusal);

/**
 * Starts a run from the page's lobby: takes the bet ("all" is as much as they have, within the
 * limits) and lays out the first field. Refused when the bet can't be taken or they already have a
 * run going (in Discord too). Their "playing" mark (claimMiner) is held until the run is over.
 */
export async function startWebRun(player: Player, wanted: number | 'all'): Promise<WebStart> {
  const { guildId, userId } = player;
  if (!claimMiner(guildId, userId)) return { ok: false, reason: 'busy' };
  try {
    const cfg = CONFIG.mine;
    const bet = wanted === 'all' ? allBet((await getBalance(guildId, userId)).points, cfg.minBet, cfg.maxBet) : wanted;
    const started = await startMineRun(guildId, userId, bet);
    if (!started.ok) {
      releaseMiner(guildId, userId);
      return started;
    }
    // The run keeps the settings it started with, whatever is changed while it is played.
    const rules: MineRules = structuredClone(cfg);
    const session = new MineSession({ runId: started.runId, player, bet: started.bet, balance: started.balance, run: startRun(rules), rules });
    void session.ended.finally(() => releaseMiner(guildId, userId));
    return { ok: true, session };
  } catch (err) {
    releaseMiner(guildId, userId);
    throw err;
  }
}
