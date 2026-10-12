import { CONFIG } from '../../../config.js';
import { fmt } from '../../../lib/format.js';
import { RAID_DIFFICULTY, TEXT, type RaidBossId } from '../../../constants/index.js';
import { ITEMS_BY_ID } from '../../../data/items.js';
import { bossBrief, intentText, moodOf, type RaidWeekInfo } from '../../../commands/raid.js';
import { type RaidStats, actionProblem, bossHpFor, canAct, damageRanking, difficultyOf, RAID_ACTIONS, type RaidAction } from '../../../lib/events/raid.js';
import type { ActProblem, LiveRaid } from '../../../lib/events/raid-live.js';
import { raidDropCounts, raidDropsOn } from '../../../lib/game/items/raid-drops.js';
import { STARS, type ItemDef } from '../../../types.js';
import type { RaidLevel, RaidLootItem, RaidMood, RaidView } from './protocol.js';

/*
 * The raid as one player's page sees it (protocol.ts's RaidView): the raid going on in their server
 * (lib/events/raid-live.ts), or, with none, how this week's raid stands.
 */

/** How many lines of the action log a page is sent. */
const LOG_LINES = 30;

/** How long a page keeps showing how the last raid ended, before going back to how the week stands. */
const OVER_MS = 30 * 60_000;

/** What a raider did, for the end screen (the stats raids from before didn't keep count as 0). */
export const statsOf = (s: Partial<RaidStats> | undefined) => ({
  damage: s?.damage ?? 0,
  healed: s?.healed ?? 0,
  mitigated: s?.mitigated ?? 0,
  healedSelf: s?.healedSelf ?? 0,
  healedAllies: s?.healedAllies ?? 0,
  supportDamage: s?.supportDamage ?? 0,
  damageTaken: s?.damageTaken ?? 0,
});

/** What the winners were paid, with the currencies' emojis. */
const rewardText = (points: number, tokens: number, gems: number): string => TEXT.raid.rewardList(fmt(points), tokens, gems);

/** What each difficulty level does to the boss and drops for a win, for the page's pickers (before the lobby, and in it). */
const difficultyLevels = (): RaidLevel[] =>
  Array.from({ length: RAID_DIFFICULTY.max }, (_, i) => {
    const { level, hp, damage } = difficultyOf(i + 1, CONFIG.raid);
    const counts = raidDropCounts(level);
    const drops = raidDropsOn(CONFIG.raid) ? [...STARS].reverse().flatMap((stars) => ((counts[stars] ?? 0) > 0 ? [{ stars, count: counts[stars] ?? 0 }] : [])) : [];
    return { level, hp, damage, drops };
  });

/** The raid items one raider found, for their loot screen: best first. Null when they found none. */
function lootOf(key: string | undefined, items: readonly { item: ItemDef; isNew?: boolean }[]): { key: string; items: RaidLootItem[] } | null {
  if (key === undefined || items.length === 0) return null;
  return {
    key,
    items: [...items]
      .sort((a, b) => b.item.stars - a.item.stars)
      .map(({ item, isNew }) => ({ itemId: item.id, name: item.name, stars: item.stars, slot: item.slot, ...(isNew === undefined ? {} : { isNew }) })),
  };
}

/** The boss's picture, under the bot's /api (api.ts serves it). */
export const picturePath = (boss: RaidBossId, mood: RaidMood): string => `/api/raid/boss?${new URLSearchParams({ boss, mood })}`;

/** `avatar` is a member's profile picture, when the bot knows it. */
export function raidView(you: string, week: RaidWeekInfo, live: LiveRaid | null, now: number = Date.now(), avatar: (userId: string) => string | null = () => null): RaidView {
  // The last raid, until a while after it ended (or the week reset).
  const recent = live && (live.phase !== 'over' || (live.endedAt !== null && now - live.endedAt < OVER_MS && now < week.resetsAt)) ? live : null;
  // One that never came to a fight (everyone left, it was disbanded, or it was called off) freed the
  // week: the week is shown as it stands (to start again), with a word on how the lobby went.
  const end = recent?.phase === 'over' ? recent.over?.end : undefined;
  const unfought = end === 'no_players' || end === 'disbanded' || end === 'called_off' ? end : null;
  const current = unfought ? null : recent;
  const bossId = current?.boss ?? week.boss;
  const b = TEXT.raid.bosses[bossId];
  const difficulty = current?.difficulty ?? week.result?.difficulty ?? 1;
  const base = {
    you,
    names: current ? Object.fromEntries(current.names) : {},
    avatars: current ? Object.fromEntries([...current.names.keys()].flatMap((id) => (avatar(id) ? [[id, avatar(id) as string]] : []))) : {},
    boss: { id: bossId, name: b.name, emoji: b.emoji },
    brief: bossBrief(CONFIG.raid, bossId, difficulty),
    drops: raidDropsOn(CONFIG.raid) ? { chance: CONFIG.raid.dropChance, perRaider: CONFIG.raid.dropChancePerRaider } : null,
    difficulty,
    resetsAt: week.resetsAt,
    idle: null,
    lobby: null,
    fight: null,
    over: null,
  };
  const view = (mood: RaidMood, rest: Partial<RaidView> & Pick<RaidView, 'phase'>): RaidView => ({ ...base, mood, picture: picturePath(bossId, mood), ...rest });

  if (current?.phase === 'lobby' && current.lobby) {
    const { players, maxDifficulty } = current.lobby;
    const picked = current.lobby.difficulty;
    const bossHp = bossHpFor(players.length, bossId, CONFIG.raid, difficultyOf(picked, CONFIG.raid).hp);
    return view('calm', {
      phase: 'lobby',
      difficulty: picked,
      brief: bossBrief(CONFIG.raid, bossId, picked),
      lobby: { host: players[0] ?? current.host, players: [...players], bossHp, difficulty: picked, maxDifficulty, topDifficulty: RAID_DIFFICULTY.max, levels: difficultyLevels() },
    });
  }

  if (current?.phase === 'fight' && current.fight) {
    const { state, log } = current.fight;
    const turn = current.fight.turn();
    const problems = Object.fromEntries(RAID_ACTIONS.map((action) => [action, actionProblem(state, you, action)])) as Record<RaidAction, ActProblem | null>;
    return view(moodOf(state), {
      phase: 'fight',
      fight: {
        round: state.round,
        maxRounds: state.maxRounds,
        bossHp: state.bossHp,
        bossMaxHp: state.bossMaxHp,
        enrage: state.enrage,
        shielded: state.shielded,
        deflects: state.deflects,
        rallied: state.rallied,
        rallyMultiplier: state.rallyMultiplier,
        intent: intentText(state),
        open: turn.open,
        endsAt: turn.endsAt,
        players: state.players.map((p) => ({
          userId: p.userId,
          hp: p.hp,
          maxHp: p.maxHp,
          cc: p.hp > 0 && p.cc ? { effect: p.cc.effect, turns: p.cc.turns } : null,
          blight: p.hp > 0 ? p.blight : 0,
          picked: turn.choices.get(p.userId)?.action ?? null,
          canAct: canAct(p),
        })),
        log: log.slice(-LOG_LINES),
        problems,
      },
    });
  }

  if (current?.phase === 'over' && current.over) {
    const { end, state, rewarded, loot } = current.over;
    const cfg = CONFIG.raid;
    return view(state ? moodOf(state) : 'calm', {
      phase: 'over',
      over: {
        end,
        rounds: state?.round ?? 0,
        bossHp: state?.bossHp ?? 0,
        bossMaxHp: state?.bossMaxHp ?? 0,
        ranking: state ? damageRanking(state).map((p) => ({ userId: p.userId, damage: p.stats.damage })) : [],
        players: state ? state.players.map((p) => ({ userId: p.userId, ...statsOf(p.stats) })) : [],
        lastHit: state?.lastHit ?? null,
        reward: rewarded ? { points: cfg.reward, tokens: cfg.tokenReward, gems: cfg.gemReward } : null,
        rewardText: rewarded ? rewardText(cfg.reward, cfg.tokenReward, cfg.gemReward) : null,
        gear: current.gear.size > 0,
        loot: lootOf(loot?.key, loot?.drops.filter((drop) => drop.userId === you) ?? []),
      },
    });
  }

  // No raid going on here, but this week's was fought: how it went (read back from the database).
  if (week.result) {
    const { end, rounds, lastHit, players, reward, gear, drops, lootKey } = week.result;
    const mine = (drops?.[you] ?? []).flatMap((id) => (ITEMS_BY_ID.get(id) ? [{ item: ITEMS_BY_ID.get(id) as ItemDef }] : []));
    const mood: RaidMood = end === 'won' ? 'defeated' : end === 'wiped' ? 'gloating' : 'fled';
    return view(mood, {
      phase: 'over',
      names: week.names ?? {},
      avatars: Object.fromEntries(players.flatMap((p) => (avatar(p.userId) ? [[p.userId, avatar(p.userId) as string]] : []))),
      over: {
        end,
        rounds,
        bossHp: null,
        bossMaxHp: null,
        ranking: [...players].sort((a, b) => b.damage - a.damage).filter((p) => p.damage > 0).map((p) => ({ userId: p.userId, damage: p.damage })),
        players,
        lastHit,
        reward,
        rewardText: reward ? rewardText(reward.points, reward.tokens, reward.gems) : null,
        gear: gear === true,
        loot: lootOf(lootKey, mine),
      },
    });
  }

  // No raid going on here (as far as this bot knows): how the week stands.
  const status = week.status;
  const fought = status === 'won' || status === 'wiped' || status === 'fled';
  const idleWeek = fought ? status : status === null ? 'open' : 'busy';
  const mood: RaidMood = status === 'won' ? 'defeated' : status === 'wiped' ? 'gloating' : status === 'fled' ? 'fled' : 'calm';
  const canStart = idleWeek === 'open' && week.channel;
  // Whoever starts it picks its difficulty first.
  const pick = canStart ? { pick: { maxDifficulty: week.maxDifficulty, topDifficulty: RAID_DIFFICULTY.max, levels: difficultyLevels() } } : {};
  return view(mood, { phase: 'idle', idle: { week: idleWeek, canStart, ...(unfought ? { last: unfought } : {}), ...pick } });
}
