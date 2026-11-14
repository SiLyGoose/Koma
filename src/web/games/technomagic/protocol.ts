import type { ClientMessage } from '../../../protocol/technomagic.js';
import { DIVINE_GROUPS, DIVINE_LEVELS } from '../../../lib/game/divine.js';
import { parseChat } from '../chat.js';

export * from '../../../protocol/technomagic.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/technomagic.ts (the site keeps a copy). */

const id = (n: unknown): n is string => typeof n === 'string' && n.length > 0 && n.length <= 64;
const index = (n: unknown, below: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < below;

/** The highest stage a page may name, past the Divine Punishment Raid's Infinite levels too. */
const MOST_STAGE_ASKED = Math.max(99, DIVINE_LEVELS);

/** The most shards a page may bring into one run. */
const MOST_SHARDS = 999;

/** A shard pick (`tiers` its tiers), null (none), or undefined (not said); false: not a valid one. */
function shardPick<T extends number>(raw: unknown, tiers: readonly T[]): { tier: T; count: number } | null | undefined | false {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'object') return false;
  const { tier, count } = raw as Record<string, unknown>;
  return tiers.includes(tier as T) && index(count, MOST_SHARDS + 1) && count >= 1 ? { tier: tier as T, count } : false;
}

/** Reads a message from the page (a watcher's first, `watch`, among them). Null when it isn't a valid one. */
export function parseClientMessage(text: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      if (typeof m.token !== 'string' || m.token.length > 512 || (m.single !== undefined && typeof m.single !== 'boolean') || (m.boss !== undefined && !id(m.boss))) return null;
      if ((m.room !== undefined && !id(m.room)) || (m.create !== undefined && typeof m.create !== 'boolean')) return null;
      return {
        t: 'hello',
        token: m.token,
        ...(m.single === true && { single: true }),
        ...(typeof m.boss === 'string' && { boss: m.boss }),
        ...(typeof m.room === 'string' && { room: m.room }),
        ...(m.create === true && { create: true }),
      };
    case 'watch':
      return typeof m.token === 'string' && m.token.length <= 512 ? { t: 'watch', token: m.token } : null;
    case 'pick':
      if (!id(m.hero) || !index(m.skin, 64) || (m.sub !== undefined && typeof m.sub !== 'boolean')) return null;
      return m.sub ? { t: 'pick', hero: m.hero, skin: m.skin, sub: true } : { t: 'pick', hero: m.hero, skin: m.skin };
    case 'unpick':
      return id(m.hero) ? { t: 'unpick', hero: m.hero } : null;
    case 'ready':
      return typeof m.on === 'boolean' ? { t: 'ready', on: m.on } : null;
    case 'stage':
      return index(m.stage, MOST_STAGE_ASKED + 1) ? { t: 'stage', stage: m.stage } : null;
    case 'mode':
      return m.mode === 'normal' || m.mode === 'hard' ? { t: 'mode', mode: m.mode } : null;
    case 'press':
      return index(m.fighter, 64) && index(m.skill, 16) ? { t: 'press', fighter: m.fighter, skill: m.skill } : null;
    case 'auto':
      return index(m.fighter, 64) ? { t: 'auto', fighter: m.fighter } : null;
    case 'boss':
      return id(m.boss) ? { t: 'boss', boss: m.boss } : null;
    case 'begin':
      if (m.force !== undefined && typeof m.force !== 'boolean') return null;
      return m.force ? { t: 'begin', force: true } : { t: 'begin' };
    case 'part':
    case 'auto-all':
    case 'give-up':
    case 'quit':
    case 'back':
    case 'again':
    case 'heroes':
      return { t: m.t };
    case 'card':
      return m.card === 0 || m.card === 1 || m.card === 2 ? { t: 'card', card: m.card } : null;
    case 'divine': {
      if (m.group !== undefined && !DIVINE_GROUPS.includes(m.group as never)) return null;
      if (m.boss !== undefined && !id(m.boss)) return null;
      const shard = shardPick(m.shard, [1, 2, 3, 4, 5] as const);
      const empty = shardPick(m.empty, [2, 3, 4, 5] as const);
      if (shard === false || empty === false) return null;
      return {
        t: 'divine',
        ...(typeof m.group === 'string' && { group: m.group as (typeof DIVINE_GROUPS)[number] }),
        ...(typeof m.boss === 'string' && { boss: m.boss }),
        ...(shard !== undefined && { shard }),
        ...(empty !== undefined && { empty }),
      };
    }
    case 'parted':
      return index(m.no, 2 ** 31) && index(m.second, 2 ** 31) ? { t: 'parted', no: m.no, second: m.second } : null;
    case 'chat':
      return parseChat(m);
    default:
      return null;
  }
}
