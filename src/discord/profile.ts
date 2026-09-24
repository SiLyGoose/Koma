import { decodePng, type Avatar } from '../animations/images/png-decode.js';
import { AVATAR } from '../constants/index.js';

/*
 * What the blackjack table shows for a player: their name and profile picture. The picture is
 * fetched from Discord's CDN as a small PNG and decoded (see png-decode.ts). It is decoration, so
 * nothing here ever fails: a picture that can't be fetched (slow, gone, not a PNG) is null, and the
 * name falls back to whatever is known.
 */

export interface Profile {
  name: string;
  avatar: Avatar | null;
}

/** Fetches the bytes at a URL, or null if that didn't work. Swapped out in tests. */
export type FetchBytes = (url: string) => Promise<Uint8Array | null>;

export const fetchBytes: FetchBytes = async (url) => {
  if (!url.startsWith('https://')) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(AVATAR.timeoutMs) });
  if (!res.ok) return null;
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > AVATAR.maxBytes) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length <= AVATAR.maxBytes ? bytes : null;
};

const cache = new Map<string, Promise<Avatar | null>>();

/** Empties the memory of fetched pictures (for tests). */
export const clearAvatarCache = (): void => cache.clear();

/** The decoded picture at `url`, or null. A picture is fetched once and kept; a failure is not kept, so the next game tries again. */
export function fetchAvatar(url: string, get: FetchBytes = fetchBytes): Promise<Avatar | null> {
  const known = cache.get(url);
  if (known) return known;
  const pending = (async (): Promise<Avatar | null> => {
    try {
      const bytes = await get(url);
      return bytes ? decodePng(bytes) : null;
    } catch {
      return null;
    }
  })();
  cache.set(url, pending);
  void pending.then((avatar) => {
    if (!avatar && cache.get(url) === pending) cache.delete(url);
  });
  while (cache.size > AVATAR.cacheMax) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return pending;
}

/** The parts of a Discord user and server member that are looked at (so tests can pass plain objects). */
interface UserLike {
  id?: string;
  username?: string;
  globalName?: string | null;
  displayName?: string;
  displayAvatarURL?: (options: { extension: 'png'; size: number; forceStatic: boolean }) => string;
}
interface MemberLike {
  displayName?: string;
  nick?: string | null;
  displayAvatarURL?: UserLike['displayAvatarURL'];
}

/** Their server nickname, else their display name, else their username. */
export function nameOf(user: UserLike, member?: MemberLike | null): string {
  const found = member?.displayName ?? member?.nick ?? user.displayName ?? user.globalName ?? user.username;
  return found && found.trim() !== '' ? found : 'Player';
}

/** A player's name and picture. Their server picture, if they have one, comes before their own. Never throws. */
export async function loadProfile(user: UserLike, member?: MemberLike | null, get: FetchBytes = fetchBytes): Promise<Profile> {
  const name = nameOf(user, member);
  let url: string | undefined;
  try {
    const options = { extension: 'png', size: AVATAR.size, forceStatic: true } as const;
    url = member?.displayAvatarURL?.(options) ?? user.displayAvatarURL?.(options);
  } catch {
    url = undefined;
  }
  return { name, avatar: url ? await fetchAvatar(url, get) : null };
}
