import { randomUUID } from 'node:crypto';
import { CONFIG } from '../../../config.js';
import { POKER_BOT_NAMES, POKER_TABLE } from '../../../constants/index.js';
import { dayKey } from '../../../lib/events/raid-week.js';
import { botAction, PokerReads, randomStyle } from '../../../lib/game/casino/poker/bot.js';
import { act as handAct, advance, forfeit, legalActions, potTotal, shuffledDeck, startHand, } from '../../../lib/game/casino/poker/hand.js';
import { addBotWinnings, botWinnings, buyIn, cashOut, houseTake, renewSeats, saveChips } from '../../../services/casino/poker.js';
import { getBalance } from '../../../services/economy/index.js';
import { avatarUrl } from '../../auth/login.js';
import { Chat } from '../chat.js';
export const realPokerDeps = {
    buyIn,
    saveChips,
    cashOut,
    renewSeats,
    houseTake,
    botWinnings,
    addBotWinnings,
    balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
    avatar: () => null,
    deck: shuffledDeck,
    random: Math.random,
    now: Date.now,
    schedule: (ms, run) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => clearTimeout(timer);
    },
};
/** Each process's tables have keys of their own, so a restarted bot never mixes up seats left by the one before. */
const PROCESS = randomUUID().slice(0, 8);
export class PokerTable {
    guildId;
    number;
    deps;
    onEmpty;
    /** Every seat, empty ones null. */
    seats = Array.from({ length: POKER_TABLE.seats }, () => null);
    /** Every page at the table (seated or not), by member. */
    viewers = new Map();
    hand = null;
    handNo = 0;
    /** The seat with the button in the last hand. */
    buttonSeat = -1;
    /** When the turn being played (or the wait for the next hand) ends, and what cancels its timer. */
    deadline = 0;
    cancelTimer = null;
    nextHandPending = false;
    stopHeartbeat = null;
    closed = false;
    botCount = 0;
    /** How the players here have played, as the bots remember it (what everyone at the table saw). */
    reads = new PokerReads();
    /** The changes waiting their turn: everything that changes the table runs one after another. */
    queue = Promise.resolve();
    /** What the pages at the table (seated or not) say to each other. */
    chat = new Chat();
    key;
    constructor(guildId, number, deps, onEmpty) {
        this.guildId = guildId;
        this.number = number;
        this.deps = deps;
        this.onEmpty = onEmpty;
        this.key = `${PROCESS}:${guildId}:${number}`;
        this.heartbeat();
    }
    /** Runs `change` once every change before it is done. Errors are logged, never left to break the queue. */
    run(change) {
        const result = this.queue.then(change);
        this.queue = result.then(() => undefined, (err) => console.error(`A poker table (${this.key}) failed:`, err));
        return result;
    }
    /** How many are seated (bots too). */
    get taken() {
        return this.seats.filter((s) => s !== null).length;
    }
    /** `userId` sits at this table or has a page at it. */
    has(userId) {
        return this.viewers.has(userId) || this.seatOf(userId) !== null;
    }
    seated(userId) {
        return this.seatOf(userId) !== null;
    }
    seatOf(id) {
        return this.seats.find((s) => s?.id === id) ?? null;
    }
    humans() {
        return this.seats.filter((s) => s !== null && !s.bot);
    }
    /** In the hand being played (even folded: its chips aren't settled until it's over). */
    inHand(seat) {
        return this.hand !== null && !this.hand.done && this.hand.players.some((p) => p.id === seat.id);
    }
    /** How many members have a page at the table but no seat. */
    waiting() {
        return [...this.viewers.keys()].filter((id) => !this.seated(id)).length;
    }
    /** Another member can join: there's a seat that isn't a member's (or kept for one), free or a bot's. */
    get open() {
        return this.humans().length + this.waiting() < POKER_TABLE.seats;
    }
    /** The table as the server's table list shows it. */
    listing() {
        return {
            table: this.number,
            players: this.humans().map((s) => ({ name: s.name, avatar: s.avatar })),
            bots: this.seats.filter((s) => s?.bot).length,
            seats: POKER_TABLE.seats,
            playing: this.hand !== null && !this.hand.done,
            open: this.open,
        };
    }
    // -------------------------------------------------------------------------
    // Pages coming and going
    // -------------------------------------------------------------------------
    /** A page for `player` joins the table (a bot getting up for them, if it must). Returns the page it took over from (another tab), if any. */
    join(player, peer) {
        return this.run(async () => {
            const before = this.viewers.get(player.userId);
            const viewer = { player, peer, balance: before?.balance ?? 0 };
            this.viewers.set(player.userId, viewer);
            const seat = this.seatOf(player.userId);
            if (seat) {
                seat.awaySince = null;
                seat.name = player.name;
            }
            else {
                await this.makeRoom();
            }
            try {
                viewer.balance = await this.deps.balance(this.guildId, player.userId);
            }
            catch (err) {
                console.error('Could not look up a poker player’s balance:', err);
            }
            this.maybeDeal();
            this.broadcast();
            peer.send(this.chat.history());
            return before?.peer && before.peer !== peer ? before.peer : null;
        });
    }
    /** `userId` says `text` to the table, with a picture (`image`) or not. */
    say(userId, text, image) {
        const viewer = this.viewers.get(userId);
        const line = viewer && this.chat.say(viewer.player, text, this.deps.now(), image);
        if (line)
            for (const each of this.viewers.values())
                each.peer?.send({ t: 'chat', line });
    }
    /** The page `peer` went away. A seated player keeps their seat for a while (see the top of this file). */
    leave(userId, peer) {
        return this.run(async () => {
            const viewer = this.viewers.get(userId);
            if (!viewer || viewer.peer !== peer)
                return;
            const seat = this.seatOf(userId);
            if (!seat) {
                this.viewers.delete(userId);
                this.closeIfEmpty();
                this.broadcast();
                return;
            }
            viewer.peer = null;
            seat.awaySince = this.deps.now();
            const since = seat.awaySince;
            this.deps.schedule(POKER_TABLE.awayMs, () => {
                void this.run(async () => {
                    // Back since (or gone again later, which has its own timer).
                    if (seat.awaySince !== since || this.seats[seat.seat] !== seat)
                        return;
                    await this.standUp(seat);
                    this.viewers.delete(userId);
                    this.closeIfEmpty();
                    this.broadcast();
                });
            });
            // Their turn now: played for them.
            this.playForAway();
            this.broadcast();
        });
    }
    // -------------------------------------------------------------------------
    // Sitting down and standing up
    // -------------------------------------------------------------------------
    /** Sits `userId` down at `seatNo` (or the first free seat) with `chips` from their balance. Null when they sat; why not otherwise. */
    sit(userId, chips, seatNo) {
        return this.run(async () => {
            const viewer = this.viewers.get(userId);
            if (!viewer || this.seatOf(userId))
                return { reason: 'not_now' };
            const at = seatNo ?? this.seats.findIndex((s) => s === null);
            if (at < 0 || at >= POKER_TABLE.seats || this.seats[at] !== null)
                return { reason: 'seat_taken' };
            let bought;
            try {
                bought = await this.deps.buyIn(this.guildId, userId, this.key, chips);
            }
            catch (err) {
                console.error('Could not buy a poker player in:', err);
                return { reason: 'failed' };
            }
            if (!bought.ok) {
                if (bought.reason === 'too_poor') {
                    viewer.balance = bought.balance;
                    return { reason: 'too_poor', balance: bought.balance };
                }
                return { reason: 'buy_in', min: bought.min, max: bought.max };
            }
            viewer.balance = bought.balance;
            const day = this.today();
            let won = 0;
            try {
                won = await this.deps.botWinnings(this.guildId, userId, day);
            }
            catch (err) {
                console.error('Could not look up a poker player’s winnings off the bots:', err);
            }
            this.seats[at] = {
                seat: at,
                id: userId,
                name: viewer.player.name,
                avatar: this.deps.avatar(this.guildId, userId) ?? avatarUrl(userId, null),
                bot: false,
                chips: bought.chips,
                seatId: bought.seatId,
                stake: 0,
                bots: { day, net: won },
                leaving: false,
                awaySince: viewer.peer ? null : this.deps.now(),
            };
            this.maybeDeal();
            this.broadcast();
            return null;
        });
    }
    /** `userId` stands up: their chips go back to their balance (once the hand they're in is over; they fold it). */
    stand(userId) {
        return this.run(async () => {
            const seat = this.seatOf(userId);
            if (!seat)
                return { reason: 'not_now' };
            await this.standUp(seat);
            this.broadcast();
            return null;
        });
    }
    /** Gets `seat` up: straight away between hands, or (folding) once the hand they're in is over. */
    async standUp(seat) {
        if (this.inHand(seat) && this.hand) {
            seat.leaving = true;
            forfeit(this.hand, seat.id);
            this.afterMove();
            return;
        }
        await this.removeSeat(seat);
        this.maybeDeal();
    }
    /** Frees `seat`, paying out its chips: a member's to their balance, a bot's winnings to the vault. */
    async removeSeat(seat) {
        if (this.seats[seat.seat] !== seat)
            return;
        this.seats[seat.seat] = null;
        if (seat.bot) {
            const won = seat.chips - seat.stake;
            if (won > 0)
                await this.deps.houseTake(this.guildId, won).catch((err) => console.error('Could not put a poker bot’s winnings in the vault:', err));
            return;
        }
        if (!seat.seatId)
            return;
        try {
            const paid = await this.deps.cashOut(seat.seatId);
            const viewer = this.viewers.get(seat.id);
            if (paid && viewer)
                viewer.balance = paid.balance;
        }
        catch (err) {
            // cashOut leaves the chips for the sweeper.
            console.error('Could not cash a poker player out:', err);
        }
    }
    // -------------------------------------------------------------------------
    // Bots
    // -------------------------------------------------------------------------
    /** A seated member adds a bot in the first free seat. */
    addBot(userId) {
        return this.run(() => {
            const me = this.seatOf(userId);
            if (!me)
                return { reason: 'not_now' };
            if (this.botLimited(me))
                return { reason: 'bot_limit', limit: CONFIG.poker.botDailyLimit };
            const at = this.seats.findIndex((s) => s === null);
            if (at < 0 || !this.botSeatFree())
                return { reason: 'seat_taken' };
            const names = new Set(this.seats.map((s) => s?.name));
            const name = POKER_BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${this.botCount + 1}`;
            this.botCount++;
            const chips = CONFIG.poker.maxBuyIn;
            this.seats[at] = { seat: at, id: `bot:${this.botCount}`, name, avatar: '', bot: true, chips, seatId: null, stake: chips, bots: { day: '', net: 0 }, leaving: false, awaySince: null, style: randomStyle(this.deps.random) };
            this.maybeDeal();
            this.broadcast();
            return null;
        });
    }
    /** A seated member takes the bot in `seatNo` away (once the hand it's in is over). */
    removeBot(userId, seatNo) {
        return this.run(async () => {
            const seat = this.seats[seatNo];
            if (!this.seatOf(userId) || !seat?.bot)
                return { reason: 'not_now' };
            await this.botUp(seat);
            this.broadcast();
            return null;
        });
    }
    /**
     * Gets bots up until there's a seat for every member at the table who hasn't sat down: one out of
     * the hand if there is one (straight away), else one in it (once it's over).
     */
    async makeRoom() {
        for (;;) {
            const free = this.seats.filter((s) => s === null || s.leaving).length;
            const bots = this.seats.filter((s) => s !== null && s.bot && !s.leaving);
            const bot = bots.find((s) => !this.inHand(s)) ?? bots.at(-1);
            if (free >= this.waiting() || !bot)
                return;
            await this.botUp(bot);
        }
    }
    /** A bot gets up: straight away, or after the hand it's in. */
    async botUp(seat) {
        if (this.inHand(seat))
            seat.leaving = true;
        else
            await this.removeSeat(seat);
    }
    /** A free seat a bot may take: one is kept for each member at the table who hasn't sat down yet. */
    botSeatFree() {
        return POKER_TABLE.seats - this.taken > this.waiting();
    }
    today() {
        return dayKey(new Date(this.deps.now()));
    }
    /** What a member's seat has won off the bots today, net. */
    botNet(seat) {
        return seat.bots.day === this.today() ? seat.bots.net : 0;
    }
    /** A member who has won the most they may off the bots today (poker.botDailyLimit). */
    botLimited(seat) {
        const limit = CONFIG.poker.botDailyLimit;
        return !seat.bot && limit > 0 && this.botNet(seat) >= limit;
    }
    /**
     * Counts what the members in a hand won off its bots (or lost to them), from how everyone's chips
     * changed in it: what the bots lost, all told, is shared out among the members who came out ahead,
     * by how far (each at most what they won); what the bots won, among the members who lost.
     */
    async countBotWinnings(changes) {
        const bots = changes.reduce((sum, c) => sum + (c.seat.bot ? c.change : 0), 0);
        if (bots === 0)
            return;
        const sharers = changes.filter((c) => !c.seat.bot && Math.sign(c.change) === -Math.sign(bots));
        const total = sharers.reduce((sum, c) => sum + Math.abs(c.change), 0);
        const day = this.today();
        for (const { seat, change } of sharers) {
            const share = Math.min(Math.abs(change), Math.round((Math.abs(bots) * Math.abs(change)) / total));
            const amount = bots < 0 ? share : -share;
            seat.bots = { day, net: this.botNet(seat) + amount };
            await this.deps.addBotWinnings(this.guildId, seat.id, day, amount).catch((err) => console.error('Could not count a poker player’s winnings off the bots:', err));
        }
    }
    // -------------------------------------------------------------------------
    // Playing
    // -------------------------------------------------------------------------
    /** `userId`'s move, on their turn. */
    act(userId, move, amount) {
        return this.run(() => {
            const hand = this.hand;
            if (!hand || hand.toAct === null || hand.players[hand.toAct]?.id !== userId)
                return { reason: 'not_now' };
            const action = toAction(hand, move, amount);
            if (!action)
                return { reason: 'not_now' };
            this.reads.saw(hand, userId, action);
            if (handAct(hand, userId, action) !== null)
                return { reason: 'not_now' };
            this.afterMove();
            return null;
        });
    }
    /**
     * Who can be dealt in: seated with chips, not getting up, and (members) with their page here. The
     * bots sit out while one of the members has won the most they may off them today.
     */
    ready() {
        const ready = this.seats.filter((s) => s !== null && s.chips > 0 && !s.leaving && s.awaySince === null);
        return ready.some((s) => this.botLimited(s)) ? ready.filter((s) => !s.bot) : ready;
    }
    /** Deals the next hand after a pause, when there are players for one and nothing else is going on. */
    maybeDeal() {
        if (this.closed || this.nextHandPending || (this.hand && !this.hand.done))
            return;
        const ready = this.ready();
        if (ready.length < 2 || !ready.some((s) => !s.bot))
            return;
        this.nextHandPending = true;
        this.setTimer(POKER_TABLE.nextHandMs, () => {
            void this.run(() => {
                this.nextHandPending = false;
                this.deal();
            });
        });
    }
    deal() {
        const ready = this.ready();
        if (this.closed || ready.length < 2 || !ready.some((s) => !s.bot)) {
            this.broadcast();
            return;
        }
        // The button moves to the next player dealt in, round the table.
        const next = ready.find((s) => s.seat > this.buttonSeat) ?? ready[0];
        this.buttonSeat = next.seat;
        const { smallBlind, bigBlind, rake, rakeCap } = CONFIG.poker;
        this.hand = startHand(ready.map((s) => ({ id: s.id, seat: s.seat, stack: s.chips })), ready.indexOf(next), { small: smallBlind, big: bigBlind, rake: { rate: rake, cap: rakeCap } }, this.deps.deck());
        this.reads.dealt(this.hand);
        this.handNo++;
        this.afterMove();
    }
    /** After any move: the next turn, the next street, or the end of the hand. */
    afterMove() {
        const hand = this.hand;
        this.clearTimer();
        if (!hand)
            return;
        if (hand.done) {
            void this.run(() => this.endHand());
            this.broadcast();
            return;
        }
        if (hand.toAct === null) {
            this.setTimer(hand.cardsUp ? POKER_TABLE.allInStreetMs : POKER_TABLE.streetMs, () => {
                void this.run(() => {
                    if (this.hand !== hand)
                        return;
                    advance(hand);
                    this.afterMove();
                });
            });
            this.broadcast();
            return;
        }
        const player = hand.players[hand.toAct];
        const seat = this.seats[player.seat];
        if (seat?.bot) {
            const [from, to] = POKER_TABLE.botThinkMs;
            this.setTimer(from + Math.floor(this.deps.random() * (to - from)), () => {
                void this.run(() => {
                    if (this.hand !== hand || hand.toAct === null || hand.players[hand.toAct] !== player)
                        return;
                    const move = botAction(hand, this.deps.random, { style: seat.style, reads: this.reads });
                    this.reads.saw(hand, player.id, move);
                    if (handAct(hand, player.id, move) !== null)
                        handAct(hand, player.id, fallback(hand));
                    this.afterMove();
                });
            });
        }
        else if (!seat || seat.awaySince !== null || seat.leaving) {
            this.playForAway();
            return;
        }
        else {
            this.setTimer(CONFIG.poker.turnSeconds * 1000, () => {
                void this.run(() => {
                    if (this.hand !== hand || hand.toAct === null || hand.players[hand.toAct] !== player)
                        return;
                    handAct(hand, player.id, fallback(hand));
                    this.afterMove();
                });
            });
        }
        this.broadcast();
    }
    /** The player whose turn it is isn't here (or is getting up): they check when it's free, and fold otherwise. */
    playForAway() {
        const hand = this.hand;
        if (!hand || hand.toAct === null)
            return;
        const player = hand.players[hand.toAct];
        const seat = this.seats[player.seat];
        if (seat && !seat.bot && (seat.awaySince !== null || seat.leaving)) {
            handAct(hand, player.id, fallback(hand));
            this.afterMove();
        }
    }
    /** The hand is over: saves everyone's chips, takes the rake, lets those getting up (or out of chips) go, and deals on. */
    async endHand() {
        const hand = this.hand;
        if (!hand?.done || !hand.result)
            return;
        this.reads.handOver(hand);
        const changes = [];
        for (const p of hand.players) {
            const seat = this.seats[p.seat];
            if (seat?.id !== p.id)
                continue;
            changes.push({ seat, change: p.stack - seat.chips });
            seat.chips = p.stack;
        }
        await this.countBotWinnings(changes);
        for (const seat of this.humans()) {
            if (!seat.seatId || !hand.players.some((p) => p.id === seat.id))
                continue;
            await this.deps.saveChips(seat.seatId, seat.chips).catch((err) => console.error('Could not save a poker player’s chips:', err));
        }
        if (hand.result.rake > 0)
            await this.deps.houseTake(this.guildId, hand.result.rake).catch((err) => console.error('Could not put poker rake in the vault:', err));
        for (const seat of [...this.seats]) {
            if (seat && (seat.leaving || seat.chips <= 0))
                await this.removeSeat(seat);
        }
        this.closeIfEmpty();
        this.maybeDeal();
        this.broadcast();
    }
    // -------------------------------------------------------------------------
    // Timers, closing
    // -------------------------------------------------------------------------
    setTimer(ms, run) {
        this.clearTimer();
        this.deadline = this.deps.now() + ms;
        this.cancelTimer = this.deps.schedule(ms, run);
    }
    clearTimer() {
        this.cancelTimer?.();
        this.cancelTimer = null;
        this.deadline = 0;
    }
    /** Keeps the seats' chips leased in the database while the table is open. */
    heartbeat() {
        this.stopHeartbeat = this.deps.schedule(POKER_TABLE.heartbeatMs, () => {
            if (this.closed)
                return;
            if (this.humans().length > 0)
                void this.deps.renewSeats(this.key).catch((err) => console.error('Could not renew poker seats:', err));
            this.heartbeat();
        });
    }
    /** Closes the table when no member is at it (seated or watching): the bots get up with it. */
    closeIfEmpty() {
        if (this.closed || this.viewers.size > 0 || this.humans().length > 0)
            return;
        this.closed = true;
        this.clearTimer();
        this.stopHeartbeat?.();
        this.hand = null;
        for (const seat of this.seats) {
            if (seat?.bot)
                void this.removeSeat(seat);
        }
        this.onEmpty(this);
    }
    // -------------------------------------------------------------------------
    // What the pages see
    // -------------------------------------------------------------------------
    /** The table as `userId` sees it. */
    view(userId) {
        const hand = this.hand;
        const { smallBlind, bigBlind, minBuyIn, maxBuyIn, rake, rakeCap, turnSeconds, botDailyLimit } = CONFIG.poker;
        const playerOf = (id) => hand?.players.find((p) => p.id === id);
        const seats = this.seats.map((s) => {
            if (!s)
                return null;
            const p = playerOf(s.id);
            const faceUp = p && hand && !p.folded && (hand.cardsUp || (hand.done && hand.result?.shown[p.id]));
            return {
                seat: s.seat,
                id: s.id,
                name: s.name,
                avatar: s.avatar,
                bot: s.bot,
                // In a hand (being played, or just over and not yet saved), its stack is what they have.
                chips: p ? p.stack : s.chips,
                bet: p && !hand?.done ? p.bet : 0,
                inHand: p !== undefined,
                folded: p?.folded ?? false,
                allIn: (p && !hand?.done && p.allIn) ?? false,
                cards: p && (s.id === userId || faceUp) ? p.hole : null,
                last: (p && !hand?.done && p.last) || null,
                away: s.awaySince !== null,
                leaving: s.leaving,
            };
        });
        const me = hand?.toAct !== null && hand?.toAct !== undefined ? hand.players[hand.toAct] : undefined;
        const legal = me?.id === userId && hand ? legalActions(hand) : null;
        const viewer = this.viewers.get(userId);
        const mine = this.seatOf(userId);
        const playing = hand !== null && !hand.done;
        return {
            table: this.number,
            you: userId,
            seats,
            hand: hand ? handView(hand, this.handNo) : null,
            move: legal,
            msLeft: this.deadline > 0 && (this.nextHandPending || (playing && hand?.toAct !== null)) ? Math.max(0, this.deadline - this.deps.now()) : 0,
            phase: playing ? 'playing' : this.nextHandPending ? 'next' : 'waiting',
            blinds: { small: smallBlind, big: bigBlind },
            buyIn: { min: minBuyIn, max: maxBuyIn },
            rake: { rate: rake, cap: rakeCap },
            balance: viewer?.balance ?? 0,
            canAddBot: mine !== null && !this.botLimited(mine) && this.botSeatFree(),
            botWinnings: mine && botDailyLimit > 0 ? { won: this.botNet(mine), limit: botDailyLimit } : null,
            turnSeconds,
        };
    }
    broadcast() {
        for (const [userId, viewer] of this.viewers)
            viewer.peer?.send({ t: 'poker', state: this.view(userId) });
    }
    /** For tests: the hand being played. */
    get currentHand() {
        return this.hand;
    }
    /** For tests: waits for every change queued so far. */
    settled() {
        return this.queue;
    }
}
/** The hand as every page is shown it (cards aren't in it: SeatView has them, for whoever may see them). */
function handView(hand, no) {
    const seatOf = (id) => hand.players.find((p) => p.id === id).seat;
    const result = hand.result;
    return {
        no,
        button: hand.players[hand.button].seat,
        street: hand.street,
        board: [...hand.board],
        pot: potTotal(hand),
        toAct: hand.toAct === null ? null : hand.players[hand.toAct].seat,
        currentBet: hand.currentBet,
        result: result
            ? {
                pots: result.pots.map((pot) => ({ amount: pot.amount, seats: pot.winners.map(seatOf), hand: pot.hand })),
                rake: result.rake,
                won: Object.fromEntries(Object.entries(result.won).map(([id, amount]) => [seatOf(id), amount])),
                shown: Object.fromEntries(Object.entries(result.shown).map(([id, shown]) => [seatOf(id), shown])),
            }
            : null,
    };
}
/** A page's move as the hand's: All in is a raise to everything they have (or a call, when that's all it comes to). Null when it can't be made. */
function toAction(hand, move, amount) {
    const legal = legalActions(hand);
    if (!legal)
        return null;
    switch (move) {
        case 'fold':
            return { type: 'fold' };
        case 'check':
            return { type: 'check' };
        case 'call':
            return { type: 'call' };
        case 'raise':
            return amount === undefined ? null : { type: 'raise', to: amount };
        case 'allIn':
            if (legal.raise)
                return { type: 'raise', to: legal.raise.max };
            return legal.call > 0 ? { type: 'call' } : { type: 'check' };
    }
}
/** What's done for a player who didn't move in time: check when it's free, fold otherwise. */
const fallback = (hand) => (legalActions(hand)?.check ? { type: 'check' } : { type: 'fold' });
/** Every server's poker tables. */
export class PokerTables {
    realDeps;
    tables = new Map();
    constructor(realDeps) {
        this.realDeps = realDeps;
    }
    /** The tables open in a server. */
    in(guildId) {
        return this.tables.get(guildId) ?? [];
    }
    /** A server's tables as its table list shows them. */
    list(guildId) {
        return this.in(guildId).map((t) => t.listing());
    }
    /** The table `player` sits at, or has a page at: they go straight back to it. */
    tableOf(player) {
        const open = this.in(player.guildId);
        return open.find((t) => t.seated(player.userId)) ?? open.find((t) => t.has(player.userId)) ?? null;
    }
    /**
     * Puts `player`'s page at table `at`, or a new one ('new'): the table they're at already, if
     * they are. Returns the table and the page it took over from, if any, or why they can't join.
     */
    async join(player, peer, at, deps = this.realDeps) {
        const open = this.in(player.guildId);
        let table = this.tableOf(player) ?? (at === 'new' ? undefined : open.find((t) => t.number === at));
        if (!table && at !== 'new')
            return { reason: 'no_table' };
        if (table && !table.has(player.userId) && !table.open)
            return { reason: 'table_full' };
        if (!table) {
            let number = 1;
            while (open.some((t) => t.number === number))
                number++;
            const { guildId } = player;
            table = new PokerTable(guildId, number, deps, (empty) => {
                const list = this.tables.get(guildId)?.filter((t) => t !== empty) ?? [];
                if (list.length > 0)
                    this.tables.set(guildId, list);
                else
                    this.tables.delete(guildId);
            });
            this.tables.set(player.guildId, [...open, table].sort((a, b) => a.number - b.number));
        }
        const replaced = await table.join(player, peer);
        return { table, replaced };
    }
    /** For tests: forgets every table. */
    reset() {
        this.tables.clear();
    }
}
export const pokerTables = new PokerTables(realPokerDeps);
//# sourceMappingURL=table.js.map