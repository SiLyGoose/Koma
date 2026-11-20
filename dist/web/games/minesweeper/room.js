import { MINESWEEPER_BEST, MINESWEEPER_LEVELS, MINESWEEPER_ROOM, MINESWEEPER_START } from '../../../constants/index.js';
import { CONFIG } from '../../../config.js';
import { chordTile, flagCount, neighbours, newBoard, openTile, seenTiles, sharePool, speedMultiplier, toggleFlag } from '../../../lib/game/minesweeper.js';
import { randInt } from '../../../lib/random.js';
import { addMinesweeperStat, loadMinesweeperBest, loadMinesweeperStats, payMinesweeper, saveMinesweeperClear } from '../../../services/minesweeper.js';
import { avatarUrl } from '../../auth/login.js';
import { Chat } from '../chat.js';
export const realRoomDeps = {
    random: randInt,
    now: Date.now,
    avatar: () => null,
    stats: loadMinesweeperStats,
    record: (guildId, userIds, stat) => {
        addMinesweeperStat(guildId, userIds, stat).catch((err) => console.error(`Could not save a minesweeper ${stat} record:`, err));
    },
    rewards: () => CONFIG.minesweeper,
    pay: (guildId, points) => {
        payMinesweeper(guildId, points).catch((err) => console.error('Could not pay for a minesweeper board:', err));
    },
    best: loadMinesweeperBest,
    saveClear: (guildId, level, clear) => {
        saveMinesweeperClear(guildId, level, clear).catch((err) => console.error('Could not save a minesweeper clear:', err));
    },
};
/** Of two clears, the faster first; as fast, the earlier. */
const byTime = (a, b) => a.ms - b.ms || a.at - b.at;
export class MinesweeperRoom {
    guildId;
    deps;
    onEmpty;
    members = new Map();
    gameNo = 0;
    game = this.newGame(MINESWEEPER_START);
    /** What the players in the room say to each other. */
    chat = new Chat();
    /** The server's fastest clears of each level: the ones made here, until the ones on record are read. */
    best = { easy: [], medium: [], hard: [] };
    constructor(guildId, deps, onEmpty) {
        this.guildId = guildId;
        this.deps = deps;
        this.onEmpty = onEmpty;
        // Without them (they can't be read), the room goes on with the ones made in it.
        deps.best(guildId).then((best) => this.readBest(best), (err) => console.error('Could not read the minesweeper leaderboards:', err));
    }
    /** The fastest clears on record, read: with the ones made here meanwhile (each on record too by now, or not yet). */
    readBest(onRecord) {
        for (const level of Object.keys(this.best)) {
            const known = new Set(onRecord[level].map((clear) => `${clear.at}:${clear.ms}`));
            const here = this.best[level].filter((clear) => !known.has(`${clear.at}:${clear.ms}`));
            this.best[level] = [...onRecord[level], ...here].sort(byTime).slice(0, MINESWEEPER_BEST);
        }
        this.tellBest();
    }
    get full() {
        return this.members.size >= MINESWEEPER_ROOM.players;
    }
    has(userId) {
        return this.members.has(userId);
    }
    /** A page for `player`, whose record so far is `stats`, joins. Returns the page it took over from (another tab), if any. */
    join(player, peer, stats) {
        const before = this.members.get(player.userId);
        this.members.set(player.userId, {
            player,
            peer,
            colour: before?.colour ?? this.freeColour(),
            avatar: this.deps.avatar(this.guildId, player.userId) ?? avatarUrl(player.userId, null),
            // What they did here since `stats` was read is in the one the room already has.
            stats: before?.stats ?? { ...stats },
        });
        this.tell();
        peer.send({ t: 'best', best: this.best });
        peer.send(this.chat.history());
        return before && before.peer !== peer ? before.peer : null;
    }
    /** `userId` says `text` to the room, with a picture (`image`) or not. */
    say(userId, text, image) {
        const member = this.members.get(userId);
        const line = member && this.chat.say(member.player, text, this.deps.now(), image);
        if (line)
            for (const each of this.members.values())
                each.peer.send({ t: 'chat', line });
    }
    /** `peer` went away (nothing happens if another page has taken over since). */
    leave(userId, peer) {
        if (this.members.get(userId)?.peer !== peer)
            return;
        this.members.delete(userId);
        if (this.members.size === 0)
            return this.onEmpty(this);
        this.tell();
    }
    /** The colour the fewest in the room have (the lowest of them). */
    freeColour() {
        const used = Array.from({ length: MINESWEEPER_ROOM.colours }, () => 0);
        for (const m of this.members.values())
            used[m.colour] = (used[m.colour] ?? 0) + 1;
        return used.indexOf(Math.min(...used));
    }
    newGame(level) {
        return { no: ++this.gameNo, level, board: newBoard(MINESWEEPER_LEVELS[level]), startedAt: null, endedAt: null, by: null, flaggers: new Map(), blamed: [], openers: new Map(), paid: null, rank: null };
    }
    /** A new board at `level`, in place of the one there. */
    start(userId, level) {
        if (!this.members.has(userId))
            return;
        this.game = this.newGame(level);
        this.tell();
    }
    /** `userId` opens, flags or chords tile `index`. */
    play(userId, move, index) {
        const member = this.members.get(userId);
        const { game } = this;
        if (!member)
            return;
        const { board } = game;
        const openedBefore = board.opened;
        const changed = move === 'open' ? openTile(board, index, this.deps.random) : move === 'flag' ? toggleFlag(board, index) : chordTile(board, index);
        if (!changed)
            return;
        if (move === 'flag') {
            if (board.flag[index])
                game.flaggers.set(index, member.player);
            else
                game.flaggers.delete(index);
        }
        else {
            const now = this.deps.now();
            game.startedAt ??= now;
            game.openers.set(userId, { name: member.player.name, tiles: (game.openers.get(userId)?.tiles ?? 0) + board.opened - openedBefore });
            if (board.status !== 'playing') {
                game.endedAt = now;
                game.by = member.player.name;
            }
            if (board.status === 'won') {
                // A board cleared is everyone's who opened a tile of it.
                this.count('wins', [...game.openers.keys()]);
                game.paid = this.pay(game, now - game.startedAt);
                game.rank = this.rank(game, now - game.startedAt, now);
            }
            else if (board.status === 'lost') {
                // A chord into a mine: the flags round its number that were on no mine are what sent it there.
                const wrong = move === 'chord' ? neighbours(board, index).filter((n) => board.flag[n] && !board.mine[n]) : [];
                const liars = new Map(wrong.flatMap((n) => game.flaggers.get(n) ?? []).map((player) => [player.userId, player.name]));
                game.blamed = [...liars.values()];
                // Sent there by someone else's flag, it's a troll for each of them; otherwise the mine is theirs.
                const trolls = [...liars.keys()].filter((id) => id !== userId);
                if (trolls.length > 0)
                    this.count('trolls', trolls);
                else
                    this.count('bombs', [userId]);
            }
        }
        this.tell();
    }
    /** Pays for `game`, cleared in `elapsedMs`: its level's pool, more for speed, shared by the tiles each player opened. Returns what was paid. */
    pay(game, elapsedMs) {
        const rewards = this.deps.rewards();
        const bonus = speedMultiplier(elapsedMs, rewards.parSeconds[game.level], rewards.speedBonus);
        const total = Math.round(rewards.pool[game.level] * bonus);
        const points = sharePool(total, new Map([...game.openers].map(([id, opener]) => [id, opener.tiles])));
        this.deps.pay(this.guildId, points);
        const shares = [...game.openers].map(([id, opener]) => ({ id, name: opener.name, tiles: opener.tiles, points: points.get(id) ?? 0 }));
        return { bonus, total, shares: shares.sort((a, b) => b.points - a.points) };
    }
    /**
     * Puts `game`, cleared in `elapsedMs` at `now`, among its level's fastest clears, if it is one: kept
     * on record, and told to everyone. Returns where it came (from 1), or null.
     */
    rank(game, elapsedMs, now) {
        const players = [...game.openers].map(([id, opener]) => ({ id, name: opener.name, tiles: opener.tiles })).sort((a, b) => b.tiles - a.tiles);
        const clear = { ms: elapsedMs, at: now, players };
        const list = [...this.best[game.level], clear].sort(byTime).slice(0, MINESWEEPER_BEST);
        const at = list.indexOf(clear);
        if (at < 0)
            return null;
        this.best[game.level] = list;
        this.deps.saveClear(this.guildId, game.level, clear);
        this.tellBest();
        return at + 1;
    }
    /** Tells every page the server's fastest clears as they are now. */
    tellBest() {
        for (const member of this.members.values())
            member.peer.send({ t: 'best', best: this.best });
    }
    /** One more of `stat` for each of `userIds`: on what the room shows of them, and on record. */
    count(stat, userIds) {
        for (const id of userIds) {
            const there = this.members.get(id);
            if (there)
                there.stats[stat]++;
        }
        this.deps.record(this.guildId, userIds, stat);
    }
    /** Where `userId`'s mouse is over the board (null: off it), told to everyone else. */
    cursor(userId, at) {
        if (!this.members.has(userId))
            return;
        for (const [id, member] of this.members) {
            if (id !== userId)
                member.peer.send({ t: 'cursor', id: userId, at });
        }
    }
    gameView() {
        const { game } = this;
        const { board } = game;
        return {
            no: game.no,
            level: game.level,
            cols: board.cols,
            rows: board.rows,
            mines: board.mines,
            tiles: seenTiles(board),
            flags: flagCount(board),
            flaggers: Object.fromEntries([...game.flaggers].filter(([tile]) => board.flag[tile]).map(([tile, player]) => [tile, player.userId])),
            status: game.startedAt === null ? 'ready' : board.status,
            elapsedMs: game.startedAt === null ? 0 : (game.endedAt ?? this.deps.now()) - game.startedAt,
            by: game.by,
            blamed: game.blamed,
            paid: game.paid,
            rank: game.rank,
        };
    }
    /** Tells every page the room as it is now. */
    tell() {
        const state = {
            players: [...this.members.values()].map((m) => ({ id: m.player.userId, name: m.player.name, avatar: m.avatar, colour: m.colour, ...m.stats })),
            levels: MINESWEEPER_LEVELS,
            rewards: this.deps.rewards(),
            game: this.gameView(),
        };
        for (const [id, member] of this.members)
            member.peer.send({ t: 'room', state: { you: id, ...state } });
    }
}
/** Every server's room. */
export class MinesweeperRooms {
    realDeps;
    rooms = new Map();
    constructor(realDeps = realRoomDeps) {
        this.realDeps = realDeps;
    }
    /** Puts `player`'s page in their server's room, with their record so far. Null when it has as many players as it can. */
    join(player, peer, stats = { bombs: 0, wins: 0, trolls: 0 }, deps = this.realDeps) {
        let room = this.rooms.get(player.guildId);
        if (!room) {
            room = new MinesweeperRoom(player.guildId, deps, (empty) => {
                if (this.rooms.get(empty.guildId) === empty)
                    this.rooms.delete(empty.guildId);
            });
            this.rooms.set(player.guildId, room);
        }
        if (room.full && !room.has(player.userId))
            return null;
        return { room, replaced: room.join(player, peer, stats) };
    }
}
export const minesweeperRooms = new MinesweeperRooms();
//# sourceMappingURL=room.js.map