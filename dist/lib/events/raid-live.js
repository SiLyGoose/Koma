export class LiveRaid {
    guildId;
    boss;
    host;
    names;
    phase = 'lobby';
    lobby = null;
    fight = null;
    over = null;
    /** When it ended (ms), once it has. */
    endedAt = null;
    /** Its difficulty level: the lobby's pick, settled as the fight starts. */
    difficulty = 1;
    /** Each raider's gear as the fight started (web/models/gear.ts's wornGear), for the site's end screen. */
    gear = new Map();
    constructor(guildId, boss, host, 
    /** Display names seen so far (the lobby adds whoever joins). */
    names) {
        this.guildId = guildId;
        this.boss = boss;
        this.host = host;
        this.names = names;
    }
    /** Something about the raid changed: tells whoever is following the server's raids. */
    changed() {
        for (const listener of WATCHERS.get(this.guildId) ?? []) {
            try {
                listener();
            }
            catch (err) {
                console.error('A raid watcher failed:', err);
            }
        }
    }
    openLobby(lobby) {
        this.phase = 'lobby';
        this.lobby = lobby;
        this.changed();
    }
    openFight(fight) {
        this.phase = 'fight';
        this.lobby = null;
        this.fight = fight;
        this.changed();
    }
    end(over) {
        this.phase = 'over';
        this.lobby = null;
        this.fight = null;
        this.over = over;
        this.endedAt = Date.now();
        this.changed();
    }
}
const RAIDS = new Map();
const WATCHERS = new Map();
/** Opens the raid in `guildId` (in its lobby), in place of the last one there. */
export function openLiveRaid(guildId, boss, host, names) {
    const raid = new LiveRaid(guildId, boss, host, names);
    RAIDS.set(guildId, raid);
    return raid;
}
/** The raid in `guildId`: going on, or the last one to end. Null when there hasn't been one since the bot started. */
export const liveRaid = (guildId) => RAIDS.get(guildId) ?? null;
/** Calls `listener` whenever the raid in `guildId` changes, or a new one opens. Returns a function that stops it. */
export function watchRaids(guildId, listener) {
    let set = WATCHERS.get(guildId);
    if (!set) {
        set = new Set();
        WATCHERS.set(guildId, set);
    }
    set.add(listener);
    return () => {
        set.delete(listener);
        if (set.size === 0)
            WATCHERS.delete(guildId);
    };
}
/** For tests: forgets every raid and watcher. */
export function clearLiveRaids() {
    RAIDS.clear();
    WATCHERS.clear();
}
//# sourceMappingURL=raid-live.js.map