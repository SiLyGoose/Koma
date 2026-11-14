import { sumBets } from '../../../lib/game/casino/table-bets.js';
import { getBalance } from '../../../services/economy/index.js';
import { Chat } from '../chat.js';
import { avatarUrl } from '../../auth/login.js';
import { playerKey } from '../../auth/token.js';
/** The deps every game's real tables share: everything but its own play and deal. */
export const realBaseDeps = {
    balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
    avatar: () => null,
    now: Date.now,
    schedule: (ms, run) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => clearTimeout(timer);
    },
};
/** A player's points now, or null when they couldn't be looked up. */
async function lookUpBalance(deps, live, guildId, userId) {
    try {
        return await deps.balance(guildId, userId);
    }
    catch (err) {
        console.error(`Could not look up a ${live} player’s balance:`, err);
        return null;
    }
}
export class PartyTable {
    game;
    guildId;
    number;
    deps;
    onEmpty;
    seats = [];
    phase = 'betting';
    endsAt = 0;
    round = null;
    rounds = 0;
    cancel = null;
    closed = false;
    /** What the players at the table say to each other. */
    chat = new Chat();
    constructor(game, guildId, number, deps, onEmpty, history = { round: null, rounds: 0 }) {
        this.game = game;
        this.guildId = guildId;
        this.number = number;
        this.deps = deps;
        this.onEmpty = onEmpty;
        this.round = history.round;
        this.rounds = history.rounds;
        this.startBetting(false);
    }
    /** Where the table is up to, for the next table opened with its number. */
    get history() {
        return { round: this.round, rounds: this.rounds };
    }
    get players() {
        return this.seats.length;
    }
    get full() {
        return this.seats.length >= this.game.table.seats;
    }
    has(userId) {
        return this.seats.some((s) => s.player.userId === userId);
    }
    /**
     * Seats `player` with `balance` (their points, looked up just now; null when they couldn't be), or,
     * when they already sit here (a reload, another tab), gives their seat to this page. Returns the page
     * it took the seat from, if any (to be told it was replaced).
     */
    sit(player, peer, balance) {
        const existing = this.seats.find((s) => s.player.userId === player.userId);
        if (existing) {
            const before = existing.peer;
            const back = before === null;
            existing.peer = peer;
            existing.player = player;
            existing.awayEnds?.();
            existing.awayEnds = null;
            // Their points may have changed outside the table meanwhile. Not while a round is dealt: settling it has them.
            const moved = balance !== null && this.phase === 'betting' && balance !== existing.balance;
            if (moved)
                existing.balance = balance;
            // Back from away (or with other points): everyone sees it.
            if (back || moved)
                this.broadcast();
            else
                this.send(existing);
            peer.send(this.chat.history());
            return before === peer ? null : before;
        }
        this.seats.push({
            player,
            avatar: this.deps.avatar(this.guildId, player.userId) ?? avatarUrl(player.userId, null),
            // Not looked up: 0 until the next betting looks again.
            balance: balance ?? 0,
            bets: {},
            result: null,
            refused: false,
            lastBets: null,
            ready: false,
            peer,
            awayEnds: null,
        });
        this.broadcast();
        peer.send(this.chat.history());
        return null;
    }
    /** `userId` says `text` to the table, with a picture (`image`) or not. */
    say(userId, text, image) {
        const seat = this.seats.find((s) => s.player.userId === userId);
        const line = seat && this.chat.say(seat.player, text, this.deps.now(), image);
        if (line)
            for (const each of this.seats)
                each.peer?.send({ t: 'chat', line });
    }
    /**
     * The page `peer` went away: its player's seat is kept for `awayMs` (see the top of this file), their chips taken off
     * (they weren't taken yet). Not back by then, they leave the table.
     */
    leave(userId, peer) {
        const seat = this.seats.find((s) => s.player.userId === userId && s.peer === peer);
        if (!seat)
            return;
        seat.peer = null;
        seat.ready = false;
        if (this.phase === 'betting')
            seat.bets = {};
        seat.awayEnds = this.deps.schedule(this.game.table.awayMs, () => this.gone(seat));
        // Everyone still here may have voted to deal.
        if (this.allReady())
            return void this.dealNow();
        this.broadcast();
    }
    /** An away player didn't come back in time: they leave the table, which closes once nobody is at it. */
    gone(seat) {
        const i = this.seats.indexOf(seat);
        if (i < 0 || seat.peer !== null || this.closed)
            return;
        this.seats.splice(i, 1);
        if (this.seats.length === 0)
            return this.close();
        if (this.allReady())
            return void this.dealNow();
        this.broadcast();
    }
    /**
     * A player's vote to deal now (`ready` false takes it back). When everyone at the table has voted,
     * the round is dealt at once. False when the round isn't taking bets.
     */
    setReady(userId, ready) {
        const seat = this.seats.find((s) => s.player.userId === userId);
        if (!seat || this.phase !== 'betting')
            return false;
        seat.ready = ready;
        if (this.allReady())
            void this.dealNow();
        else
            this.broadcast();
        return true;
    }
    /** Everyone at the table voted to deal (those away aren't asked). */
    allReady() {
        const here = this.seats.filter((s) => s.peer !== null);
        return this.phase === 'betting' && here.length > 0 && here.every((s) => s.ready);
    }
    /** A player's chips on the table now. Null when they went down; why not otherwise. */
    setBets(userId, bets) {
        const seat = this.seats.find((s) => s.player.userId === userId);
        if (!seat || this.phase !== 'betting')
            return { reason: 'closed' };
        const total = sumBets(bets);
        const { maxBet } = this.game.limits();
        if (total > maxBet)
            return { reason: 'too_big', limit: maxBet };
        if (total > seat.balance)
            return { reason: 'too_poor', balance: seat.balance };
        seat.bets = { ...bets };
        this.broadcast();
        return null;
    }
    /** Sends one player the table as it is (after a refusal, so their page shows what is really down). */
    resend(userId) {
        const seat = this.seats.find((s) => s.player.userId === userId);
        if (seat)
            this.send(seat);
    }
    startBetting(announce = true) {
        if (this.closed)
            return;
        this.phase = 'betting';
        for (const seat of this.seats) {
            seat.bets = {};
            seat.result = null;
            seat.refused = false;
            seat.ready = false;
        }
        const { bettingMs } = this.game.table;
        this.endsAt = this.deps.now() + bettingMs;
        this.cancel = this.deps.schedule(bettingMs, () => void this.dealNow());
        if (announce)
            this.broadcast();
        void this.lookUpBalances();
    }
    /**
     * Looks everyone's points up again for the betting just started: they may have changed outside the
     * table (a claim, another game), and bets are checked against them.
     */
    async lookUpBalances() {
        const rounds = this.rounds;
        const seats = [...this.seats];
        const found = await Promise.all(seats.map((s) => lookUpBalance(this.deps, this.game.live, this.guildId, s.player.userId)));
        // The betting is over already: settling the round has their points.
        if (this.closed || this.phase !== 'betting' || this.rounds !== rounds)
            return;
        let moved = false;
        seats.forEach((seat, i) => {
            const balance = found[i];
            if (balance === null || balance === undefined || balance === seat.balance)
                return;
            seat.balance = balance;
            moved = true;
        });
        if (moved)
            this.broadcast();
    }
    /** The betting is over: deals the round, settling everyone with chips down. */
    async dealNow() {
        if (this.closed || this.phase !== 'betting')
            return;
        this.cancel?.();
        const betting = this.seats.filter((s) => sumBets(s.bets) > 0);
        this.phase = 'dealing';
        const round = this.deps.deal();
        this.rounds += 1;
        // Everyone is settled against the same round.
        for (const seat of betting) {
            const bets = seat.bets;
            try {
                const result = await this.deps.play(this.guildId, seat.player.userId, bets, () => round);
                if (result.ok) {
                    seat.result = { bets: result.bets, bet: result.bet, payout: result.payout, net: result.net };
                    seat.balance = result.balance;
                    seat.lastBets = bets;
                }
                else {
                    seat.refused = true;
                    if (result.reason === 'too_poor')
                        seat.balance = result.balance;
                }
            }
            catch (err) {
                console.error(`Could not settle a ${this.game.live} player’s round:`, err);
                seat.refused = true;
            }
        }
        if (this.closed)
            return;
        this.round = { ...this.game.view(round, this.round), no: this.rounds };
        const { showMs } = this.game.table;
        this.endsAt = this.deps.now() + showMs;
        this.cancel = this.deps.schedule(showMs, () => this.startBetting());
        this.broadcast();
    }
    close() {
        this.closed = true;
        this.cancel?.();
        this.onEmpty(this);
    }
    /** The table as `userId` sees it. */
    view(userId) {
        const { minBet, maxBet } = this.game.limits();
        return {
            table: this.number,
            you: userId,
            seats: this.seats.map((s) => ({
                userId: s.player.userId,
                name: s.player.name,
                avatar: s.avatar,
                balance: s.balance,
                bets: { ...s.bets },
                result: s.result,
                refused: s.refused,
                ready: s.ready,
                lastBets: s.lastBets,
                ...(s.peer === null && { away: true }),
            })),
            phase: this.phase,
            msLeft: Math.max(0, this.endsAt - this.deps.now()),
            round: this.round,
            minBet,
            maxBet,
            maxSeats: this.game.table.seats,
            chips: [...this.game.chips],
            ...this.game.extras(),
        };
    }
    send(seat) {
        seat.peer?.send({ t: 'table', state: this.view(seat.player.userId) });
    }
    broadcast() {
        for (const seat of this.seats)
            this.send(seat);
    }
}
/** A game's open tables, by server. */
export class PartyTables {
    game;
    realDeps;
    tables = new Map();
    /** Where each table closed left off, by server and then table number. */
    histories = new Map();
    /** The table each player sat at last (by playerKey), to go back to while it has room. */
    lastTable = new Map();
    constructor(game, realDeps) {
        this.game = game;
        this.realDeps = realDeps;
    }
    /** The tables open in a server. */
    in(guildId) {
        return this.tables.get(guildId) ?? [];
    }
    /**
     * Seats `player` (see PartyTable.sit) at the table they already sit at, the one they sat at last
     * if it has room, or the first with a free seat, opening a new one when all are full. Returns the
     * table, and the page they were replaced from, if any.
     */
    async seat(player, peer, deps = this.realDeps) {
        // Looked up before they're seated, so nobody is shown them with none meanwhile.
        const balance = await lookUpBalance(deps, this.game.live, player.guildId, player.userId);
        const open = this.tables.get(player.guildId) ?? [];
        const key = playerKey(player);
        const last = this.lastTable.get(key);
        let table = open.find((t) => t.has(player.userId)) ??
            (last && open.includes(last) && !last.full ? last : undefined) ??
            open.find((t) => !t.full);
        if (!table) {
            // The lowest table number not in use.
            let number = 1;
            while (open.some((t) => t.number === number))
                number++;
            const { guildId } = player;
            const histories = this.histories.get(guildId) ?? new Map();
            this.histories.set(guildId, histories);
            table = new PartyTable(this.game, guildId, number, deps, (empty) => {
                histories.set(empty.number, empty.history);
                const list = this.tables.get(guildId)?.filter((t) => t !== empty) ?? [];
                if (list.length > 0)
                    this.tables.set(guildId, list);
                else
                    this.tables.delete(guildId);
            }, histories.get(number));
            this.tables.set(player.guildId, [...open, table].sort((a, b) => a.number - b.number));
        }
        this.lastTable.set(key, table);
        const replaced = table.sit(player, peer, balance);
        return { table, replaced };
    }
    /** For tests: forgets every table. */
    reset() {
        this.tables.clear();
        this.histories.clear();
        this.lastTable.clear();
    }
}
//# sourceMappingURL=table.js.map