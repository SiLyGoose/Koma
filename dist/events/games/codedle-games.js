const going = new Map();
const ended = new Map();
const listeners = new Set();
/** The Codedle going on in `guildId` (null: none). */
export const codedleIn = (guildId) => going.get(guildId) ?? null;
/** How the last Codedle in `guildId` ended (null: none has, since the bot started). */
export const lastCodedle = (guildId) => ended.get(guildId) ?? null;
/** Calls `listener` with the server whenever its Codedle changes (it opens, takes a guess, or ends). Returns a function that stops it. */
export function onCodedleChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
/** Tells everyone listening that `guildId`'s Codedle has changed. */
export function codedleChanged(guildId) {
    for (const listener of listeners) {
        try {
            listener(guildId);
        }
        catch (err) {
            console.error('A Codedle listener failed:', err);
        }
    }
}
/** `game` opens in `guildId`. */
export function codedleOpened(guildId, game) {
    going.set(guildId, game);
    codedleChanged(guildId);
}
/** `guildId`'s Codedle is over: how it ended (null: it failed, and is just gone). */
export function codedleClosed(guildId, end) {
    going.delete(guildId);
    if (end)
        ended.set(guildId, end);
    codedleChanged(guildId);
}
//# sourceMappingURL=codedle-games.js.map