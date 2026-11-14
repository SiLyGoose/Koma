import { decodePng } from '../animations/images/render/png-decode.js';
import { AVATAR } from '../constants/index.js';
export const fetchBytes = async (url) => {
    if (!url.startsWith('https://'))
        return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(AVATAR.timeoutMs) });
    if (!res.ok)
        return null;
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > AVATAR.maxBytes)
        return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length <= AVATAR.maxBytes ? bytes : null;
};
const cache = new Map();
/** Empties the memory of fetched pictures (for tests). */
export const clearAvatarCache = () => cache.clear();
/** The decoded picture at `url`, or null. A picture is fetched once and kept; a failure is not kept, so the next game tries again. */
export function fetchAvatar(url, get = fetchBytes) {
    const known = cache.get(url);
    if (known)
        return known;
    const pending = (async () => {
        try {
            const bytes = await get(url);
            return bytes ? decodePng(bytes) : null;
        }
        catch {
            return null;
        }
    })();
    cache.set(url, pending);
    void pending.then((avatar) => {
        if (!avatar && cache.get(url) === pending)
            cache.delete(url);
    });
    while (cache.size > AVATAR.cacheMax) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined)
            break;
        cache.delete(oldest);
    }
    return pending;
}
/** Their server nickname, else their display name, else their username. */
export function nameOf(user, member) {
    const found = member?.displayName ?? member?.nick ?? user.displayName ?? user.globalName ?? user.username;
    return found && found.trim() !== '' ? found : 'Player';
}
/** A player's name and picture. Their server picture, if they have one, comes before their own. Never throws. */
export async function loadProfile(user, member, get = fetchBytes) {
    const name = nameOf(user, member);
    let url;
    try {
        const options = { extension: 'png', size: AVATAR.size, forceStatic: true };
        url = member?.displayAvatarURL?.(options) ?? user.displayAvatarURL?.(options);
    }
    catch {
        url = undefined;
    }
    return { name, avatar: url ? await fetchAvatar(url, get) : null };
}
//# sourceMappingURL=profile.js.map