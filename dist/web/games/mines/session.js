import { CONFIG } from '../../../config.js';
import { MINE, MINE_MINES, MINE_SIZE, MINE_TILES } from '../../../constants/index.js';
import { allBet } from '../../../lib/game/casino/bet.js';
import { multiplierFor, payoutFor, pick, randomHidden, startRun } from '../../../lib/game/casino/mines.js';
import { getBalance } from '../../../services/economy/index.js';
import { claimMiner, releaseMiner, renewMineLease, saveMultiplier, settleRun, startMineRun } from '../../../services/casino/mines.js';
import { refuse as refuseConnection } from '../connection.js';
import { playerKey } from '../../auth/token.js';
const realDeps = { settle: settleRun, save: saveMultiplier, renew: renewMineLease };
/** Every run being played on the web, by player (playerKey). */
const sessions = new Map();
/** The run a member is playing on the web, if any. */
export const findSession = (player) => sessions.get(playerKey(player));
export class MineSession {
    deps;
    ended;
    runId;
    player;
    bet;
    finish;
    balance;
    run;
    rules;
    status = 'playing';
    payout = null;
    peer = null;
    /** Messages are worked out one at a time, in the order they came. */
    queue = Promise.resolve();
    idle = null;
    beat;
    constructor(init, deps = realDeps) {
        this.deps = deps;
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
    /** How many mines the round has, the gems turned over, and the multiplier reached. */
    get mines() {
        return this.run.mines;
    }
    get gems() {
        return this.run.gems;
    }
    get multiplier() {
        return this.run.multiplier;
    }
    get over() {
        return this.status !== 'playing';
    }
    /**
     * A page is playing this run: it is sent the run as it is (after its message `seq`, 0 when it
     * just connected), and gets every message about it from now on. The server makes sure only one
     * page per player is connected.
     */
    attach(peer, seq = 0) {
        this.peer = peer;
        peer.send({ t: 'state', seq, state: this.view() });
    }
    /** The page went away. The run goes on (and cashes out by itself if it isn't picked up again). */
    detach(peer) {
        if (this.peer === peer)
            this.peer = null;
    }
    /** A pick or cash out from the page. Resolves once it has been worked out. */
    handle(peer, message) {
        this.queue = this.queue.then(() => this.apply(peer, message)).catch((err) => this.fail(err));
        return this.queue;
    }
    async apply(peer, message) {
        if (this.over || peer !== this.peer)
            return;
        this.resetIdle();
        if (message.t === 'cashout') {
            // Like Stake: nothing to cash out before the first gem.
            if (this.run.gems === 0)
                return peer.send({ t: 'state', seq: message.seq, state: this.view() });
            return this.end('cashed', { kind: 'cashout' }, message.seq);
        }
        const index = message.index === 'random' ? randomHidden(this.run) : message.index;
        const result = index === null ? { kind: 'taken' } : pick(this.run, index, this.rules);
        if (result.kind === 'taken')
            return peer.send({ t: 'state', seq: message.seq, state: this.view() });
        if (result.kind === 'boom')
            return this.end('boom', { kind: 'boom', index: index }, message.seq);
        const saved = await this.deps.save(this.runId, this.run.multiplier);
        // Gone from the database: the sweeper already cashed it out, so there is nothing left to play.
        if (!saved)
            return this.close('failed', null, { kind: 'failed' }, message.seq);
        // The last gem, or the cap: cashed out by itself (the page is shown the gem first).
        if (result.done) {
            peer.send({ t: 'state', seq: message.seq, state: this.view(), event: { kind: 'gem', index: index } });
            return this.end('done', { kind: result.done }, message.seq);
        }
        peer.send({ t: 'state', seq: message.seq, state: this.view(), event: { kind: 'gem', index: index } });
    }
    /** Settles the run and tells the page and whoever started it. */
    async end(status, event, seq) {
        this.status = status;
        const settled = await this.deps.settle(this.runId, status === 'boom' ? 0 : this.run.multiplier);
        this.close(status, settled.ok ? settled : null, event, seq);
    }
    close(status, settled, event, seq) {
        this.status = status;
        this.payout = settled?.payout ?? null;
        if (settled)
            this.balance = settled.balance;
        clearInterval(this.beat);
        if (this.idle)
            clearTimeout(this.idle);
        if (sessions.get(playerKey(this.player)) === this)
            sessions.delete(playerKey(this.player));
        this.peer?.send({ t: 'state', seq, state: this.view(), event });
        this.finish({ status, settled });
    }
    /** Something went wrong partway: cash out at the multiplier reached (the sweeper does it if even that fails). */
    async fail(err) {
        console.error('A mine run on the web failed:', err);
        if (this.over && findSession(this.player) !== this)
            return;
        let settled = null;
        try {
            const result = await this.deps.settle(this.runId, this.run.status === 'boom' ? 0 : this.run.multiplier);
            if (result.ok)
                settled = result;
        }
        catch (again) {
            console.error('Could not cash out a failed mine run (the sweeper will):', again);
        }
        this.close('failed', settled, { kind: 'failed' }, 0);
    }
    resetIdle() {
        if (this.idle)
            clearTimeout(this.idle);
        this.idle = setTimeout(() => {
            this.queue = this.queue.then(() => (this.over ? undefined : this.end('idle', { kind: 'idle' }, 0))).catch((err) => this.fail(err));
        }, MINE.idleMs);
        this.idle.unref();
    }
    /** The round as the page may see it: only what has been turned over, until the round is over. */
    view() {
        const { run, rules, bet } = this;
        const reveal = this.over;
        const tiles = run.mine.map((mine, i) => (!reveal && !run.revealed[i] ? null : mine ? 'mine' : 'gem'));
        const more = run.gems < MINE_TILES - run.mines && run.multiplier < rules.maxMultiplier;
        return {
            player: this.player.name,
            size: MINE_SIZE,
            mines: run.mines,
            tiles,
            revealed: [...run.revealed],
            gems: run.gems,
            bet,
            balance: this.balance,
            multiplier: run.multiplier,
            next: more ? multiplierFor(rules, run.mines, run.gems + 1) : null,
            cashOut: payoutFor(bet, run.multiplier),
            maxMultiplier: rules.maxMultiplier,
            status: this.status,
            payout: this.payout,
            idleMs: MINE.idleMs,
        };
    }
}
/** Tells a page why it can't play, and hangs up. */
export const refuse = refuseConnection;
/** What the lobby shows `player`: their balance, what a bet can be, and how the multipliers work. */
export async function lobbyFor(player, lastBet, lastMines = null) {
    const cfg = CONFIG.mines;
    const { points } = await getBalance(player.guildId, player.userId);
    return {
        player: player.name,
        balance: points,
        minBet: cfg.minBet,
        maxBet: cfg.maxBet,
        lastBet,
        lastMines,
        minMines: MINE_MINES.min,
        maxMines: MINE_MINES.max,
        edgeFewest: cfg.edgeFewest,
        edgeMost: cfg.edgeMost,
        maxMultiplier: cfg.maxMultiplier,
    };
}
/** A mine count kept to what a round can have. */
export const clampMines = (mines) => Math.min(MINE_MINES.max, Math.max(MINE_MINES.min, Math.round(mines)));
/**
 * Starts a round: takes the bet ("all" is as much as they have, within the limits) and hides `mines`
 * mines (kept to what a round can have). Refused when the bet can't be taken or they already have a
 * round going (in Discord too). Their "playing" mark (claimMiner) is held until the round is over.
 */
export async function startWebRun(player, wanted, mines) {
    const { guildId, userId } = player;
    if (!claimMiner(guildId, userId))
        return { ok: false, reason: 'busy' };
    try {
        const cfg = CONFIG.mines;
        const bet = wanted === 'all' ? allBet((await getBalance(guildId, userId)).points, cfg.minBet, cfg.maxBet) : wanted;
        const started = await startMineRun(guildId, userId, bet);
        if (!started.ok) {
            releaseMiner(guildId, userId);
            return started;
        }
        // The round keeps the settings it started with, whatever is changed while it is played.
        const rules = { edgeFewest: cfg.edgeFewest, edgeMost: cfg.edgeMost, maxMultiplier: cfg.maxMultiplier };
        const session = new MineSession({ runId: started.runId, player, bet: started.bet, balance: started.balance, run: startRun(clampMines(mines)), rules });
        void session.ended.finally(() => releaseMiner(guildId, userId));
        return { ok: true, session };
    }
    catch (err) {
        releaseMiner(guildId, userId);
        throw err;
    }
}
//# sourceMappingURL=session.js.map