import { randomBytes } from 'node:crypto';
import { DIVINE_ROOM, DRAGON_ROOM, TM_FIGHT, TM_ROOM } from '../../../constants/index.js';
import { DIVINE_INFO, DIVINE_LEVELS, divineInfo, dungeonsOf, enterRefusal, openingOpen } from '../../../lib/game/divine.js';
import { DivineRefusal, divineState } from '../../../services/divine.js';
import { HEROES_BY_ID } from '../../../data/heroes.js';
import { KR_TM_SETS } from '../../../data/kr-gear.js';
import { copyMainStat, heroItemLines, partOf, potentialLines, setBonusLines } from '../../../lib/game/heroes.js';
import { runeView } from '../../models/heroes.js';
import { DRAGONS } from '../../../lib/game/dragon.js';
import { SIM_VERSION, STEP_SECONDS, TM_BOSSES, tmSkillLine } from '../../../lib/game/technomagic.js';
import { abortRun, beginRun, clearedStages, finishRun, ownedHeroes, wornSkins } from '../../../services/technomagic.js';
import { keepSoloLineup, soloLineup } from '../../../services/solo-lineups.js';
import { avatarUrl } from '../../auth/login.js';
import { dragonRoomLink, technomagicRoomLink, webConfig } from '../../config.js';
import { Chat } from '../chat.js';
import { refuse } from '../connection.js';
import { workerFights } from './fight.js';
export const TECHNOMAGIC_RAID = { kind: 'technomagic', bosses: TM_BOSSES };
export const DRAGON_RAID = { kind: 'dragon', bosses: DRAGONS };
/** The Divine Punishment Raid's dungeons as rooms say them: a boss dungeon's stages its Infinite levels, the Karma dungeon's one. */
export const DIVINE_BOSSES = DIVINE_INFO.map((boss) => ({ id: boss.id, name: boss.name, stages: boss.kind === 'karma' ? 1 : DIVINE_LEVELS, divine: { group: boss.group, kind: boss.kind } }));
export const DIVINE_RAID = { kind: 'divine', bosses: DIVINE_BOSSES };
/** A shard count by tier, every tier said. */
const byTier = (of) => ({ '1': of?.['1'] ?? 0, '2': of?.['2'] ?? 0, '3': of?.['3'] ?? 0, '4': of?.['4'] ?? 0, '5': of?.['5'] ?? 0 });
/** A drop as the page shows it: an item found, with what its copy came with. */
function dropView({ item, skill, potentials, options, salvaged, salvagedStones, salvagedCrystals, reclaimed }) {
    const tmSet = item.kr?.set && KR_TM_SETS.includes(item.kr.set) ? item.kr.set : undefined;
    const bonus = item.kr?.set ? setBonusLines(item.kr.set, item.kr.classes.length === 1 ? item.kr.classes[0] : null, 0)[tmSet ? 0 : 1] : undefined;
    return {
        itemId: item.id,
        name: reclaimed ? `Reclaimed ${item.name}` : item.name,
        stars: item.stars,
        skill: tmSkillLine(skill),
        potentials: item.kr ? heroItemLines(item, 1, undefined, options) : potentialLines(potentials),
        icon: item.kr?.icon ?? null,
        mainStat: copyMainStat(item, { level: 1, reclaimed: reclaimed === true }),
        slot: item.slot,
        part: partOf(item),
        description: item.description,
        itemClass: item.class ?? (item.kr && item.kr.classes.length === 1 ? item.kr.classes[0] : null),
        setEffect: bonus ? { pieces: bonus.pieces, text: bonus.text } : null,
        ...(salvaged !== undefined && { salvaged }),
        ...(salvagedStones !== undefined && { salvagedStones }),
        ...(salvagedCrystals !== undefined && item.kr?.set && { salvagedCrystals: { set: item.kr.set, count: salvagedCrystals } }),
        ...(reclaimed && { reclaimed }),
    };
}
/** How far someone has got, as it is told: in each mode, or (a number) in Hard alone. */
const clearedOf = (cleared) => (typeof cleared === 'number' ? { hard: cleared, normal: 0 } : { hard: cleared.hard ?? 0, normal: cleared.normal ?? 0 });
const isMap = (owned) => owned instanceof Map;
export const realRoomDeps = {
    now: Date.now,
    avatar: () => null,
    owned: ownedHeroes,
    worn: wornSkins,
    lineups: { read: soloLineup, keep: keepSoloLineup },
    cleared: clearedStages,
    begin: (guildId, stage, players, boss, mode, divine) => beginRun(guildId, stage, players, new Date(), boss, mode, divine),
    finish: async (guildId, run, stage, result, ticks, forfeited, karma) => {
        const found = await finishRun(guildId, run, stage, result, ticks, forfeited, new Date(), false, karma ?? null);
        return new Map([...found].map(([userId, { finds, runes, points, essences, gems, stones, crystals, reports, firstClears, divine }]) => [userId, { drops: finds.map(dropView), ...(stones && { stones }), ...(crystals && { crystals }), ...(reports && { reports }), runes: (runes ?? []).flatMap((id) => { const rune = runeView(id); return rune ? [{ id: rune.id, name: rune.name, icon: rune.icon, grade: rune.grade }] : []; }), points, ...(essences && { essences: essences }), ...(gems !== undefined && { gems }), ...(firstClears !== undefined && { firstClears }), ...(divine && { divine }) }]));
    },
    abort: (guildId, run) => abortRun(guildId, run),
    announce: () => { },
    link: (guildId, _boss, room) => {
        const config = webConfig();
        return config ? technomagicRoomLink(config, guildId, room) : null;
    },
    every: (ms, fn) => {
        const timer = setInterval(fn, ms);
        return () => clearInterval(timer);
    },
    after: (ms, fn) => {
        const timer = setTimeout(fn, ms);
        timer.unref();
        return () => clearTimeout(timer);
    },
    fights: workerFights,
};
/** The Dragon Raid's: the same, but for its rooms' links (each dragon's). */
export const realDragonDeps = {
    ...realRoomDeps,
    link: (guildId, boss, room) => {
        const config = webConfig();
        return config ? dragonRoomLink(config, guildId, boss, room) : null;
    },
};
/** The Divine Punishment Raid's: no links (solo only), its stages its openings' levels, and its openings read. */
export const realDivineDeps = {
    ...realRoomDeps,
    cleared: async () => ({ hard: 0, normal: 0 }),
    link: () => null,
    divine: divineState,
};
export class TechnoMagicRoom {
    guildId;
    deps;
    onEmpty;
    single;
    raid;
    against;
    id;
    /** In the order they came in: the first is the host. */
    members = new Map();
    lineup = [];
    /** The boss's mode the raid is against (a dragon's Normal or Hard; any other boss's, Hard), and its stage in it. */
    mode = 'hard';
    stage = 1;
    /** The host the stage was last set for (a new one gets the highest they have opened). */
    stageHost = null;
    phase = 'prep';
    fight = null;
    /**
     * The fight just over, kept while its result is up (until the next fight begins, or the room goes back to getting
     * ready): a page back meanwhile is given all of it, to draw it to its end (and its Battle Stats) before the result.
     */
    ended = null;
    over = null;
    /** The host has pressed Start and the run is being begun (nothing about the lineup changes meanwhile). */
    starting = false;
    fights = 0;
    chat = new Chat();
    /**
     * Single player: the lineup as last kept (lineups.keep), once the one kept from before has been read and given them
     * (null till then: nothing kept meanwhile, so the room's first, empty, lineup doesn't wipe it).
     */
    kept = null;
    /** Nobody's left (onEmpty has been told). */
    closed = false;
    /** The Divine Punishment Raid: the host's openings and shards as last read (null: not yet), and the shards picked to bring. */
    divineState = null;
    shard = null;
    bring = null;
    constructor(guildId, deps, onEmpty, 
    /** A player's own room (single player), not the server's. */
    single = false, 
    /** The raid it is a room of, and the boss its fights are against (the host can change it: setBoss). */
    raid = TECHNOMAGIC_RAID, against = raid.bosses[0], 
    /** Its id, for its link and Find Raid (null: a player's own). */
    id = null) {
        this.guildId = guildId;
        this.deps = deps;
        this.onEmpty = onEmpty;
        this.single = single;
        this.raid = raid;
        this.against = against;
        this.id = id;
    }
    get boss() {
        return this.against;
    }
    /** Getting ready, with room for another: one a page that names no raid can be put in. */
    get open() {
        return !this.closed && !this.full && this.phase === 'prep' && !this.starting;
    }
    /** As Find Raid lists it (null: a player's own, or nobody's in it). */
    view() {
        const host = this.members.get(this.host() ?? '');
        if (this.id === null || this.closed || !host)
            return null;
        return { id: this.id, boss: this.boss, host: { name: host.player.name, avatar: host.avatar }, mode: this.mode, stage: this.stage, players: this.members.size, most: TM_ROOM.players, phase: this.phase };
    }
    get full() {
        return this.members.size >= TM_ROOM.players;
    }
    has(userId) {
        return this.members.has(userId);
    }
    /** `userId`'s page in the room (null: not in it, or gone during a fight). */
    peerOf(userId) {
        return this.members.get(userId)?.peer ?? null;
    }
    /** Whether `userId` is in the room's fight (one starting counts). */
    fighting(userId) {
        return this.members.has(userId) && (this.phase === 'fight' || this.starting);
    }
    get guild() {
        return this.guildId;
    }
    /** The host's id (null: nobody's in). */
    host() {
        return this.members.keys().next().value ?? null;
    }
    /** Single player (a room of one's own): the teams and the easier boss. The server's room never is, even with one in it. */
    solo() {
        return this.single;
    }
    /** The Divine Punishment dungeon a room of its is against (undefined: another raid's room). */
    dungeon() {
        return this.raid.kind === 'divine' ? divineInfo(this.boss.id) : undefined;
    }
    /** Whether it is against a Divine Punishment Karma dungeon (3 heroes, one of each class, no Sub Team). */
    karma() {
        return this.dungeon()?.kind === 'karma';
    }
    /**
     * Its lineup's sizes: the Dragon Raid's (DRAGON_ROOM, King's Raid's Dragon Raid party), the Divine Punishment Raid's (DIVINE_ROOM:
     * a boss dungeon's 4 + 4, a Karma dungeon's 3, all in the Main Team), or the TechnoMagic Raid's.
     */
    sizes() {
        if (this.raid.kind === 'divine') {
            const slots = this.karma() ? DIVINE_ROOM.karmaSlots : DIVINE_ROOM.bossSlots;
            return { slots, soloSlots: slots, mainTeam: this.karma() ? slots : DIVINE_ROOM.bossMain, hostHeroes: slots, guestHeroes: slots };
        }
        return this.raid.kind === 'dragon' ? DRAGON_ROOM : TM_ROOM;
    }
    /** A Divine Punishment room's stage: a boss dungeon's opening's Infinite level (1 with none open), a Karma dungeon's 1. */
    divineLevel() {
        const info = this.dungeon();
        if (!info || info.kind === 'karma')
            return 1;
        const opening = this.divineState?.divine?.[info.group]?.boss;
        return opening && openingOpen(opening, new Date(this.deps.now())) ? Math.min(this.stages(), opening.level) : 1;
    }
    /** How many heroes the lineup takes alone: the Dragon Raid's more. */
    soloSlots() {
        return this.sizes().soloSlots;
    }
    slots() {
        return this.solo() ? this.soloSlots() : this.sizes().slots;
    }
    /** How many heroes `userId` may bring. */
    limit(userId) {
        if (this.solo())
            return this.soloSlots();
        return userId === this.host() ? this.sizes().hostHeroes : this.sizes().guestHeroes;
    }
    /** How many stages the boss has in the raid's mode. */
    stages() {
        return this.mode === 'normal' ? (this.boss.normal ?? this.boss.stages) : this.boss.stages;
    }
    /** The highest stage the host may pick, and the one the room starts at: the one after the highest they have won in the raid's mode (the first, for one who has won none). */
    unlocked() {
        if (this.raid.kind === 'divine')
            return this.divineLevel();
        const host = this.members.get(this.host() ?? '');
        return Math.min(this.stages(), (host?.cleared[this.mode] ?? 0) + 1);
    }
    /**
     * A page for `player`, who owns `owned` and has won up to stage `cleared` (in each mode, or a number: in Hard), joins
     * (or comes back). Returns the page it took over from (another tab), if any.
     */
    join(player, peer, owned, cleared = 0) {
        const before = this.members.get(player.userId);
        before?.awayEnds?.();
        this.members.set(player.userId, {
            player,
            peer,
            awaySince: null,
            awayEnds: null,
            avatar: this.deps.avatar(this.guildId, player.userId) ?? avatarUrl(player.userId, null),
            owned: new Map(isMap(owned) ? owned : owned.map((id) => [id, 0])),
            worn: before?.worn ?? null,
            ready: before?.ready ?? false,
            cleared: { hard: Math.max(clearedOf(cleared).hard, before?.cleared.hard ?? 0), normal: Math.max(clearedOf(cleared).normal, before?.cleared.normal ?? 0) },
        });
        if (!before)
            this.trim();
        if (!before && this.solo())
            this.readLineup(player.userId);
        this.readWorn(player.userId);
        this.readDivine(player.userId);
        this.tell();
        peer.send(this.chat.history());
        const shown = this.fight ?? (this.phase === 'over' ? this.ended : null);
        if (shown)
            this.showFight(peer, shown);
        return before?.peer && before.peer !== peer ? before.peer : null;
    }
    /**
     * `peer` went away (nothing happens if another page has taken over since): their place and picks are kept for
     * TM_ROOM.awayMs. In a fight, their heroes fight on, on Auto.
     */
    leave(userId, peer) {
        const member = this.members.get(userId);
        if (!member || member.peer !== peer)
            return;
        member.peer = null;
        member.awaySince = this.deps.now();
        this.waitFor(member);
        if (this.fight && !this.fight.done)
            this.fight.pending.push({ kind: 'autos', fighters: this.mine(userId), on: true });
        this.tell();
    }
    /** Whether `member`'s page has been gone longer than they're waited for. */
    pastBack(member) {
        return member.peer === null && this.deps.now() - (member.awaySince ?? -Infinity) >= TM_ROOM.awayMs;
    }
    /** Waits for an away member's page for what's left of TM_ROOM.awayMs (none left: at once). */
    waitFor(member) {
        member.awayEnds?.();
        const left = Math.max(0, (member.awaySince ?? this.deps.now()) + TM_ROOM.awayMs - this.deps.now());
        member.awayEnds = this.deps.after(left, () => this.gone(member));
    }
    /**
     * An away member didn't come back in time. Getting ready, they leave the room, their picks with them. A fight's
     * players stay in it to its end (finish waits for them again), and a fight over keeps them in its results until
     * the room goes back to getting ready (back) or the next fight starts (and everyone else in for it, it does now). Either
     * way, the room closes once nobody is left to come back.
     */
    gone(member) {
        const { userId } = member.player;
        if (this.closed || this.members.get(userId) !== member || member.peer !== null)
            return;
        member.awayEnds = null;
        if (this.fight && !this.fight.done)
            return;
        if (this.phase === 'prep' && !this.starting) {
            this.members.delete(userId);
            this.lineup = this.lineup.filter((pick) => pick.owner !== userId);
            this.trim();
        }
        if (this.closeIfEmpty())
            return;
        if (this.phase === 'over')
            void this.startIfAllIn();
        else
            this.tell();
    }
    /** Whether anyone has the page open. */
    present() {
        return [...this.members.values()].some((member) => member.peer !== null);
    }
    /** Closes the room (onEmpty) when nobody has the page open and nobody gone is still waited for. Whether it did. */
    closeIfEmpty() {
        if (this.closed)
            return true;
        if (this.present() || [...this.members.values()].some((member) => !this.pastBack(member)))
            return false;
        this.closed = true;
        this.onEmpty(this);
        return true;
    }
    /** How many heroes the Main Team takes alone, or the Sub Team (`sub`). */
    teamSlots(sub) {
        return sub ? this.soloSlots() - this.sizes().mainTeam : this.sizes().mainTeam;
    }
    /**
     * Takes out of the lineup what no longer fits (each player's last picks past their limit, then the last picked past
     * the slots). With more than one player there are no teams: the Sub Team goes first, and the rest are in no team.
     */
    trim() {
        if (!this.solo()) {
            this.lineup = [...this.lineup.filter((pick) => !pick.sub), ...this.lineup.filter((pick) => pick.sub)].map(({ sub: _sub, ...pick }) => pick);
        }
        const counts = new Map();
        this.lineup = this.lineup.filter((pick) => {
            const count = (counts.get(pick.owner) ?? 0) + 1;
            counts.set(pick.owner, count);
            return this.members.has(pick.owner) && count <= this.limit(pick.owner);
        });
        this.lineup = this.lineup.slice(0, this.slots());
        if (this.raid.kind === 'divine' && this.solo()) {
            // (Each team no fuller than it takes: a Karma dungeon has no Sub Team.)
            let main = 0;
            let sub = 0;
            this.lineup = this.lineup.filter((pick) => (pick.sub ? ++sub <= this.teamSlots(true) : ++main <= this.teamSlots(false)));
        }
        if (this.karma()) {
            // (A Karma dungeon: at most one hero of each class, King's Raid's BanRule "1,All".)
            const classes = new Set();
            this.lineup = this.lineup.filter((pick) => {
                const cls = HEROES_BY_ID.get(pick.hero)?.class ?? pick.hero;
                if (classes.has(cls))
                    return false;
                classes.add(cls);
                return true;
            });
        }
    }
    /**
     * `userId` puts their hero `hero` (in skin `skin`) in the lineup: null, or why not (another player's in already: no
     * hero is brought twice). Alone, into the Sub Team (`sub`) or the Main Team; one of theirs in the other team already is moved over.
     */
    pick(userId, hero, skin, sub = false) {
        const member = this.members.get(userId);
        if (!member || this.phase !== 'prep' || this.starting)
            return 'closed';
        if (!HEROES_BY_ID.has(hero) || !member.owned.has(hero))
            return 'not_owned';
        const solo = this.solo();
        const into = solo && sub;
        const teamFull = solo && this.lineup.filter((pick) => (pick.sub === true) === into).length >= this.teamSlots(into);
        const mine = this.lineup.filter((pick) => pick.owner === userId);
        const there = mine.find((pick) => pick.hero === hero);
        if (there) {
            if ((there.sub === true) === into)
                return 'picked';
            if (teamFull)
                return 'team_full';
            this.lineup = this.lineup.map((pick) => (pick === there ? { ...pick, sub: into } : pick));
            member.ready = false;
            this.tell();
            return null;
        }
        if (this.lineup.some((pick) => pick.hero === hero))
            return 'picked';
        if (this.karma() && this.lineup.some((pick) => HEROES_BY_ID.get(pick.hero)?.class === HEROES_BY_ID.get(hero)?.class))
            return 'class_taken';
        if (mine.length >= this.limit(userId))
            return 'limit';
        if (this.lineup.length >= this.slots())
            return 'full';
        if (teamFull)
            return 'team_full';
        // In the outfit it wears (the bot's word, once read; the fight's is read again as it begins).
        this.lineup.push({ owner: userId, hero, skin: member.worn ? (member.worn.get(hero) ?? 0) : skin < (HEROES_BY_ID.get(hero)?.skins ?? 1) ? skin : 0, ...(into && { sub: true }) });
        member.ready = false;
        this.tell();
        return null;
    }
    /**
     * `userId`'s heroes read again (their page's Manage closed: one may have been transcended meanwhile), for every page to
     * show. Getting ready, one of theirs in the lineup they no longer own goes out of it.
     */
    reowned(userId, owned) {
        const member = this.members.get(userId);
        if (!member)
            return;
        member.owned = new Map(isMap(owned) ? owned : owned.map((id) => [id, 0]));
        this.readWorn(userId);
        if (this.phase === 'prep' && !this.starting)
            this.lineup = this.lineup.filter((pick) => pick.owner !== userId || member.owned.has(pick.hero));
        this.tell();
    }
    /** What `userId`'s heroes wear, read (not waited for): theirs in the lineup put in it, and every page told (their heroes' faces in it). */
    readWorn(userId) {
        this.deps.worn?.(this.guildId, userId).then((worn) => {
            const member = this.members.get(userId);
            if (!member)
                return;
            member.worn = worn;
            // (Getting ready: theirs in the lineup in it too.)
            if (this.phase === 'prep' && !this.starting)
                this.lineup = this.lineup.map((pick) => (pick.owner === userId ? { ...pick, skin: worn.get(pick.hero) ?? 0 } : pick));
            // Every page told: their lineup's heroes, and their faces (the players' outfits).
            this.tell();
        }, (err) => console.error('Could not read what their heroes wear:', err));
    }
    /**
     * Single player: the lineup `userId` last had against this boss, read (not waited for) and given them again, those of its
     * heroes they still own picked in its order, each into its team; not if they've picked meanwhile, or the fight has begun.
     * Kept from then on (keepLineup).
     */
    readLineup(userId) {
        const lineups = this.deps.lineups;
        if (!lineups)
            return;
        lineups.read(this.guildId, userId, this.raid.kind, this.boss.id).then((picks) => {
            if (!this.members.has(userId) || this.kept !== null)
                return;
            if (this.phase === 'prep' && !this.starting && !this.lineup.some((pick) => pick.owner === userId)) {
                for (const { hero, sub } of picks)
                    this.pick(userId, hero, 0, sub === true);
            }
            // (Kept again only if it changed: one no longer theirs, say.)
            this.kept = JSON.stringify(picks.map(({ hero, sub }) => ({ hero, ...(sub && { sub: true }) })));
            this.tell();
        }, (err) => {
            console.error('Could not read their single player lineup:', err);
            this.kept ??= '[]';
        });
    }
    /** Single player, getting ready: the host's lineup kept as it changes (once the one from before has been read: readLineup). Not waited for. */
    keepLineup() {
        const host = this.host();
        const lineups = this.deps.lineups;
        if (!lineups || !this.solo() || this.kept === null || !host || this.phase !== 'prep' || this.starting)
            return;
        const picks = this.lineup.filter((pick) => pick.owner === host).map(({ hero, sub }) => ({ hero, ...(sub && { sub: true }) }));
        const kept = JSON.stringify(picks);
        if (kept === this.kept)
            return;
        this.kept = kept;
        lineups.keep(this.guildId, host, this.raid.kind, this.boss.id, picks).catch((err) => console.error('Could not keep their single player lineup:', err));
    }
    /**
     * The Divine Punishment Raid: `userId`'s openings and shards read (not waited for), for the room's stage (its opening's level) and
     * what every page shows; only the host's count (solo only: theirs).
     */
    readDivine(userId) {
        const read = this.deps.divine;
        if (!read || this.raid.kind !== 'divine')
            return;
        read(this.guildId, userId).then((state) => {
            if (!this.members.has(userId) || userId !== this.host())
                return;
            this.divineState = state;
            this.tell();
        }, (err) => console.error('Could not read their Divine Punishment openings:', err));
    }
    /**
     * The Divine Punishment Raid, getting ready (the host): another dungeon (`boss`, or `group` alone: its final boss's), and the
     * shards to bring (`shard`: Full Shards into a boss dungeon; `empty`: Empty Shards into the Karma dungeon; null: none). Its openings
     * are read again too (a page that just unlocked one says so).
     */
    async setDivine(userId, asked) {
        if (this.raid.kind !== 'divine' || this.phase !== 'prep' || this.starting)
            return 'closed';
        if (userId !== this.host())
            return 'only_host';
        const boss = asked.boss ?? (asked.group && asked.group !== this.dungeon()?.group ? dungeonsOf(asked.group, 'final')[0]?.id : undefined);
        if (boss && boss !== this.boss.id) {
            const code = await this.setBoss(userId, boss);
            if (code)
                return code;
        }
        if (asked.shard !== undefined)
            this.shard = asked.shard;
        if (asked.empty !== undefined)
            this.bring = asked.empty;
        this.readDivine(userId);
        this.tell();
        return null;
    }
    /** `userId` takes their hero `hero` out of the lineup. */
    unpick(userId, hero) {
        const member = this.members.get(userId);
        if (!member || this.phase !== 'prep' || this.starting)
            return 'closed';
        this.lineup = this.lineup.filter((pick) => pick.owner !== userId || pick.hero !== hero);
        member.ready = false;
        this.tell();
        return null;
    }
    /** `userId` (not the host) says they're ready, or not. */
    ready(userId, on) {
        const member = this.members.get(userId);
        if (!member || this.phase !== 'prep' || this.starting)
            return 'closed';
        if (userId === this.host())
            return 'only_host';
        member.ready = on;
        this.tell();
        return null;
    }
    /** The host picks the raid's stage: one they have opened (won the one before it). */
    setStage(userId, stage) {
        // (A Divine Punishment room's stage is its opening's level: unlocked on the site, not picked here.)
        if (this.phase !== 'prep' || this.starting || this.raid.kind === 'divine')
            return 'closed';
        if (userId !== this.host())
            return 'only_host';
        const picked = Math.min(this.stages(), Math.max(1, Math.floor(stage)));
        if (picked > this.unlocked())
            return 'locked';
        this.stage = picked;
        this.tell();
        return null;
    }
    /** The host takes the raid into the boss's other mode (a dragon's Normal or Hard), getting ready: at the highest stage they have opened in it. */
    setMode(userId, mode) {
        if (this.phase !== 'prep' || this.starting)
            return 'closed';
        if (userId !== this.host())
            return 'only_host';
        if (mode === 'normal' && this.boss.normal === undefined)
            return 'closed';
        if (mode === this.mode)
            return null;
        this.mode = mode;
        this.stage = this.unlocked();
        this.tell();
        return null;
    }
    /**
     * The host takes the raid against `boss` (another of the raid's), getting ready: everyone in it goes with it, their picks
     * kept but nobody ready, in the same mode (Hard, where it has no Normal one), and the stage the highest the host has opened
     * against it. Each page goes to it once told.
     */
    async setBoss(userId, boss) {
        // (A room of one's own keeps its boss, but the Divine Punishment Raid's, one a player whatever the dungeon.)
        if (this.phase !== 'prep' || this.starting || (this.id === null && this.raid.kind !== 'divine'))
            return 'closed';
        if (userId !== this.host())
            return 'only_host';
        const next = this.raid.bosses.find((one) => one.id === boss);
        if (!next)
            return 'closed';
        if (next.id === this.boss.id)
            return null;
        // (Nothing about the room changes while how far each has got against it is read.)
        this.starting = true;
        let cleared;
        const members = [...this.members.values()];
        try {
            cleared = await Promise.all(members.map((member) => this.deps.cleared(this.guildId, member.player.userId, next.id).catch(() => clearedOf(0))));
        }
        finally {
            this.starting = false;
        }
        if (this.closed)
            return 'closed';
        members.forEach((member, i) => {
            member.cleared = cleared[i] ?? clearedOf(0);
            member.ready = false;
        });
        // (Another Divine Punishment group: its shards are another's, so none are picked.)
        if (next.divine?.group !== this.boss.divine?.group) {
            this.shard = null;
            this.bring = null;
        }
        this.against = next;
        if (next.normal === undefined)
            this.mode = 'hard';
        if (this.raid.kind === 'divine')
            this.trim();
        this.stage = this.unlocked();
        this.tell();
        return null;
    }
    /** `userId` leaves the raid for good, getting ready: their place and picks go at once. */
    part(userId) {
        const member = this.members.get(userId);
        if (!member || this.phase !== 'prep' || this.starting)
            return 'closed';
        member.awayEnds?.();
        this.members.delete(userId);
        this.lineup = this.lineup.filter((pick) => pick.owner !== userId);
        this.trim();
        if (!this.closeIfEmpty())
            this.tell();
        return null;
    }
    /**
     * The host starts the fight, getting ready or from a fight over (without going back to getting ready): everyone else
     * ready, and everyone with a hero in; or (`force`) at once, those with no hero in sitting it out.
     */
    async begin(userId, force = false) {
        if ((this.phase !== 'prep' && this.phase !== 'over') || this.starting)
            return 'closed';
        if (userId !== this.host())
            return 'only_host';
        if (this.phase === 'over')
            this.dropGone();
        if (this.stage > this.unlocked())
            return 'locked';
        const inIt = (member) => this.lineup.some((pick) => pick.owner === member.player.userId);
        const all = [...this.members.values()];
        if (!force && all.some((member) => member.player.userId !== userId && !member.ready))
            return 'not_ready';
        if (this.lineup.length === 0 || (!force && !all.every(inIt)))
            return 'no_heroes';
        const members = all.filter(inIt);
        // (A Divine Punishment dungeon: refused at once as the openings last read say, before anything is spent; the bot checks again as it begins.)
        const dungeon = this.dungeon();
        if (dungeon && this.divineState) {
            const refusal = enterRefusal(dungeon, this.divineState.divine?.[dungeon.group], new Date(this.deps.now()));
            if (refusal)
                return refusal;
        }
        const divine = dungeon ? (dungeon.kind === 'karma' ? { empty: this.bring } : { shard: this.shard }) : undefined;
        this.starting = true;
        this.tell();
        const stage = this.stage;
        const mode = this.mode;
        const solo = this.solo();
        let run;
        try {
            const players = members.map((member) => ({ userId: member.player.userId, heroes: this.lineup.filter((pick) => pick.owner === member.player.userId).map(({ hero, skin }) => ({ id: hero, skin })) }));
            run = await this.deps.begin(this.guildId, stage, players, this.boss.id, mode, divine);
        }
        catch (err) {
            this.starting = false;
            if (err instanceof DivineRefusal) {
                // (Not entered: nothing was spent. Its openings read again, for the page to show why.)
                this.readDivine(userId);
                this.tell();
                return err.code === 'busy' ? 'failed' : err.code;
            }
            console.error('Could not begin a TechnoMagic Raid run:', err);
            this.tell();
            return 'failed';
        }
        this.starting = false;
        // (The shards picked are used up: none picked for the next.)
        if (run.divine) {
            this.shard = null;
            this.bring = null;
        }
        // What is theirs still (one sold since it was picked is left out).
        const lineup = this.lineup.filter((pick) => this.members.has(pick.owner) && run.players.get(pick.owner)?.owned.has(pick.hero));
        if (lineup.length === 0) {
            this.tell();
            return 'no_heroes';
        }
        const start = {
            no: ++this.fights,
            boss: this.boss.id,
            seed: run.seed,
            // (A Divine Punishment run's: its opening's Infinite level, as entering it read it.)
            stage: run.divine ? (run.divine.level ?? 1) : stage,
            solo,
            mode,
            ...(run.divine && { divine: run.divine }),
            heroes: lineup.map((pick) => {
                const player = run.players.get(pick.owner);
                const blasphemy = player?.blasphemy?.get(pick.hero) ?? [];
                return { owner: pick.owner, id: pick.hero, skin: player?.skins?.get(pick.hero) ?? pick.skin, gear: player?.gear.get(pick.hero) ?? {}, set: player?.sets.get(pick.hero) ?? null, uw: player?.uws.get(pick.hero) ?? null, ut: player?.uts.get(pick.hero) ?? null, artifact: player?.artifacts?.get(pick.hero) ?? null, skills: player?.skills.get(pick.hero) ?? [], perks: player?.perks.get(pick.hero) ?? [], ...(solo && pick.sub && { sub: true }), ...(blasphemy.length > 0 && { blasphemy }) };
            }),
        };
        let engine;
        try {
            engine = await this.deps.fights.start({ boss: start.boss, seed: start.seed, stage: start.stage, solo: start.solo, mode, ...(start.divine && { divine: start.divine }), heroes: start.heroes.map(({ id, skin, gear, set, uw, ut, artifact, skills, perks, sub, blasphemy }) => ({ id, skin, gear, set, uw, ut, artifact, skills, perks, sub, ...(blasphemy && { blasphemy }) })) });
        }
        catch (err) {
            engine = err instanceof Error ? err.message : String(err);
        }
        if (typeof engine === 'string') {
            console.error(`A TechnoMagic Raid fight could not start (${engine}).`);
            // (What it took to enter given back: it was never fought.)
            await this.deps.abort?.(this.guildId, run).catch((err) => console.error('Could not give back what a run that never started took:', err));
            this.readDivine(userId);
            this.tell();
            return 'failed';
        }
        const fight = { start, engine, run, startedAt: this.deps.now(), owners: start.heroes.map((hero) => hero.owner), tick: 0, inputs: [], sums: [], pending: [], stepping: false, parted: new Map(), resynced: new Map(), presses: new Map(), forfeited: new Set(), stop: () => { }, done: false };
        this.fight = fight;
        this.ended = null;
        this.phase = 'fight';
        this.over = null;
        for (const member of this.members.values())
            member.ready = false;
        // (One away as it starts: their heroes fight on Auto until they're back.)
        for (const member of this.members.values())
            if (!member.peer)
                fight.pending.push({ kind: 'autos', fighters: this.mine(member.player.userId), on: true });
        this.tell();
        for (const member of this.members.values())
            if (member.peer)
                this.showFight(member.peer, fight);
        fight.stop = this.deps.every(TM_FIGHT.turnMs, () => void this.turn(fight));
        return null;
    }
    /** Whether hero `fighter` of the fight is `userId`'s (one who has left the room has none to use). */
    owns(userId, fighter) {
        return this.fight !== null && !this.fight.done && this.members.has(userId) && this.fight.owners[fighter] === userId;
    }
    /** `userId` presses skill `skill` of their hero `fighter`. */
    press(userId, fighter, skill) {
        if (this.owns(userId, fighter) && this.pressing(userId))
            this.fight?.pending.push({ kind: 'skill', fighter, skill });
    }
    /**
     * Whether `userId` may press once more before the fight is next stepped on (one more counted): no more than
     * TM_FIGHT.pressesPerTurn, more than anyone taps, so a page pressing without end can't fill the fight's presses (every
     * page coming back draws the fight again from all of them).
     */
    pressing(userId) {
        const { fight } = this;
        if (!fight)
            return false;
        const made = fight.presses.get(userId) ?? 0;
        if (made >= TM_FIGHT.pressesPerTurn)
            return false;
        fight.presses.set(userId, made + 1);
        return true;
    }
    /** The heroes of the fight that are `userId`'s, by their places in the lineup: not the Sub Team's, which are on Auto for good (one who has left the room: none). */
    mine(userId) {
        const { fight } = this;
        return fight && this.members.has(userId) ? fight.owners.flatMap((owner, fighter) => (owner === userId && !fight.start.heroes[fighter]?.sub ? [fighter] : [])) : [];
    }
    /** `userId` turns their hero `fighter`'s Auto on or off (not one of the Sub Team's). */
    auto(userId, fighter) {
        if (this.owns(userId, fighter) && this.mine(userId).includes(fighter) && this.pressing(userId))
            this.fight?.pending.push({ kind: 'auto', fighter });
    }
    /** The Divine Punishment Raid's Karma dungeon: `userId` picks card `card` of the three offered (the sim takes it when a pick is due). */
    card(userId, card) {
        const { fight } = this;
        if (fight && !fight.done && this.raid.kind === 'divine' && this.members.has(userId) && fight.owners.includes(userId) && this.pressing(userId))
            fight.pending.push({ kind: 'card', card });
    }
    /** `userId` turns every hero of theirs' Auto on (or, with all of them on already, off). */
    autoAll(userId) {
        if (this.fight && !this.fight.done && this.members.has(userId) && this.pressing(userId))
            this.fight.pending.push({ kind: 'autos', fighters: this.mine(userId) });
    }
    /** The host gives up the fight: lost. */
    giveUp(userId) {
        if (!this.fight || this.fight.done)
            return 'closed';
        if (userId !== this.host())
            return 'only_host';
        this.fight.pending.push({ kind: 'leave' });
        return null;
    }
    /**
     * `userId` leaves the fight for good (the page's Leave): it gives them nothing, and their heroes fight on, on Auto,
     * while they are out of the room at once, their place and picks with them. Alone, in a room of their own, the fight is
     * lost (and they stay in it, to get ready again).
     */
    quit(userId) {
        const member = this.members.get(userId);
        if (!member || !this.fight || this.fight.done)
            return 'closed';
        this.fight.forfeited.add(userId);
        if (this.single) {
            this.fight.pending.push({ kind: 'leave' });
            return null;
        }
        this.fight.pending.push({ kind: 'autos', fighters: this.mine(userId), on: true });
        member.awayEnds?.();
        this.members.delete(userId);
        this.lineup = this.lineup.filter((pick) => pick.owner !== userId);
        this.trim();
        // (The last one in it: nobody's left to fight it, so it is lost, and the room closes as it ends.)
        if (this.members.size === 0)
            this.fight.pending.push({ kind: 'leave' });
        this.tell();
        return null;
    }
    /** From a fight over, back to getting ready (anyone gone longer than TM_ROOM.awayMs is gone from the room; the rest are still waited for). */
    back(userId) {
        if (!this.members.has(userId) || this.phase !== 'over' || this.starting)
            return 'closed';
        this.phase = 'prep';
        this.over = null;
        this.ended = null;
        this.dropGone();
        this.tell();
        return null;
    }
    /** Those gone longer than TM_ROOM.awayMs out of the room, their picks with them. */
    dropGone() {
        for (const [id, member] of this.members)
            if (this.pastBack(member))
                this.members.delete(id);
        this.lineup = this.lineup.filter((pick) => this.members.has(pick.owner));
        this.trim();
    }
    /**
     * From a fight over, the same again: `userId` is in for the next fight, which starts by itself once everyone still waited
     * for is (the host can start it sooner: begin's `force`), never going back to getting ready. One with no hero in (in
     * since the fight began) takes the room back to getting ready, to pick theirs. Getting ready, the host's starts the fight
     * and anyone else's says they're ready.
     */
    async again(userId) {
        const member = this.members.get(userId);
        if (!member)
            return 'closed';
        if (this.phase === 'prep')
            return userId === this.host() ? this.begin(userId) : this.ready(userId, true);
        if (this.phase !== 'over' || this.starting)
            return 'closed';
        if (!this.lineup.some((pick) => pick.owner === userId))
            return this.back(userId);
        member.ready = true;
        return this.startIfAllIn();
    }
    /** A fight over: the next one starts once everyone still waited for is in for it (`again`); until then, the room as it is. */
    async startIfAllIn() {
        const waiting = [...this.members.values()].some((member) => !member.ready && !this.pastBack(member));
        if (this.phase !== 'over' || this.starting || waiting) {
            this.tell();
            return null;
        }
        this.dropGone();
        const host = this.host();
        return host ? this.begin(host) : null;
    }
    /**
     * `userId`'s page says its run of fight `no` (going on, or just over) parted from the bot's at `second` (its checksum then
     * wasn't the bot's). The bot's is the one that counts: each time, the page is given the fight again (its start and every
     * press so far), to run it again from the start up to where the bot's is (showing Reconnecting… meanwhile), but no more
     * than once every TM_FIGHT.resyncMs (a page asking without end is let be: it asks again by reconnecting). The same sim,
     * seed and presses never part, so it is something to look into: noted the first two times.
     */
    parted(userId, no, second) {
        const fight = [this.fight, this.ended].find((one) => one?.start.no === no);
        const member = this.members.get(userId);
        if (!fight || !member)
            return;
        const times = (fight.parted.get(userId) ?? 0) + 1;
        fight.parted.set(userId, times);
        if (times <= 2) {
            const again = times === 1 ? 'given the fight again' : 'again after it was given the fight again';
            console.warn(`A page's TechnoMagic Raid fight parted from the bot's (${again}): server ${this.guildId}, run ${fight.run.id}, sim ${SIM_VERSION}, second ${second}, player ${userId}.`);
        }
        const now = this.deps.now();
        if (!member.peer || now - (fight.resynced.get(userId) ?? -Infinity) < TM_FIGHT.resyncMs)
            return;
        fight.resynced.set(userId, now);
        this.showFight(member.peer, fight);
    }
    /** `userId` says `text` to the room, with a picture (`image`) or not. */
    say(userId, text, image) {
        const member = this.members.get(userId);
        const line = member && this.chat.say(member.player, text, this.deps.now(), image);
        if (line)
            this.send({ t: 'chat', line });
    }
    /**
     * The fight's clock: the steps due, each with what was asked of it before it; then everyone is told. (A turn that
     * comes while the last is still being stepped on waits for the next. A fight that fails is lost.)
     */
    async turn(fight) {
        if (fight.done || fight.stepping)
            return;
        fight.stepping = true;
        const due = Math.floor((this.deps.now() - fight.startedAt) / (STEP_SECONDS * 1000));
        try {
            fight.presses.clear();
            const progress = await fight.engine.advance(due, fight.pending.splice(0));
            if (fight.done)
                return;
            const told = { inputs: fight.inputs.length, sums: fight.sums.length };
            fight.tick = progress.tick;
            fight.inputs.push(...progress.inputs);
            fight.sums.push(...progress.sums);
            this.send(this.turnOf(fight, told.inputs, told.sums));
            if (progress.result)
                void this.finish(fight, progress.result, progress.karma ?? null);
        }
        catch (err) {
            console.error('A TechnoMagic Raid fight failed:', err);
            if (!fight.done)
                void this.finish(fight, 'lost');
        }
        finally {
            fight.stepping = false;
        }
    }
    /** What the pages are told of the fight: the presses from `from` on, and the checksums from `summed` on (each with its second, from 1). */
    turnOf(fight, from, summed) {
        const sums = fight.sums.slice(summed).map((sum, i) => [summed + i + 1, sum]);
        return { t: 'turn', no: fight.start.no, upTo: fight.tick, inputs: fight.inputs.slice(from), sums };
    }
    /** A page joining (or back) during a fight or as its result is up, or given it again (parted): what to run it from, and everything so far. */
    showFight(peer, fight) {
        peer.send({ t: 'fight', fight: fight.start });
        peer.send(this.turnOf(fight, 0, 0));
    }
    /** The fight is over (`result`; a karma run's `karma` outcome): what it gave each player, and the room shows it. */
    async finish(fight, result, karma = null) {
        fight.done = true;
        fight.stop();
        fight.engine.close();
        let got = new Map();
        try {
            got = await this.deps.finish(this.guildId, fight.run, fight.start.stage, result, fight.tick, fight.forfeited, karma);
        }
        catch (err) {
            console.error('Could not finish a TechnoMagic Raid run:', err);
        }
        if (this.fight !== fight)
            return;
        // A win opens the next stage (in its mode) for everyone in it to the end.
        if (result === 'won') {
            const mode = fight.start.mode ?? 'hard';
            for (const userId of fight.run.players.keys()) {
                if (fight.forfeited.has(userId))
                    continue;
                const member = this.members.get(userId);
                if (member)
                    member.cleared = { ...member.cleared, [mode]: Math.max(member.cleared[mode], fight.start.stage) };
            }
        }
        this.fight = null;
        this.ended = fight;
        this.phase = 'over';
        this.over = {
            result,
            no: fight.start.no,
            upTo: fight.tick,
            drops: Object.fromEntries([...got].map(([userId, { drops }]) => [userId, drops])),
            points: Object.fromEntries([...got].map(([userId, { points }]) => [userId, points])),
            ...(this.raid.kind === 'dragon' && { essences: Object.fromEntries([...got].map(([userId, { essences }]) => [userId, essences ?? {}])) }),
            gems: Object.fromEntries([...got].map(([userId, { gems }]) => [userId, gems ?? 0])),
            ...([...got.values()].some((one) => one.stones) && { stones: Object.fromEntries([...got].flatMap(([userId, { stones }]) => (stones ? [[userId, stones]] : []))) }),
            ...([...got.values()].some((one) => one.crystals) && { crystals: Object.fromEntries([...got].flatMap(([userId, { crystals }]) => (crystals ? [[userId, crystals]] : []))) }),
            ...([...got.values()].some((one) => one.reports) && { reports: Object.fromEntries([...got].flatMap(([userId, { reports }]) => (reports ? [[userId, reports]] : []))) }),
            firstClears: Object.fromEntries([...got].map(([userId, { firstClears }]) => [userId, firstClears ?? 0])),
            ...([...got.values()].some((one) => one.divine) && { divine: Object.fromEntries([...got].flatMap(([userId, { divine }]) => (divine ? [[userId, divine]] : []))) }),
        };
        // (A Divine Punishment run moved its opening on: read again.)
        const host = this.host();
        if (host)
            this.readDivine(host);
        // Those gone during it: still waited for, for what's left of their time.
        for (const member of this.members.values())
            if (!member.peer)
                this.waitFor(member);
        if (this.closeIfEmpty())
            return;
        this.tell();
    }
    send(message) {
        for (const member of this.members.values())
            member.peer?.send(message);
    }
    /** A Divine Punishment room's openings and picks, as the page shows them (its group's opening, Karma run, refusal, shards). */
    divineView() {
        const info = this.dungeon();
        const group = info?.group ?? 'apocalypsion';
        const state = this.divineState?.divine?.[group];
        const now = new Date(this.deps.now());
        const opening = state?.boss && openingOpen(state.boss, now) ? state.boss : null;
        return {
            group,
            opening: opening && { level: opening.level, expires: opening.expires.toISOString(), cleared: [...opening.cleared] },
            karma: state?.karma?.open === true,
            refusal: info ? enterRefusal(info, state, now) : 'not_open',
            empty: byTier(this.divineState?.shards?.empty?.[group]),
            full: byTier(this.divineState?.shards?.full?.[group]),
            shard: info?.kind === 'karma' ? null : this.shard,
            bring: info?.kind === 'karma' ? this.bring : null,
        };
    }
    /** Tells every page the room as it is now. */
    tell() {
        const host = this.host();
        // Getting ready, a new host (the room's first, or one taking over) starts at the highest stage they have opened, and
        // the stage is never past it.
        if (this.phase === 'prep' && !this.starting) {
            if (host !== this.stageHost)
                this.stage = this.unlocked();
            this.stageHost = host;
            this.stage = Math.min(this.stage, this.unlocked());
            // (A Divine Punishment room's is always its opening's level.)
            if (this.raid.kind === 'divine')
                this.stage = this.unlocked();
        }
        const state = this.stateOf();
        for (const [id, member] of this.members)
            member.peer?.send({ t: 'room', state: { ...state, you: id } });
        this.keepLineup();
    }
    /** The room as every page is told it (but for whose page it is). */
    stateOf() {
        const host = this.host();
        const players = [...this.members.values()].map((member, i) => ({
            id: member.player.userId,
            name: member.player.name,
            avatar: member.avatar,
            number: i + 1,
            host: member.player.userId === host,
            // (A fight over: whether they're in for the next one, the host too.)
            ready: (this.phase !== 'over' && member.player.userId === host) || member.ready,
            away: member.peer === null,
            limit: this.limit(member.player.userId),
            owned: [...member.owned.keys()],
            transcend: Object.fromEntries([...member.owned].filter(([, level]) => level > 0)),
            ...(member.worn && member.worn.size > 0 && { outfits: Object.fromEntries(member.worn) }),
        }));
        const state = {
            phase: this.phase,
            version: SIM_VERSION,
            raid: this.raid.kind,
            boss: this.boss,
            bosses: [...this.raid.bosses],
            room: this.id,
            mode: this.mode,
            stage: this.stage,
            stages: this.stages(),
            unlocked: this.unlocked(),
            slots: this.slots(),
            solo: this.solo(),
            link: this.id === null ? null : this.deps.link(this.guildId, this.boss.id, this.id),
            players,
            lineup: this.fight ? this.fight.start.heroes.map(({ owner, id, skin, sub }) => ({ owner, hero: id, skin, ...(sub && { sub }) })) : [...this.lineup],
            over: this.over,
            ...(this.raid.kind === 'divine' && { divine: this.divineView() }),
        };
        return state;
    }
    /**
     * A watcher's page (`peer`) starts following `userId`'s raid: the room as theirs is told it (from you = them), what's been
     * said in it, and the fight going on (or the one whose result is up) from its start, to run to where it is. From then on it
     * is sent what their page is (web/games/live.ts).
     */
    showTo(userId, peer) {
        if (!this.members.has(userId))
            return;
        peer.send({ t: 'room', state: { ...this.stateOf(), you: userId } });
        peer.send(this.chat.history());
        const shown = this.fight ?? (this.phase === 'over' ? this.ended : null);
        if (shown)
            this.showFight(peer, shown);
    }
    /** Whether another of the server's members could join it now: a raid (not anyone's own) getting ready, with room. */
    get joinable() {
        return this.id !== null && this.open;
    }
}
/** Every server's raids, and every player's own. */
export class TechnoMagicRooms {
    realDeps;
    raid;
    /** By the server's id and the raid's, or (a player's own) the boss's, the server's and the player's. */
    rooms = new Map();
    /** When raids against each boss in each server (by the boss's id and the server's) were last said in its channel. */
    announced = new Map();
    constructor(realDeps = realRoomDeps, raid = TECHNOMAGIC_RAID) {
        this.realDeps = realDeps;
        this.raid = raid;
    }
    /** The raid's boss of an id (the first, for one it hasn't). */
    bossOf(id) {
        return this.raid.bosses.find((boss) => boss.id === id) ?? this.raid.bosses[0];
    }
    static ownKey = (player, boss) => `own:${boss}:${player.guildId}:${player.userId}`;
    static raidKey = (guildId, id) => `raid:${guildId}:${id}`;
    /** `guildId`'s raid `id` (undefined: there is none, or it is over). */
    lobby(guildId, id) {
        return this.rooms.get(TechnoMagicRooms.raidKey(guildId, id));
    }
    /** `guildId`'s raids (not anyone's own), oldest first. */
    raidsIn(guildId) {
        return [...this.rooms.values()].filter((room) => room.guildId === guildId && room.id !== null);
    }
    /** Find Raid: `guildId`'s raids against `boss`, those that can be joined first (the fullest first), then the rest. */
    lobbies(guildId, boss) {
        const joinable = (view) => Number(view.phase === 'prep' && view.players < view.most);
        const views = this.raidsIn(guildId).flatMap((room) => (room.boss.id === boss ? (room.view() ?? []) : []));
        return views.sort((a, b) => joinable(b) - joinable(a) || b.players - a.players);
    }
    /** The boss a page asking for `wanted` (against `boss`) is to fight: the raid's, when it names one (null: that raid is gone). */
    bossFor(player, wanted, boss) {
        if (!wanted.room)
            return this.bossOf(boss);
        return this.lobby(player.guildId, wanted.room)?.boss ?? null;
    }
    /** A new id for a raid in `guildId`. */
    newId(guildId) {
        for (;;) {
            const id = randomBytes(4).toString('hex');
            if (!this.lobby(guildId, id))
                return id;
        }
    }
    /** A new room at `key` (a raid, `id`, or a player's own: null) against `against`; a raid is said in the server's channel. */
    create(key, player, deps, against, id) {
        const room = new TechnoMagicRoom(player.guildId, deps, (empty) => {
            if (this.rooms.get(key) === empty)
                this.rooms.delete(key);
        }, id === null, this.raid, against, id);
        this.rooms.set(key, room);
        const said = `${against.id}:${player.guildId}`;
        const now = deps.now();
        if (id !== null && now - (this.announced.get(said) ?? -Infinity) >= TM_FIGHT.announceMs) {
            this.announced.set(said, now);
            deps.announce(player.guildId, player.name, against.id, id);
        }
        return room;
    }
    /** The rooms `userId` is in, in server `guildId`. */
    roomsOf(guildId, userId) {
        return [...this.rooms.values()].filter((room) => room.guild === guildId && room.has(userId));
    }
    /** The room `userId`'s page is in, in `guildId` (null: none of the raid's). */
    roomWith(guildId, userId) {
        return this.roomsOf(guildId, userId).find((room) => room.peerOf(userId) !== null) ?? null;
    }
    /** A watcher's page starts following `userId`'s raid in `guildId` (TechnoMagicRoom.showTo): false when they're in none. */
    watch(guildId, userId, peer) {
        const room = this.roomWith(guildId, userId);
        room?.showTo(userId, peer);
        return room !== null;
    }
    /** The raid `userId` is in, in `guildId`, if others can join it now (getting ready, with room): its boss and id. */
    joinableOf(guildId, userId) {
        const room = this.roomWith(guildId, userId);
        return room?.joinable && room.id !== null ? { boss: room.boss.id, room: room.id } : null;
    }
    /** Whether `userId` is fighting in one of the raid's rooms in `guildId` (or one is starting with them in it). */
    fighting(guildId, userId) {
        return this.roomsOf(guildId, userId).some((room) => room.fighting(userId));
    }
    /** Sends `userId`'s page in `guildId` away from any room of the raid's it's in, saying why (`code`): its closing takes them out of it. */
    sendAway(guildId, userId, code) {
        for (const room of this.roomsOf(guildId, userId)) {
            const peer = room.peerOf(userId);
            if (peer)
                refuse(peer, code);
        }
    }
    /**
     * Puts `player`'s page in a room (see TechnoMagicRoom.join): `single`, a room of their own against `boss` (one of the
     * raid's: its first, for none); else the raid `wanted` names, a new one (`create`), or one against `boss` (one they're in
     * already, else an open one), or a new one when there is none. Null when the raid named is full, or gone. A page of
     * theirs in another room is taken over, as one in the same room is: one page a player.
     */
    join(player, peer, owned, cleared = 0, deps = this.realDeps, single = false, boss, wanted = {}) {
        const against = this.bossOf(boss);
        let room;
        if (single) {
            // (The Divine Punishment Raid's: one a player whatever the dungeon, taken to the one asked for.)
            const divine = this.raid.kind === 'divine';
            const key = TechnoMagicRooms.ownKey(player, divine ? 'divine' : against.id);
            const had = this.rooms.get(key);
            room = had ?? this.create(key, player, deps, against, null);
            if (divine && had && boss !== undefined && had.boss.id !== against.id) {
                const joined = room;
                queueMicrotask(() => void joined.setBoss(player.userId, against.id));
            }
        }
        else if (wanted.room) {
            room = this.lobby(player.guildId, wanted.room);
            if (!room || (room.full && !room.has(player.userId)))
                return null;
        }
        else {
            const raids = this.raidsIn(player.guildId).filter((one) => one.boss.id === against.id);
            room = wanted.create ? undefined : (raids.find((one) => one.has(player.userId)) ?? raids.find((one) => one.open));
            if (!room) {
                const id = this.newId(player.guildId);
                room = this.create(TechnoMagicRooms.raidKey(player.guildId, id), player, deps, against, id);
            }
        }
        // (Their page in any other room of this raid's: taken over too.)
        const other = [...this.rooms.values()].find((one) => one !== room && one.peerOf(player.userId) !== null)?.peerOf(player.userId) ?? null;
        return { room, replaced: room.join(player, peer, owned, cleared) ?? other };
    }
}
export const technomagicRooms = new TechnoMagicRooms();
export const dragonRooms = new TechnoMagicRooms(realDragonDeps, DRAGON_RAID);
export const divineRooms = new TechnoMagicRooms(realDivineDeps, DIVINE_RAID);
//# sourceMappingURL=room.js.map