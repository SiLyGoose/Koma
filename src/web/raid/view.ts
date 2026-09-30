import { CONFIG } from '../../config.js';
import { fmt } from '../../lib/format.js';
import { RAID_COMBAT, TEXT, type RaidBossId } from '../../constants/index.js';
import { bossBrief, intentText, moodOf, type RaidWeekInfo } from '../../commands/raid.js';
import { type RaidStats, actionProblem, bossHpFor, canAct, damageRanking, RAID_ACTIONS, type RaidAction } from '../../lib/events/raid.js';
import type { ActProblem, LiveRaid } from '../../lib/events/raid-live.js';
import type { RaidMood, RaidView } from './protocol.js';

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
});

/** What the winners were paid, with the currencies' emojis. */
const rewardText = (points: number, tokens: number, gems: number): string => TEXT.raid.rewardList(fmt(points), tokens, gems);

/** The boss's picture, under the bot's /api (api.ts serves it). */
export const picturePath = (boss: RaidBossId, mood: RaidMood): string => `/api/raid/boss?${new URLSearchParams({ boss, mood })}`;

/** `avatar` is a member's profile picture, when the bot knows it. */
export function raidView(you: string, week: RaidWeekInfo, live: LiveRaid | null, now: number = Date.now(), avatar: (userId: string) => string | null = () => null): RaidView {
  // The last raid, until a while after it ended (or the week reset).
  const recent = live && (live.phase !== 'over' || (live.endedAt !== null && now - live.endedAt < OVER_MS && now < week.resetsAt)) ? live : null;
  // One that never came to a fight (nobody joined, or it was called off) freed the week: the week is
  // shown as it stands (to start again), with a word on how the lobby went.
  const unfought = recent?.phase === 'over' && (recent.over?.end === 'no_players' || recent.over?.end === 'called_off') ? recent.over.end : null;
  const current = unfought ? null : recent;
  const bossId = current?.boss ?? week.boss;
  const b = TEXT.raid.bosses[bossId];
  const base = {
    you,
    names: current ? Object.fromEntries(current.names) : {},
    avatars: current ? Object.fromEntries([...current.names.keys()].flatMap((id) => (avatar(id) ? [[id, avatar(id) as string]] : []))) : {},
    boss: { id: bossId, name: b.name, emoji: b.emoji },
    brief: bossBrief(CONFIG.raid, bossId),
    resetsAt: week.resetsAt,
    idle: null,
    lobby: null,
    fight: null,
    over: null,
  };
  const view = (mood: RaidMood, rest: Partial<RaidView> & Pick<RaidView, 'phase'>): RaidView => ({ ...base, mood, picture: picturePath(bossId, mood), ...rest });

  if (current?.phase === 'lobby' && current.lobby) {
    const { players, closesAt } = current.lobby;
    const bossHp = bossHpFor(Math.max(1, players.length), CONFIG.raid, RAID_COMBAT.hpShare[bossId]);
    return view('calm', { phase: 'lobby', lobby: { host: players[0] ?? current.host, players: [...players], closesAt, bossHp } });
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
          picked: turn.choices.get(p.userId)?.action ?? null,
          canAct: canAct(p),
        })),
        log: log.slice(-LOG_LINES),
        problems,
      },
    });
  }

  if (current?.phase === 'over' && current.over) {
    const { end, state, rewarded } = current.over;
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
      },
    });
  }

  // No raid going on here, but this week's was fought: how it went (read back from the database).
  if (week.result) {
    const { end, rounds, lastHit, players, reward, gear } = week.result;
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
      },
    });
  }

  // No raid going on here (as far as this bot knows): how the week stands.
  const status = week.status;
  const fought = status === 'won' || status === 'wiped' || status === 'fled';
  const idleWeek = fought ? status : status === null ? 'open' : 'busy';
  const mood: RaidMood = status === 'won' ? 'defeated' : status === 'wiped' ? 'gloating' : status === 'fled' ? 'fled' : 'calm';
  return view(mood, { phase: 'idle', idle: { week: idleWeek, canStart: idleWeek === 'open' && week.channel, ...(unfought ? { last: unfought } : {}) } });
}
