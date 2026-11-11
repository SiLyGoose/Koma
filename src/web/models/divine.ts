import { BLASPHEMY_STORAGE, DIVINE_SHOP } from '../../constants/divine.js';
import { BLASPHEMY_BREAK_FRAGMENTS } from '../../data/divine-kr.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { KR_RUNES_BY_ID } from '../../data/kr-gear.js';
import { collections } from '../../db.js';
import {
  blasphemyCost,
  bossOpenPrice,
  clearsNow,
  DIVINE_GROUPS,
  DIVINE_INFO,
  DIVINE_LEVELS,
  dungeonsOf,
  enterRefusal,
  finalLines,
  finalRow,
  highestOpenable,
  KARMA_OPEN_PRICE,
  KR_BLASPHEMY,
  lineText,
  openingOpen,
  rewardLevelFirst,
  rewardLevels,
  sideLines,
  sumLines,
  windowLive,
  type BlasphemyRuneData,
  type DivineBossInfo,
} from '../../lib/game/divine.js';
import { krLine, HERO_STATS } from '../../lib/game/heroes.js';
import type { HeroStat } from '../../protocol/heroes.js';
import type { BlasphemyView, DivineError, DivineGroupView, DivineRewardItem, DivineRewardsView, DivineView, DpFragment, ShardTier, VoidSocket } from '../../protocol/divine.js';
import {
  breakBlasphemy,
  breakSocketedBlasphemy,
  buyVoidRunes,
  craftBlasphemy,
  craftDivineArtifact,
  extendBlasphemyStorage,
  FRAGMENT_ARTIFACTS,
  nextExtension,
  openDivine,
  resetDivine,
  socketBlasphemy,
  socketedBlasphemy,
  storageOf,
  unsocketBlasphemy,
  useUniqueTicket,
  type DivineResult,
} from '../../services/divine.js';
import type { SelectorPick } from '../../services/mail.js';
import type { BlasphemyCopyDoc, DivineGroupDoc, DivineGroupId, MemberDoc } from '../../types.js';

/*
 * The Divine Punishment Raid's page (/api/divine): the member's openings, counters, shop, crafting and Runes of Blasphemy as the
 * site shows them (divineView), and the store that changes them (services/divine.ts), each answering the view after or why not.
 */

const GROUP_NAME: Readonly<Record<DivineGroupId, string>> = { apocalypsion: 'Apocalypsion', solenis: 'Solenis' };
const FRAGMENTS: readonly DpFragment[] = ['doomstone', 'tear', 'fuel', 'engraving'];
const SOCKETS: readonly VoidSocket[] = ['doh', 'laz', 'geb', 'oth', 'ans'];
const TIERS: readonly ShardTier[] = ['1', '2', '3', '4', '5'];
const byTier = (of: Partial<Record<ShardTier, number>> | undefined): Record<ShardTier, number> => Object.fromEntries(TIERS.map((tier) => [tier, of?.[tier] ?? 0])) as Record<ShardTier, number>;

/** One of the member's Runes of Blasphemy as the page shows it (null: its rune isn't the sim's). */
export function blasphemyView(copy: BlasphemyCopyDoc, socketed: { copy: string; socket: number } | null, data: readonly BlasphemyRuneData[] = KR_BLASPHEMY): BlasphemyView | null {
  const rune = data.find((one) => one.id === copy.rune);
  if (!rune) return null;
  const stat = rune.main.stat;
  return {
    id: copy.id,
    rune: rune.id,
    name: rune.name,
    group: rune.group,
    socket: rune.socket,
    color: rune.color,
    icon: rune.icon,
    main: { stat, value: copy.main, line: stat in HERO_STATS ? krLine(stat as HeroStat, copy.main) : stat },
    lines: rune.lines.map((line, i) => ({ skill: line.skill, value: copy.lines[i] ?? line.min, text: lineText(line, copy.lines[i] ?? line.min) })),
    socketed,
    at: copy.at.toISOString(),
  };
}

/** Whether a rune is a Rune of Blasphemy's gauge's: Legendary, or Velkazar (grade 5, not Ancient). */
const gaugeRune = (id: string): boolean => {
  const rune = KR_RUNES_BY_ID.get(id);
  return !!rune && (rune.grade === 6 || (rune.grade === 5 && rune.ancient !== true));
};

/** A group as the page shows it: its window, prices, best level, Karma run, dungeons (each with why it can't be entered now), Blood and shards. */
function groupView(member: Partial<Pick<MemberDoc, 'divine' | 'blood' | 'shards'>> | null, group: DivineGroupId, now: Date, info: readonly DivineBossInfo[]): DivineGroupView {
  const state = member?.divine?.[group];
  const boss = state?.boss;
  return {
    id: group,
    name: GROUP_NAME[group],
    window: boss && windowLive(boss, now) ? { open: openingOpen(boss, now), level: boss.level, since: boss.since.toISOString(), expires: boss.expires.toISOString(), clears: boss.clears, cleared: [...boss.cleared] } : null,
    price: bossOpenPrice(clearsNow(boss, now)),
    highest: highestOpenable(state),
    best: state?.best ?? 0,
    karma: { open: state?.karma?.open === true, price: KARMA_OPEN_PRICE },
    dungeons: info.filter((one) => one.group === group).map((one) => ({ id: one.id, name: one.name, kind: one.kind, time: one.time, refusal: enterRefusal(one, state, now, info) })),
    blood: member?.blood?.[group] ?? 0,
    empty: byTier(member?.shards?.empty?.[group]),
    full: byTier(member?.shards?.full?.[group]),
  };
}

/** The Divine Punishment page's view, from the member and where their Runes of Blasphemy are socketed. */
export function divineView(
  member: Partial<Pick<MemberDoc, 'points' | 'divine' | 'blood' | 'dpFragments' | 'shards' | 'voidRunes' | 'uniqueTickets' | 'runeFragments' | 'runes' | 'blasphemy' | 'blasphemySlots'>> | null,
  socketed: ReadonlyMap<string, { copy: string; socket: number }>,
  now: Date = new Date(),
  data: readonly BlasphemyRuneData[] = KR_BLASPHEMY,
  info: readonly DivineBossInfo[] = DIVINE_INFO,
): DivineView {
  const owned = member?.blasphemy ?? [];
  const slots = storageOf(member);
  const cost = blasphemyCost(owned.length);
  return {
    balance: member?.points ?? 0,
    levels: DIVINE_LEVELS,
    groups: DIVINE_GROUPS.map((group) => groupView(member, group, now, info)),
    fragments: Object.fromEntries(FRAGMENTS.map((id) => [id, member?.dpFragments?.[id] ?? 0])) as Record<DpFragment, number>,
    voidRunes: Object.fromEntries(SOCKETS.map((id) => [id, member?.voidRunes?.[id] ?? 0])) as Record<VoidSocket, number>,
    uniqueTickets: member?.uniqueTickets ?? 0,
    runeFragments: member?.runeFragments ?? 0,
    ingredientRunes: Object.fromEntries(Object.entries(member?.runes ?? {}).filter(([id, n]) => n > 0 && gaugeRune(id))),
    shop: { voidPrice: DIVINE_SHOP.voidPrice },
    artifacts: FRAGMENTS.map((fragment) => ({ fragment, itemId: FRAGMENT_ARTIFACTS[fragment], name: ITEMS_BY_ID.get(FRAGMENT_ARTIFACTS[fragment])?.name ?? FRAGMENT_ARTIFACTS[fragment], fragments: DIVINE_SHOP.artifactFragments, points: DIVINE_SHOP.artifactPoints })),
    blasphemy: {
      owned: owned.flatMap((copy) => blasphemyView(copy, socketed.get(copy.id) ?? null, data) ?? []),
      slots,
      stored: owned.filter((copy) => !socketed.has(copy.id)).length,
      most: BLASPHEMY_STORAGE.most,
      extend: nextExtension(slots),
      keepPrice: BLASPHEMY_STORAGE.keepPrice,
      breakFragments: BLASPHEMY_BREAK_FRAGMENTS,
      craft: cost,
      recipes: data.map((one) => ({ id: one.id, name: one.name, group: one.group, socket: one.socket, legend: one.legend })),
    },
  };
}

/** Every set of `sides` (the empty set first, then by size, each in their order). */
function subsets(sides: readonly string[]): string[][] {
  const out: string[][] = [[]];
  for (let size = 1; size <= sides.length; size++) {
    const pick = (from: number, chosen: string[]): void => {
      if (chosen.length === size) return void out.push(chosen);
      for (let i = from; i < sides.length; i++) pick(i + 1, [...chosen, sides[i] as string]);
    };
    pick(0, []);
  }
  return out;
}

/**
 * A group's Reward List at `level` (King's Raid's PunishmentRaidRewardInfoPopup), read from the lines a win pays (lib/game/divine.ts
 * sideLines, finalLines): its final boss's Clear Reward and its win by each set of side bosses cleared its table has, and each side
 * boss's Sub reward. No level: the one King's Raid's opens at (the opening's, else the one after the best). Refused: a level not 1
 * to five past the best.
 */
export function rewardsView(state: DivineGroupDoc | undefined, group: DivineGroupId, level: number | undefined, now: Date = new Date(), info: readonly DivineBossInfo[] = DIVINE_INFO): DivineRewardsView | 'bad_level' {
  const most = rewardLevels(state);
  const at = level ?? rewardLevelFirst(state, now);
  if (!Number.isInteger(at) || at < 1 || at > most) return 'bad_level';
  const items = (lines: ReturnType<typeof sideLines>): DivineRewardItem[] => sumLines(lines).map((line) => ({ key: line.key, count: line.count, ...(line.ratio !== undefined && { ratio: line.ratio }) }));
  const final = dungeonsOf(group, 'final', info)[0];
  const sides = dungeonsOf(group, 'side', info);
  const finalId = final?.id ?? group;
  return {
    group,
    level: at,
    most,
    final: {
      id: finalId,
      name: final?.name ?? GROUP_NAME[group],
      items: items(finalLines(finalId, [], at)),
      byCleared: subsets(sides.map((one) => one.id))
        .filter((cleared) => finalRow(finalId, cleared))
        .map((cleared) => ({ cleared, items: items(finalLines(finalId, cleared, at)) })),
    },
    sides: sides.map((one) => ({ id: one.id, name: one.name, items: items(sideLines(one.id, at)) })),
  };
}

/** The member's view, read. */
async function load(guildId: string, userId: string): Promise<DivineView> {
  const [member, socketed] = await Promise.all([collections().members.findOne({ guildId, userId }), socketedBlasphemy(guildId, userId)]);
  return divineView(member, socketed);
}

/** The Divine Punishment page's reads and changes (the database's; tests stand in for it). */
export interface DivineStore {
  view: (guildId: string, userId: string) => Promise<DivineView>;
  rewards: (guildId: string, userId: string, group: DivineGroupId, level?: number) => Promise<DivineRewardsView | DivineError>;
  open: (guildId: string, userId: string, group: DivineGroupId, type: 'boss' | 'karma', level?: number) => Promise<DivineView | DivineError>;
  reset: (guildId: string, userId: string, group: DivineGroupId) => Promise<DivineView | DivineError>;
  buyVoid: (guildId: string, userId: string, socket: VoidSocket, count: number) => Promise<DivineView | DivineError>;
  artifact: (guildId: string, userId: string, fragment: DpFragment) => Promise<{ view: DivineView; crafted: string } | DivineError>;
  ticket: (guildId: string, userId: string, of: 'uw' | 'ut', pick: SelectorPick) => Promise<{ view: DivineView; given: string } | DivineError>;
  craft: (guildId: string, userId: string, rune: string, ingredients: Record<string, number>) => Promise<{ view: DivineView; crafted: BlasphemyView } | DivineError>;
  breakStored: (guildId: string, userId: string, id: string) => Promise<{ view: DivineView; fragments: number } | DivineError>;
  breakSocketed: (guildId: string, userId: string, copy: string, socket: number) => Promise<{ view: DivineView; fragments: number } | DivineError>;
  extend: (guildId: string, userId: string) => Promise<DivineView | DivineError>;
  socket: (guildId: string, userId: string, copy: string, socket: number, id: string) => Promise<DivineView | DivineError>;
  unsocket: (guildId: string, userId: string, copy: string, socket: number) => Promise<DivineView | DivineError>;
}

/** The view after a change, or why it wasn't made. */
const after = async (guildId: string, userId: string, result: DivineResult<unknown>): Promise<DivineView | DivineError> => (result.ok ? load(guildId, userId) : result.reason);
/** The same, with what the change came to. */
async function afterWith<T, K extends string>(guildId: string, userId: string, result: DivineResult<T>, key: K): Promise<({ view: DivineView } & Record<K, T>) | DivineError> {
  if (!result.ok) return result.reason;
  return { view: await load(guildId, userId), [key]: result.value } as { view: DivineView } & Record<K, T>;
}

export const divineStore: DivineStore = {
  view: load,
  async rewards(guildId, userId, group, level) {
    const member = await collections().members.findOne({ guildId, userId }, { projection: { divine: 1 } });
    return rewardsView(member?.divine?.[group], group, level);
  },
  open: async (guildId, userId, group, type, level) => after(guildId, userId, await openDivine(guildId, userId, group, type, level)),
  reset: async (guildId, userId, group) => after(guildId, userId, await resetDivine(guildId, userId, group)),
  buyVoid: async (guildId, userId, socket, count) => after(guildId, userId, await buyVoidRunes(guildId, userId, socket, count)),
  artifact: async (guildId, userId, fragment) => afterWith(guildId, userId, await craftDivineArtifact(guildId, userId, fragment), 'crafted'),
  ticket: async (guildId, userId, of, pick) => afterWith(guildId, userId, await useUniqueTicket(guildId, userId, of, pick), 'given'),
  craft: async (guildId, userId, rune, ingredients) => {
    const made = await craftBlasphemy(guildId, userId, rune, ingredients);
    if (!made.ok) return made.reason;
    const view = await load(guildId, userId);
    const crafted = view.blasphemy.owned.find((one) => one.id === made.value.id) ?? blasphemyView(made.value, null);
    return crafted ? { view, crafted } : 'busy';
  },
  breakStored: async (guildId, userId, id) => afterWith(guildId, userId, await breakBlasphemy(guildId, userId, id), 'fragments'),
  breakSocketed: async (guildId, userId, copy, socket) => afterWith(guildId, userId, await breakSocketedBlasphemy(guildId, userId, copy, socket), 'fragments'),
  extend: async (guildId, userId) => after(guildId, userId, await extendBlasphemyStorage(guildId, userId)),
  socket: async (guildId, userId, copy, socket, id) => after(guildId, userId, await socketBlasphemy(guildId, userId, copy, socket, id)),
  unsocket: async (guildId, userId, copy, socket) => after(guildId, userId, await unsocketBlasphemy(guildId, userId, copy, socket)),
};
