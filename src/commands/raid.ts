import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  GuildMember,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Client,
  type Interaction,
  type Message,
} from 'discord.js';
import { CONFIG, isAdmin, type Settings } from '../config.js';
import { RAID, RAID_BOSS_IDS, RAID_COMBAT, RAID_EMOJI, TEXT, type RaidBossId } from '../constants/index.js';
import { type DragonMood } from '../animations/images/dragon-image.js';
import { raidBossPicture } from '../animations/images/raid-boss-image.js';
import { replyPrivately } from '../discord/reply.js';
import type { Command, CommandContext } from '../discord/types.js';
import { claimGuild } from '../events/busy.js';
import { limitedLines } from '../events/games/vault-game.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import {
  actionProblem,
  bossHealCut,
  bossHpFor,
  bossTurn,
  canAct,
  CC_EFFECT,
  createRaid,
  damageRanking,
  emptyGear,
  equipPlayers,
  raidGearFrom,
  type RaidGear,
  emptyStats,
  endRound,
  enrageLevel,
  findPlayer,
  hasBlight,
  isAlive,
  HEALING_MOVES,
  isCcMove,
  livingPlayers,
  MOVE_KIND,
  movesOf,
  participants,
  recordTheft,
  resolvePlayerTurn,
  type BossIntent,
  type BossMove,
  type RaidAction,
  type RaidChoice,
  type RaidEvent,
  type RaidState,
  type RaidStats,
} from '../lib/events/raid.js';
import { bossForWeek } from '../lib/events/raid-boss.js';
import { raidWeek, type RaidWeek } from '../lib/events/raid-week.js';
import { liveRaid, openLiveRaid, type ActAnswer, type LiveRaid, type RaidLobbyLive } from '../lib/events/raid-live.js';
import { siteGameLink, webConfig } from '../web/config.js';
import { gearStore, wornGear, type GearView } from '../web/models/gear.js';
import { statsOf } from '../web/games/raid/view.js';
import { getChannelId } from '../services/channel.js';
import { getPrefix } from '../services/settings.js';
import { pickRandom } from '../lib/random.js';
import { commandPrefix } from '../discord/slash.js';
import { chargeForSkip, raidWeekDocs, refundSkip } from '../services/skips.js';
import { gearEffects } from '../lib/game/items/equipment.js';
import { getEquipment } from '../services/items/equipment.js';
import { raidDropChance, raidDropsOn } from '../lib/game/items/raid-drops.js';
import { fmt, formatMultiplier, formatPercent, joinLimited, mention, starString } from '../lib/format.js';
import { sleep } from '../lib/time.js';
import type { RaidDoc } from '../types.js';
import {
  abandonRaid,
  findRaid,
  finishRaid,
  listUnfinishedRaids,
  raidId,
  resetRaidWeek,
  rewardRaid,
  startRaidWeek,
  saveRaidGear,
  stealFromWallet,
  updateRaid,
  type RaidReward,
} from '../services/raid.js';

/*
 * The weekly raid boss: `raid` opens a lobby, and when it closes the party fights this week's boss
 * in rounds on one live message (lib/events/raid.ts has the rules). One raid per server per week,
 * resetting every Saturday at midnight Eastern (lib/events/raid-week.ts), against the boss the
 * week picked (lib/events/raid-boss.ts). The server counts as busy for the whole raid, so no random
 * event starts in the middle of it.
 */

type RaidSettings = Settings['raid'];

const unixOf = (ms: number): number => Math.ceil(ms / 1000);
const unixOfDate = (date: Date): number => Math.floor(date.getTime() / 1000);

// ---------------------------------------------------------------------------
// What the fight looks like
// ---------------------------------------------------------------------------

/** A bar of `width` blocks, filled for the share of `hp` left. Never empty while there's HP left. */
export function hpBar(hp: number, max: number, width: number = RAID.barWidth, fill = '🟥'): string {
  const filled = hp <= 0 ? 0 : Math.max(1, Math.round((hp / max) * width));
  return fill.repeat(filled) + '⬛'.repeat(width - filled);
}

/** A player's HP bar: green when healthy, yellow from half HP, red from a quarter. */
export function playerHpBar(hp: number, max: number): string {
  const share = hp / max;
  const fill = share > 0.5 ? '🟩' : share > 0.25 ? '🟨' : '🟥';
  return hpBar(hp, max, RAID.playerBarWidth, fill);
}

/** What the boss is about to do, in words. */
export function intentText(state: RaidState, intent: BossIntent = state.intent): string {
  const text = moveIntentText(state, intent);
  return intent.empowered ? TEXT.raid.intent.empowered(text) : text;
}

function moveIntentText(state: RaidState, intent: BossIntent): string {
  const { multiplier } = intent;
  const target = mention(intent.targets[0] ?? '');
  const targets = intent.targets.map(mention).join(', ');
  const { moves, support } = RAID_COMBAT;
  const i = TEXT.raid.intent;
  const hit = (damage: number): number => Math.round(damage * multiplier);
  // What it heals, after any heal-cut gear on a raider still standing.
  const lifesteal = (intent.lifesteal ?? 1) * (1 - bossHealCut(state));
  switch (intent.move) {
    case 'claw':
      return i.claw(target, hit(moves.claw.damage));
    case 'breath':
      return i.breath(hit(moves.breath.damage));
    case 'sweep':
      return i.sweep(targets, hit(moves.sweep.damage));
    case 'hoard':
      return i.hoard(target);
    case 'shield':
      return i.shield(support.shieldBreak);
    case 'reap':
      return i.reap(target, hit(moves.reap.damage), formatMultiplier(moves.reap.lifesteal * lifesteal));
    case 'drain':
      return i.drain(hit(moves.drain.damage), formatMultiplier(moves.drain.lifesteal * lifesteal));
    case 'scythe':
      return i.scythe(targets, hit(moves.scythe.damage));
    case 'harvest':
      return i.harvest(target, hit(moves.harvest.damage), fmt(Math.round(state.bossMaxHp * moves.harvest.maxHpShare * lifesteal)));
    case 'veil':
      return i.veil(support.shieldBreak);
    case 'empower':
      return i.empower(formatMultiplier(RAID_COMBAT.empower.multiplier));
    case 'gather':
      return i.gather(
        moves.reckoning.chargeTurns - state.gathered,
        hit(moves.reckoning.damage),
        moves.reckoning.minTargets,
        moves.reckoning.maxTargets,
      );
    case 'reckoning':
      return i.reckoning(targets, hit(moves.reckoning.damage));
    case 'charge':
      return i.charge(hit(moves.drain.damage), RAID_COMBAT.requiem.casts);
    case 'requiem':
      return i.requiem(hit(moves.drain.damage), RAID_COMBAT.requiem.casts, formatMultiplier(moves.drain.lifesteal * lifesteal));
    case 'spit':
      return i.spit(target, hit(moves.spit.damage));
    case 'miasma':
      return i.miasma(hit(moves.miasma.damage));
    case 'rot':
      return i.rot(targets, hit(moves.rot.damage));
    case 'flies':
      return i.flies(support.shieldBreak);
    case 'brew':
      return i.brew();
    case 'pestilence':
      return i.pestilence();
    case 'stun':
    case 'disarm':
    case 'taunt':
      return i.cc(CC_EFFECT[intent.move], targets, RAID_COMBAT.cc.rounds);
  }
}

/** One line of the action log, in a fight against `boss`. */
export function eventText(event: RaidEvent, boss: RaidBossId = 'wyrm'): string {
  const log = TEXT.raid.log;
  const b = TEXT.raid.bosses[boss];
  const boost = (percent: number): string => (percent > 0 ? log.boost(percent) : '');
  switch (event.kind) {
    case 'guard':
      return log.guard(mention(event.userId));
    case 'heal':
      return log.heal(mention(event.userId), mention(event.targetId), event.amount, boost(event.boost));
    case 'revive':
      return log.revive(mention(event.userId), mention(event.targetId), event.hp, boost(event.boost));
    case 'healSplash':
      return log.healSplash(mention(event.userId), mention(event.targetId), event.amount);
    case 'healWasted':
      return log.healWasted(mention(event.userId));
    case 'rally':
      return log.rally(mention(event.userId), formatMultiplier(event.multiplier), event.turns);
    case 'cleansed':
      return log.cleansed(mention(event.userId), mention(event.targetId), event.effect);
    case 'purged':
      return log.purged(mention(event.userId), mention(event.targetId), event.stacks);
    case 'shieldBroken':
      return b.shieldBroken;
    case 'attack':
      return log.attack(mention(event.userId), fmt(event.damage), event.crit, boost(event.boost));
    case 'bounced':
      return log.bounced(b, mention(event.userId));
    case 'defeated':
      return log.defeated(mention(event.userId));
    case 'enrage':
      return log.enrage(b, event.level);
    case 'hit':
      // Only a one-target hit (Claw, Reap, Plague Spit) can be taken by a guard for someone else.
      if (event.coveredFor) return log.covered(event.move === 'reap' || event.move === 'spit' ? event.move : 'claw', mention(event.userId), mention(event.coveredFor), event.damage);
      return log[event.move](mention(event.userId), event.damage);
    case 'knockedOut':
      return log.knockedOut(mention(event.userId));
    case 'lifesteal':
      return log.lifesteal(b, event.amount, event.cut ? formatPercent(event.cut) : null);
    case 'shieldUp':
      return b.shieldUp;
    case 'charging':
      return log.charging(b);
    case 'requiem':
      return log.requiem(b);
    case 'empowered':
      return log.empowered(b);
    case 'gathering':
      return log.gathering(b, event.left);
    case 'brewing':
      return log.brewing(b);
    case 'pestilence':
      return log.pestilence(b);
    case 'festered':
      return log.festered(event.hits.map((h) => log.festerPart(mention(h.userId), h.damage)));
    case 'cc':
      return log.cc(event.effect, mention(event.userId));
    case 'hoardBlocked':
      return log.hoardBlocked(mention(event.userId), mention(event.targetId));
    case 'harvestBlocked':
      return log.harvestBlocked(mention(event.userId), mention(event.targetId));
    case 'stole':
      return event.amount > 0 ? log.stole(mention(event.userId), fmt(event.amount)) : log.stoleNothing(mention(event.userId));
    case 'wiped':
      return log.wiped;
    case 'fled':
      return b.fledLog;
  }
}

/** The moves that hit several raiders at once, whose hits can share a line of the log. */
type ManyMove = 'breath' | 'sweep' | 'drain' | 'scythe' | 'reckoning' | 'miasma' | 'rot';
const isManyMove = (move: BossMove): move is ManyMove => MOVE_KIND[move] === 'all' || MOVE_KIND[move] === 'some';

/**
 * The action log lines for one turn's events, in a fight against `boss`: several of the same thing
 * in a row (guards, attacks, attacks bouncing off, players hit by the same move that hits several,
 * knocked out, or put under the same crowd control) share one line; everything else gets its own
 * (eventText). A multi-target hit's knock-outs come on one line after it.
 */
export function eventLines(events: readonly RaidEvent[], boss: RaidBossId = 'wyrm'): string[] {
  const log = TEXT.raid.log;
  const b = TEXT.raid.bosses[boss];
  const boost = (percent: number): string => (percent > 0 ? log.boost(percent) : '');
  /** Which events can share a line with this one, or null if it always has its own. */
  const groupOf = (event: RaidEvent): string | null => {
    switch (event.kind) {
      case 'guard':
      case 'attack':
      case 'bounced':
      case 'knockedOut':
        return event.kind;
      case 'cc':
        return `cc:${event.effect}`;
      case 'hit':
        return isManyMove(event.move) && event.coveredFor === null ? `hit:${event.move}` : null;
      default:
        return null;
    }
  };

  const lines: string[] = [];
  for (let i = 0; i < events.length; ) {
    const first = events[i] as RaidEvent;
    const group = groupOf(first);
    if (group === null) {
      lines.push(eventText(first, boss));
      i++;
      continue;
    }
    // The run of events in this group. A multi-target hit also takes in the knock-outs between its hits.
    const run: RaidEvent[] = [];
    const knockedOut: string[] = [];
    let j = i;
    for (; j < events.length; j++) {
      const next = events[j] as RaidEvent;
      if (groupOf(next) === group) run.push(next);
      else if (first.kind === 'hit' && next.kind === 'knockedOut') knockedOut.push(mention(next.userId));
      else break;
    }
    i = j;
    if (run.length === 1) lines.push(eventText(first, boss));
    else lines.push(groupLine(run));
    if (knockedOut.length === 1) lines.push(log.knockedOut(knockedOut[0] as string));
    if (knockedOut.length > 1) lines.push(log.knockedOutMany(knockedOut));
  }
  return lines;

  function groupLine(run: RaidEvent[]): string {
    const first = run[0] as RaidEvent;
    const users = run.map((event) => mention('userId' in event ? event.userId : ''));
    switch (first.kind) {
      case 'guard':
        return log.guards(users);
      case 'bounced':
        return log.bouncedMany(b, users);
      case 'knockedOut':
        return log.knockedOutMany(users);
      case 'cc':
        return log.ccMany(first.effect, users);
      case 'attack': {
        const attacks = run as Extract<RaidEvent, { kind: 'attack' }>[];
        const same = attacks.every((a) => !a.crit && a.damage === first.damage && a.boost === first.boost);
        if (same) return log.attacks(users, fmt(first.damage), boost(first.boost));
        return log.attacksMixed(attacks.map((a) => log.attackPart(mention(a.userId), fmt(a.damage), a.crit, boost(a.boost))));
      }
      case 'hit': {
        const hits = run as Extract<RaidEvent, { kind: 'hit' }>[];
        const move = first.move as ManyMove;
        if (hits.every((h) => h.damage === first.damage)) return log.hits(move, users, first.damage);
        return log.hitsMixed(move, hits.map((h) => log.hitPart(mention(h.userId), h.damage)));
      }
      default:
        return run.map((event) => eventText(event, boss)).join('\n');
    }
  }
}

/** Which picture of the boss fits the fight right now (every boss has the same moods). */
export function moodOf(state: RaidState): DragonMood {
  if (state.bossHp <= 0) return 'defeated';
  if (state.outcome === 'wiped') return 'gloating';
  if (state.outcome === 'fled') return 'fled';
  if (state.shielded) return 'shielded';
  return state.enrage >= 2 ? 'furious' : state.enrage === 1 ? 'enraged' : 'calm';
}

/** The boss's picture in a mood, as a file to attach. */
export const bossFile = (boss: RaidBossId, mood: DragonMood) => ({ attachment: raidBossPicture(boss, mood), name: RAID.imageName });

function actionRow(disabled: boolean): ActionRowBuilder<ButtonBuilder> {
  const button = (id: string, label: string, emoji: string, style: ButtonStyle) =>
    new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(RAID.attackId, TEXT.raid.attackButton, RAID_EMOJI.attack, ButtonStyle.Danger),
    button(RAID.guardId, TEXT.raid.guardButton, RAID_EMOJI.guard, ButtonStyle.Primary),
    button(RAID.healId, TEXT.raid.healButton, RAID_EMOJI.heal, ButtonStyle.Success),
    button(RAID.supportId, TEXT.raid.supportButton, '✨', ButtonStyle.Secondary),
  );
}

/** The live fight screen. `turnEndsAt` is when the turn closes, or null while it is being resolved. */
export function fightEmbed(state: RaidState, choices: ReadonlyMap<string, RaidChoice>, log: readonly string[], turnEndsAt: number | null, cfg: RaidSettings): BotEmbed {
  const r = TEXT.raid;
  const b = r.bosses[state.boss];
  const tags = [
    state.enrage > 0 ? r.enraged(state.enrage) : '',
    state.shielded ? r.shielded(b) : '',
    state.rallied > 0 ? r.rallied(formatMultiplier(state.rallyMultiplier), state.rallied) : '',
  ].filter(Boolean);
  const description = [
    r.bossHp(hpBar(state.bossHp, state.bossMaxHp), fmt(state.bossHp), fmt(state.bossMaxHp)),
    ...tags,
    '',
    r.nextMove(intentText(state)),
    turnEndsAt === null ? r.resolving : r.turnEnds(unixOf(turnEndsAt)),
  ].join('\n');
  const party = state.players.map((p) => {
    const chosen = choices.get(p.userId);
    const status = !isAlive(p) ? r.statusDown : !canAct(p) ? r.statusStunned : chosen ? r.statusChosen[chosen.action] : r.statusWaiting;
    const tags = isAlive(p) ? [p.cc ? r.ccTag(p.cc.effect, p.cc.turns) : '', p.blight > 0 ? r.blightTag(p.blight) : ''].filter(Boolean).join(' ') : '';
    return r.partyLine(status, mention(p.userId), playerHpBar(p.hp, p.maxHp), p.hp, p.maxHp, tags);
  });
  return createEmbed()
    .setTitle(r.fightTitle(b, state.round, state.maxRounds))
    .setDescription(description)
    .addFields(
      // Cut by length, not a line count: the custom crowd-control emojis make some lines much longer than others.
      { name: r.partyField, value: party.length === 0 ? r.nobody : joinLimited(party) },
      { name: r.logField, value: log.length === 0 ? r.logEmpty : joinLimited(log.slice(-RAID.logSize)) },
    )
    .setImage(`attachment://${RAID.imageName}`);
}

/**
 * The line under the rewards about the raid drops (starting on a new line), or nothing when they're off.
 * With `raiders` (the lobby's party so far), it says the chance they have now too.
 */
const dropLine = (cfg: RaidSettings, raiders?: number): string =>
  raidDropsOn(cfg)
    ? `\n${TEXT.raid.dropChance(formatPercent(cfg.dropChance), formatPercent(cfg.dropChancePerRaider), raiders === undefined ? undefined : formatPercent(raidDropChance(raiders, cfg)))}`
    : '';

/** The screen once the fight is over: how it ended, and who did what (none of it changes the rewards). */
export function resultEmbed(state: RaidState, cfg: RaidSettings, nextRaid: Date, reward: RaidReward | null, intoVault = 0): BotEmbed {
  const r = TEXT.raid;
  const b = r.bosses[state.boss];
  const embed = createEmbed().setImage(`attachment://${RAID.imageName}`);
  const rounds = state.round;
  if (state.outcome === 'won') {
    embed.setTitle(r.wonTitle(b)).setDescription(r.won(rounds, fmt(cfg.reward), cfg.tokenReward, cfg.gemReward));
  } else {
    const how = state.outcome === 'wiped' ? r.wiped(rounds) : r.fled(b, rounds);
    embed
      .setTitle(state.outcome === 'wiped' ? r.wipedTitle(b) : r.fledTitle(b))
      .setDescription(`${how}\n${r.bossLeft(fmt(state.bossHp), fmt(state.bossMaxHp))}\n${r.nextRaid(unixOfDate(nextRaid))}`);
  }

  if (reward && raidDropsOn(cfg)) {
    const loot = reward.drops.map((drop) => r.lootLine(mention(drop.userId), starString(drop.item.stars), drop.item.name));
    embed.addFields({ name: r.lootField, value: loot.length === 0 ? r.noLoot : joinLimited(loot) });
  }
  addStatsFields(embed, state.players, state.lastHit, intoVault);
  if (reward && reward.failed.length > 0) embed.setFooter({ text: r.payFailed(reward.failed.length) });
  return embed;
}

/** Who did what in a fight: damage ranking, the final blow, team play, and points lost. */
function addStatsFields(embed: BotEmbed, players: readonly { userId: string; stats: RaidStats }[], lastHit: string | null, intoVault = 0): void {
  const r = TEXT.raid;
  const total = players.reduce((sum, p) => sum + p.stats.damage, 0);
  const ranking = damageRanking({ players }).map((p, i) =>
    r.rankingLine(r.places[i] ?? `**${i + 1}.**`, mention(p.userId), fmt(p.stats.damage), formatPercent(total > 0 ? p.stats.damage / total : 0)),
  );
  embed.addFields({ name: r.rankingField, value: ranking.length === 0 ? r.noDamage : joinLimited(ranking) });
  if (lastHit) embed.addFields({ name: r.lastHitField, value: mention(lastHit), inline: true });

  const team = players
    .filter((p) => p.stats.healed > 0 || p.stats.guards > 0 || p.stats.supports > 0)
    .map((p) => r.teamLine(mention(p.userId), p.stats.healed, p.stats.guards, p.stats.supports));
  if (team.length > 0) embed.addFields({ name: r.teamField, value: joinLimited(team) });

  const lost = players
    .filter((p) => p.stats.spent > 0 || p.stats.stolen > 0)
    .map((p) => r.pointsLine(mention(p.userId), p.stats.spent > 0 ? fmt(p.stats.spent) : null, fmt(p.stats.stolen)));
  const vaultLine = intoVault > 0 ? `
${r.intoVault(fmt(intoVault))}` : '';
  embed.addFields({ name: r.pointsField, value: lost.length === 0 ? r.noPointsLost : `${joinLimited(lost, 950)}${vaultLine}` });
}

/**
 * What `raid` shows once this week's raid has been fought (won or lost): how it ended, who did
 * what, and when the next one can be started. Raids saved before every stat was kept only have
 * damage; the rest shows as nothing for them.
 */
export function weekResultEmbed(raid: RaidDoc & { status: 'won' | 'wiped' | 'fled' }, nextRaid: Date): BotEmbed {
  const r = TEXT.raid;
  const b = r.bosses[raid.boss ?? 'wyrm'];
  const players = raid.players.map((userId) => ({
    userId,
    stats: raid.stats?.[userId] ?? { ...emptyStats(), damage: raid.damage?.[userId] ?? 0, spent: raid.spent[userId] ?? 0, stolen: raid.stolen[userId] ?? 0 },
  }));
  const ended = raid.endedAt ? unixOfDate(raid.endedAt) : null;
  const embed = createEmbed()
    .setTitle(r.weekTitle(b, raid.status))
    .setDescription(r.weekDescription(b, raid.status, raid.rounds ?? 0, players.length, ended, unixOfDate(nextRaid)));
  addStatsFields(embed, players, raid.lastHit ?? null);
  return embed;
}

/** Whether a raid has been fought to the end (not still in its lobby or fight). */
export const isFinished = (raid: RaidDoc): raid is RaidDoc & { status: 'won' | 'wiped' | 'fled' } =>
  raid.status === 'won' || raid.status === 'wiped' || raid.status === 'fled';

/**
 * `raid stats`: a boss itself, with the live raid settings: its HP, its phases, and its moves.
 * `until` is when its week ends, when it is this week's boss.
 */
/**
 * What a boss does, in words (Discord markdown), for `raid stats` and the site's raid page: its phases
 * (how much harder it hits, and its crowd control and healing, in each), its moves, and the rewards.
 */
export function bossBrief(cfg: RaidSettings, boss: RaidBossId): { phases: string[]; moves: string[]; rewards: string } {
  const r = TEXT.raid;
  const { moves, cc, enrage, support } = RAID_COMBAT;
  const hasCc = movesOf(boss).some(isCcMove);
  const heals = movesOf(boss).some((move) => HEALING_MOVES.includes(move));
  const phases = enrage.multipliers.map((multiplier, level) =>
    r.phaseLine(
      r.phaseNames[level] ?? `Phase ${level + 1}`,
      level === 0 ? null : formatPercent(enrage.thresholds[level - 1] ?? 0),
      formatMultiplier(multiplier),
      hasCc ? { cooldown: cc.cooldown[level] ?? cc.cooldown[0], targets: cc.targets[level] ?? cc.targets[0] } : null,
      heals ? formatMultiplier(enrage.lifesteal[level] ?? 1) : null,
    ),
  );
  const moveLine = (move: BossMove): string => {
    switch (move) {
      case 'claw':
        return r.moves.claw(moves.claw.damage);
      case 'breath':
        return r.moves.breath(moves.breath.damage);
      case 'sweep':
        return r.moves.sweep(moves.sweep.damage, moves.sweep.minTargets, moves.sweep.maxTargets);
      case 'hoard':
        return r.moves.hoard(fmt(moves.hoard.min), fmt(moves.hoard.max));
      case 'shield':
        return r.moves.shield(support.shieldBreak);
      case 'reap':
        return r.moves.reap(moves.reap.damage, moves.reap.lifesteal);
      case 'drain':
        return r.moves.drain(moves.drain.damage, moves.drain.lifesteal);
      case 'scythe':
        return r.moves.scythe(moves.scythe.damage, moves.scythe.minTargets, moves.scythe.maxTargets);
      case 'harvest':
        return r.moves.harvest(moves.harvest.damage, formatPercent(moves.harvest.maxHpShare));
      case 'veil':
        return r.moves.veil(support.shieldBreak);
      case 'empower':
        return r.moves.empower(formatMultiplier(RAID_COMBAT.empower.multiplier));
      case 'gather':
      case 'reckoning':
        return r.moves.reckoning(moves.reckoning.chargeTurns, moves.reckoning.damage, moves.reckoning.minTargets, moves.reckoning.maxTargets);
      case 'charge':
      case 'requiem':
        return r.moves.requiem(r.phaseNames[RAID_COMBAT.requiem.phase] ?? `Phase ${RAID_COMBAT.requiem.phase + 1}`, RAID_COMBAT.requiem.casts, RAID_COMBAT.requiem.cooldown);
      case 'spit':
        return r.moves.spit(moves.spit.damage, moves.spit.blight);
      case 'miasma':
        return r.moves.miasma(moves.miasma.damage, moves.miasma.blight);
      case 'rot':
        return r.moves.rot(moves.rot.damage, moves.rot.blight, moves.rot.raidersPerTarget);
      case 'flies':
        return r.moves.flies(support.shieldBreak);
      case 'brew':
      case 'pestilence':
        return r.moves.pestilence(formatPercent(RAID_COMBAT.pestilence.from), RAID_COMBAT.blight.maxStacks);
      case 'stun':
      case 'disarm':
      case 'taunt':
        return r.moves.cc(CC_EFFECT[move], cc.rounds);
    }
  };
  const special: BossMove[] = RAID_COMBAT.requiem.boss === boss ? ['requiem'] : [];
  const { blight } = RAID_COMBAT;
  const blightNote = hasBlight(boss)
    ? ['', r.movesBlightNote(blight.tick, formatPercent(blight.healCut), formatPercent(blight.maxHealCut), blight.supportCleanse, blight.supportCleanseAt, blight.maxStacks)]
    : [];
  const moveLines = [...[...movesOf(boss), ...special].map(moveLine), ...(hasCc ? ['', r.movesCcNote] : []), ...blightNote];
  return { phases, moves: moveLines, rewards: r.bossRewards(fmt(cfg.reward), cfg.tokenReward, cfg.gemReward) + dropLine(cfg) };
}

export function bossInfoEmbed(cfg: RaidSettings, boss: RaidBossId = 'wyrm', until?: Date): BotEmbed {
  const r = TEXT.raid;
  const b = r.bosses[boss];
  const examples = [3, 5, 8, 10].map((n) => r.bossHpExample(n, fmt(bossHpFor(n, boss, cfg)))).join(' · ');
  const { phases, moves: moveLines, rewards } = bossBrief(cfg, boss);
  return createEmbed()
    .setTitle(r.bossTitle(b))
    .setDescription(
      [
        ...(until ? [r.bossWeek(unixOfDate(until))] : []),
        r.bossInfoHp(fmt(cfg.hpPerRaider[boss]), fmt(cfg.hpOverhead[boss]), cfg.minRaiders, examples),
        r.bossRounds(b, cfg.maxRounds),
      ].join('\n'),
    )
    .addFields(
      { name: r.rewardsField, value: rewards },
      { name: r.phasesField, value: phases.join('\n') },
      { name: r.movesField, value: moveLines.join('\n') },
    )
    .setImage(`attachment://${RAID.imageName}`)
    .setFooter({ text: r.bossFooter });
}

export interface HealOption {
  label: string;
  value: string;
  description: string;
}

/**
 * The heal picker for `userId`: "whoever needs it most" first, then every ally who needs healing,
 * knocked-out ones first and then the most hurt (then the most blighted). Allies at full HP with no Blight are left out. `names` has the
 * display names seen in the lobby (a missing one shows as the user id).
 */
export function healOptions(state: RaidState, userId: string, names: ReadonlyMap<string, string>): HealOption[] {
  const r = TEXT.raid;
  const share = (p: RaidState['players'][number]): number => p.hp / p.maxHp;
  const allies = state.players
    .filter((p) => p.hp < p.maxHp || p.blight > 0)
    .sort((a, b) => share(a) - share(b))
    .slice(0, RAID.selectMax - 1)
    .map((p) => ({
      label: r.healOption(names.get(p.userId) ?? p.userId, p.userId === userId).slice(0, 100),
      value: p.userId,
      description: isAlive(p) ? r.healOptionHurt(p.hp, p.maxHp, p.blight) : r.healOptionDown,
    }));
  return [{ label: r.healAuto, value: RAID.healAutoValue, description: r.healAutoDescription }, ...allies];
}

/** The name a member goes by in the server, from a button they pressed. */
const displayNameOf = (press: Interaction): string => (press.member instanceof GuildMember ? press.member.displayName : press.user.displayName);

// ---------------------------------------------------------------------------
// Keeping the message up to date
// ---------------------------------------------------------------------------

/**
 * Edits the raid message at a safe pace (Discord limits message edits), always drawing the latest
 * state when an edit goes out. The boss's picture is only uploaded again when its mood changes.
 * `toBottom` moves the fight back to the bottom of the channel when chat has pushed it up.
 */
class RaidScreen {
  private dirty = false;
  private inFlight: Promise<void> | null = null;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly boss: RaidBossId,
    private message: Message,
    private readonly view: () => { embeds: BotEmbed[]; components: ActionRowBuilder<ButtonBuilder>[] },
    private readonly mood: () => DragonMood,
    private shownMood: DragonMood,
  ) {
    this.timer = setInterval(() => this.flush(), RAID.refreshMs);
  }

  /** Something changed: it goes out with the next edit. */
  update(): void {
    this.dirty = true;
  }

  private flush(): void {
    if (this.inFlight || !this.dirty) return;
    this.dirty = false;
    const mood = this.mood();
    const newPicture = mood !== this.shownMood;
    this.inFlight = this.message
      .edit({ ...this.view(), ...(newPicture ? { files: [bossFile(this.boss, mood)], attachments: [] } : {}) })
      .then(
        () => {
          if (newPicture) this.shownMood = mood;
        },
        (err) => console.error('Could not update the raid message:', err),
      )
      .finally(() => {
        this.inFlight = null;
      });
  }

  /** Waits for an edit that is going out, then sends the latest state at once. */
  async now(): Promise<void> {
    await this.inFlight;
    this.dirty = true;
    this.flush();
    await this.inFlight;
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.inFlight;
  }

  /** The message the raid is on right now (it changes when toBottom moves it). */
  get current(): Message {
    return this.message;
  }

  /**
   * If anything has been posted below the raid message, deletes it and sends the latest state as a
   * new message at the bottom of the channel, so the fight never scrolls out of sight. Returns true
   * when it moved (its buttons are then on the new message). If the new message can't be sent it
   * stays where it is; if the old one can't be deleted its buttons are taken away, so only the new
   * one can be pressed.
   */
  async toBottom(): Promise<boolean> {
    await this.inFlight;
    const old = this.message;
    const channel = old.channel;
    if (!channel.isSendable() || channel.lastMessageId === old.id) return false;
    const mood = this.mood();
    let moved: Message;
    try {
      moved = await channel.send({ ...this.view(), files: [bossFile(this.boss, mood)] });
    } catch (err) {
      console.error('Could not move the raid message to the bottom of the channel:', err);
      return false;
    }
    this.message = moved;
    this.shownMood = mood;
    this.dirty = false;
    await old.delete().catch(async () => {
      await old.edit({ components: [] }).catch(() => {});
    });
    return true;
  }
}

// ---------------------------------------------------------------------------
// The lobby
// ---------------------------------------------------------------------------

function lobbyView(guildId: string, boss: RaidBossId, host: string, players: readonly string[], closesAt: number, cfg: RaidSettings, open: boolean) {
  const r = TEXT.raid;
  const b = r.bosses[boss];
  const { support } = RAID_COMBAT;
  const lines = players.map((userId, i) => `${mention(userId)}${i === 0 ? r.hostTag : ''}`);
  const steals = movesOf(boss).includes('hoard');
  const hasCc = movesOf(boss).some(isCcMove);
  const embed = createEmbed()
    .setTitle(r.lobbyTitle(b))
    .setDescription(r.lobby(b, mention(host), unixOf(closesAt), cfg.maxRounds, fmt(cfg.reward), cfg.tokenReward, cfg.gemReward) + dropLine(cfg, players.length))
    .addFields(
      {
        name: r.howToField,
        value: r.howTo(
          b,
          cfg.turnSeconds,
          support.shieldBreak,
          formatMultiplier(support.attackMultiplier),
          support.rallyTurns,
          steals,
          hasCc,
          hasBlight(boss) ? { supportAt: RAID_COMBAT.blight.supportCleanseAt, clears: RAID_COMBAT.blight.supportCleanse } : null,
        ),
      },
      { name: r.playersField(players.length), value: limitedLines(lines, RAID.listMax, TEXT.common.moreLines, r.nobody), inline: true },
      { name: r.bossHpField(b), value: r.lobbyBossHp(fmt(bossHpFor(players.length, boss, cfg)), fmt(bossHpFor(0, boss, cfg))), inline: true },
    )
    .setImage(`attachment://${RAID.imageName}`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(RAID.joinId).setLabel(r.joinButton).setStyle(ButtonStyle.Success).setDisabled(!open),
    new ButtonBuilder().setCustomId(RAID.leaveId).setLabel(r.leaveButton).setStyle(ButtonStyle.Secondary).setDisabled(!open),
    new ButtonBuilder().setCustomId(RAID.startId).setLabel(r.startButton).setStyle(ButtonStyle.Primary).setDisabled(!open || players.length === 0),
  );
  // With the site up: the raid's page there, to join and fight from.
  const config = webConfig();
  if (config && open) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'raid', guildId)).setLabel(r.webButton).setEmoji('🌐'));
  return { embeds: [embed], components: [row] };
}

/**
 * Runs the lobby until it closes (time up, or the host starts early). Returns who is in, in the order
 * they joined. Discord's buttons and the site (through `live`) join, leave and start the same way.
 */
async function runLobby(
  guildId: string,
  boss: RaidBossId,
  message: Message,
  host: string,
  cfg: RaidSettings,
  raidId: string,
  names: Map<string, string>,
  live: LiveRaid,
): Promise<string[]> {
  const players = [host];
  const closesAt = Date.now() + cfg.prepareSeconds * 1000;
  let open = true;
  const screen = new RaidScreen(boss, message, () => lobbyView(guildId, boss, host, players, closesAt, cfg, true), () => 'calm', 'calm');
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: cfg.prepareSeconds * 1000 });
  const changed = (): void => {
    screen.update();
    live.changed();
  };

  const lobby: RaidLobbyLive = {
    players,
    closesAt,
    join(userId, name) {
      if (!open) return 'closed';
      if (players.includes(userId)) return 'already_joined';
      players.push(userId);
      names.set(userId, name);
      changed();
      return 'joined';
    },
    leave(userId) {
      if (!open) return 'closed';
      const at = players.indexOf(userId);
      if (at === -1) return 'not_joined';
      players.splice(at, 1);
      changed();
      return 'left';
    },
    // The first on the list: the host, or whoever joined next if they left.
    start(userId) {
      if (!open) return 'closed';
      if (players[0] !== userId) return 'only_host';
      collector.stop('start');
      return 'started';
    },
  };
  live.openLobby(lobby);

  collector.on('collect', (press) => {
    const userId = press.user.id;
    if (press.customId === RAID.joinId) {
      const answer = lobby.join(userId, displayNameOf(press));
      return void replyPrivately(press, answer === 'joined' ? TEXT.raid.joined : answer === 'closed' ? TEXT.raid.lobbyClosed : TEXT.raid.alreadyJoined);
    }
    if (press.customId === RAID.leaveId) {
      const answer = lobby.leave(userId);
      return void replyPrivately(press, answer === 'left' ? TEXT.raid.left : answer === 'closed' ? TEXT.raid.lobbyClosed : TEXT.raid.notJoined);
    }
    if (press.customId === RAID.startId) {
      const answer = lobby.start(userId);
      if (answer === 'only_host') return void replyPrivately(press, TEXT.raid.onlyHost);
      void press.deferUpdate().catch(() => {});
    }
  });

  await new Promise<void>((resolve) => collector.once('end', () => resolve()));
  open = false;
  await screen.stop();
  await updateRaid(raidId, { players }).catch((err) => console.error(`Could not save the players of raid ${raidId}:`, err));
  return [...players];
}

// ---------------------------------------------------------------------------
// The fight
// ---------------------------------------------------------------------------

const ACTION_BY_ID: Record<string, RaidAction> = {
  [RAID.attackId]: 'attack',
  [RAID.guardId]: 'guard',
  [RAID.healId]: 'heal',
  [RAID.supportId]: 'support',
};

interface Turn {
  round: number;
  open: boolean;
  endsAt: number;
  choices: Map<string, RaidChoice>;
  /** Called when every standing player has picked. */
  allIn: () => void;
}

/** Plays the fight on `message` until the boss falls, the party falls, or the rounds run out. */
/**
 * The fight going on in each server, for the admin's test tools (`raid test ...`), which change it
 * while it runs. `endTurn` ends the current turn at once. A fight the tools touched is `tested`, and
 * pays no rewards.
 */
interface LiveFight {
  state: RaidState;
  log: string[];
  update: () => void;
  endTurn: () => void;
  tested: boolean;
}
const LIVE = new Map<string, LiveFight>();

async function runFight(
  first: Message,
  state: RaidState,
  cfg: RaidSettings,
  raidId: string,
  guildId: string,
  names: ReadonlyMap<string, string>,
  live: LiveRaid,
  onMove: (message: Message) => void,
): Promise<{ tested: boolean }> {
  const log: string[] = [];
  let turn: Turn = { round: state.round, open: false, endsAt: 0, choices: new Map(), allIn: () => {} };

  const view = () => ({ embeds: [fightEmbed(state, turn.choices, log, turn.open ? turn.endsAt : null, cfg)], components: [actionRow(!turn.open)] });
  const screen = new RaidScreen(state.boss, first, view, () => moodOf(state), 'calm');
  /** Something changed: the raid message and the site's pages follow it. */
  const changed = (): void => {
    screen.update();
    live.changed();
  };

  const problemText = (problem: ReturnType<typeof actionProblem>, userId: string): string | null => {
    if (problem === 'not_playing') return TEXT.raid.notPlaying;
    if (problem === 'knocked_out') return TEXT.raid.knockedOut;
    if (problem === 'stunned' || problem === 'disarmed' || problem === 'taunted') return TEXT.raid.held(problem, findPlayer(state, userId)?.cc?.turns ?? 1);
    return null;
  };

  /** Locks in a player's pick for the turn (from Discord or the site). */
  const commit = (userId: string, action: RaidAction, forTurn: Turn, target?: string): ActAnswer => {
    if (forTurn !== turn || !forTurn.open) return { kind: 'late' };
    const problem = actionProblem(state, userId, action);
    if (problem) return { kind: 'problem', problem };
    const already = forTurn.choices.get(userId);
    if (already) return { kind: 'already', action: already.action };
    // A heal only goes to someone in the fight (the site could name anyone); anyone else lets the bot choose.
    const healTarget = target !== undefined && findPlayer(state, target) ? target : undefined;
    forTurn.choices.set(userId, { action, boost: 0, ...(healTarget === undefined ? {} : { target: healTarget }) });
    changed();
    if (state.players.filter(canAct).every((p) => forTurn.choices.has(p.userId))) forTurn.allIn();
    return { kind: 'ok' };
  };

  const commitText = (result: ActAnswer, action: RaidAction, userId: string, target?: string): string => {
    switch (result.kind) {
      case 'ok':
        return TEXT.raid.chose(TEXT.raid.actions[action], target === undefined ? '' : mention(target));
      case 'late':
        return TEXT.raid.turnOver;
      case 'already':
        return TEXT.raid.alreadyChose(TEXT.raid.actions[result.action]);
      case 'problem':
        return problemText(result.problem, userId) ?? TEXT.raid.turnOver;
    }
  };

  const remainingOf = (forTurn: Turn): number => forTurn.endsAt - Date.now();

  /**
   * Heal asks privately who to heal, then locks the heal in. The pick is undefined to let the bot
   * choose; if the turn ends before a pick is made, the reply says so.
   */
  const askHealTarget = async (press: ButtonInteraction, forTurn: Turn): Promise<void> => {
    await press.deferReply({ flags: MessageFlags.Ephemeral });
    const userId = press.user.id;
    const options = healOptions(state, userId, names);
    let target: string | undefined;
    // Somebody needs healing: ask who. (With nobody hurt there is nothing to pick, and the heal is played as usual.)
    if (options.length > 1) {
      const menu = new StringSelectMenuBuilder().setCustomId(RAID.healTargetId).setPlaceholder(TEXT.raid.healPlaceholder).addOptions(options);
      const prompt = await press.editReply({ content: TEXT.raid.healPrompt, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
      const pick = await prompt
        .awaitMessageComponent({ componentType: ComponentType.StringSelect, time: Math.max(1_000, remainingOf(forTurn)), filter: (m) => m.user.id === userId })
        .catch(() => null);
      if (!pick) {
        await press.editReply({ content: TEXT.raid.turnOver, components: [] }).catch(() => {});
        return;
      }
      await pick.deferUpdate().catch(() => {});
      const value = pick.values[0];
      target = value === undefined || value === RAID.healAutoValue ? undefined : value;
    }
    await press.editReply({ content: commitText(commit(userId, 'heal', forTurn, target), 'heal', userId, target), components: [] }).catch(() => {});
  };

  const handlePress = async (press: ButtonInteraction, forTurn: Turn): Promise<void> => {
    const action = ACTION_BY_ID[press.customId];
    if (!action) return replyPrivately(press, TEXT.raid.lobbyClosed);
    const userId = press.user.id;
    if (!forTurn.open || forTurn !== turn) return replyPrivately(press, TEXT.raid.turnOver);
    const problem = problemText(actionProblem(state, userId, action), userId);
    if (problem) return replyPrivately(press, problem);
    const already = forTurn.choices.get(userId);
    if (already) return replyPrivately(press, TEXT.raid.alreadyChose(TEXT.raid.actions[already.action]));

    if (action === 'heal') return askHealTarget(press, forTurn);
    return replyPrivately(press, commitText(commit(userId, action, forTurn), action, userId));
  };

  const tools: LiveFight = { state, log, update: changed, endTurn: () => {}, tested: false };
  LIVE.set(guildId, tools);
  live.openFight({ state, log, turn: () => turn, act: (userId, action, target) => commit(userId, action, turn, target) });
  try {
    await first.edit({ ...view(), files: [bossFile(state.boss, 'calm')], attachments: [] });
    for (;;) {
      // A test tool can end the fight between turns.
      if (state.outcome !== 'ongoing') {
        await screen.now();
        break;
      }
      // The players' turn. If chat pushed the fight up since the last one, it is re-sent at the bottom first.
      const choices = new Map<string, RaidChoice>();
      const endsAt = Date.now() + cfg.turnSeconds * 1000;
      turn = { round: state.round, open: true, endsAt, choices, allIn: () => {} };
      const current = turn;
      if (await screen.toBottom()) {
        onMove(screen.current);
        void updateRaid(raidId, { messageId: screen.current.id }).catch((err) => console.error(`Could not save where raid ${raidId} moved to:`, err));
      } else {
        await screen.now();
      }
      live.changed();
      const collector = screen.current.createMessageComponentCollector({ componentType: ComponentType.Button, time: Math.max(1_000, endsAt - Date.now()) });
      current.allIn = () => collector.stop('all');
      // Nobody can act (everyone standing is stunned): the turn doesn't wait for picks that can't come.
      if (!state.players.some(canAct)) collector.stop('all');
      tools.endTurn = () => collector.stop('test');
      collector.on('collect', (press) => {
        void handlePress(press, current).catch((err) => console.error('A raid button failed:', err));
      });
      await new Promise<void>((resolve) => collector.once('end', () => resolve()));
      current.open = false;
      live.changed();

      // Resolve it: the players' actions, then the boss's move, then the next move is announced.
      const events = resolvePlayerTurn(state, choices);
      const boss = bossTurn(state);
      events.push(...boss.events);
      if (boss.theft) {
        const taken = await stealFromWallet(guildId, boss.theft.userId, raidId, boss.theft.wanted).catch((err) => {
          console.error(`The raid boss could not steal from ${boss.theft?.userId}:`, err);
          return 0;
        });
        events.push(recordTheft(state, boss.theft.userId, taken));
      }
      events.push(...endRound(state));
      log.push(...eventLines(events, state.boss));
      live.changed();
      await screen.now();
      if (state.outcome !== 'ongoing') break;
      await sleep(RAID.resultMs);
    }
  } finally {
    LIVE.delete(guildId);
    await screen.stop();
  }
  return { tested: tools.tested };
}

type TestAction = 'hp' | 'calm' | 'enraged' | 'furious' | 'shield' | 'next' | 'kill' | 'wipe' | 'flee';
const TEST_ACTIONS: readonly TestAction[] = ['hp', 'calm', 'enraged', 'furious', 'shield', 'next', 'kill', 'wipe', 'flee'];

/**
 * Admin only: changes the fight going on in the server so each phase and ending can be seen on
 * Discord without playing it out. Returns what to tell the admin.
 */
export function applyRaidTest(fight: LiveFight, action: TestAction, userId: string, value?: string): string {
  const { state } = fight;
  const t = TEXT.raid.test;
  const b = TEXT.raid.bosses[state.boss];
  const setHp = (hp: number): void => {
    state.bossHp = Math.max(1, Math.min(state.bossMaxHp, Math.round(hp)));
    state.enrage = enrageLevel(state.bossHp, state.bossMaxHp);
  };
  let reply: string;
  switch (action) {
    case 'hp': {
      const text = (value ?? '').trim();
      const n = Number(text.replace(/[%,]/g, ''));
      if (text === '' || !Number.isFinite(n) || n <= 0) return t.badHp;
      setHp(text.endsWith('%') ? (state.bossMaxHp * n) / 100 : n);
      reply = t.hp(fmt(state.bossHp), fmt(state.bossMaxHp));
      break;
    }
    case 'calm':
    case 'enraged':
    case 'furious': {
      // Just inside each phase: full HP, then a hair under each enrage threshold.
      const [first = 0.5, second = 0.25] = RAID_COMBAT.enrage.thresholds;
      const share = action === 'calm' ? 1 : action === 'enraged' ? first - 0.01 : second - 0.01;
      setHp(state.bossMaxHp * share);
      reply = t.phase(action, fmt(state.bossHp));
      break;
    }
    case 'shield':
      state.shielded = !state.shielded;
      reply = state.shielded ? t.shieldOn(b) : t.shieldOff(b);
      break;
    case 'next':
      fight.endTurn();
      return t.next;
    case 'kill':
      fight.tested = true;
      state.bossHp = 0;
      state.lastHit = userId;
      state.outcome = 'won';
      fight.log.push(TEXT.raid.log.defeated(mention(userId)));
      fight.endTurn();
      return t.kill;
    case 'wipe':
      fight.tested = true;
      for (const player of state.players) player.hp = 0;
      state.outcome = 'wiped';
      fight.log.push(TEXT.raid.log.wiped);
      fight.endTurn();
      return t.wipe;
    case 'flee':
      fight.tested = true;
      state.outcome = 'fled';
      fight.log.push(b.fledLog);
      fight.endTurn();
      return t.flee;
  }
  fight.tested = true;
  fight.log.push(t.logLine(mention(userId), reply));
  fight.update();
  return reply;
}

/** A raider's raid perks, from what they have equipped when the fight starts. No gear (or no way to read it) means none. */
async function raidGearOf(guildId: string, userId: string): Promise<RaidGear> {
  try {
    return raidGearFrom(gearEffects(await getEquipment(guildId, userId), userId));
  } catch (err) {
    console.error(`Could not read the raid gear of ${userId} in ${guildId}:`, err);
    return emptyGear();
  }
}

// ---------------------------------------------------------------------------
// The whole raid
// ---------------------------------------------------------------------------

/**
 * The boss a name picks out, for `raid force`: its id (`wyrm`), its name (`soul reaper`) or any
 * word of it (`ember`, `soul`), or what the text calls it (`dragon`, `reaper`). Null if it's none of them.
 */
export function bossByName(text: string): RaidBossId | null {
  const wanted = text.trim().toLowerCase();
  for (const id of RAID_BOSS_IDS) {
    const b = TEXT.raid.bosses[id];
    const names = [id, b.name.toLowerCase(), ...b.name.toLowerCase().split(/\s+/), b.it.toLowerCase().replace(/^the /, '')];
    if (names.includes(wanted)) return id;
  }
  return null;
}

/**
 * `skip raid`'s side: once this week's raid has been fought, takes the price and claims the week's
 * extra raid, against a boss other than the one already fought. Replies and returns null when it
 * can't (not fought yet, the extra raid already used, can't pay); nothing is taken then.
 */
async function beginExtraRaid(ctx: CommandContext, week: RaidWeek): Promise<{ id: string; boss: RaidBossId } | null> {
  const { main, extra } = await raidWeekDocs(ctx.guildId, week.key);
  if (!main || !isFinished(main)) {
    await ctx.reply(TEXT.skip.raidNotYet(commandPrefix(ctx, 'raid')));
    return null;
  }
  if (extra) {
    await ctx.reply(TEXT.skip.raidUsedUp(unixOfDate(week.next)));
    return null;
  }
  const price = CONFIG.skip.raid;
  const charged = await chargeForSkip(ctx.guildId, ctx.user.id, price, 'skip_raid');
  if (!charged.ok) {
    await ctx.reply(TEXT.skip.tooPoor(fmt(price), fmt(charged.balance)));
    return null;
  }
  const fought = main.boss ?? 'wyrm';
  const others = RAID_BOSS_IDS.filter((boss) => boss !== fought);
  const boss = others.length > 0 ? pickRandom(others) : fought;
  let started;
  try {
    started = await startRaidWeek(ctx.guildId, week, boss, ctx.user.id, price);
  } catch (err) {
    await refundSkip(ctx.guildId, ctx.user.id, price, 'skip_refund');
    throw err;
  }
  if (!started.ok) {
    // Someone bought it a moment before.
    await refundSkip(ctx.guildId, ctx.user.id, price, 'skip_refund');
    await ctx.reply(TEXT.skip.raidUsedUp(unixOfDate(week.next)));
    return null;
  }
  return { id: started.id, boss };
}

/**
 * What `raid` shows once this week's raid has been fought: the latest one (the extra raid, once it
 * has been fought too), and while the extra raid is still to be had, how to buy it.
 */
async function latestResultEmbed(ctx: CommandContext, week: RaidWeek, main: RaidDoc & { status: 'won' | 'wiped' | 'fled' }): Promise<BotEmbed> {
  const { extra } = await raidWeekDocs(ctx.guildId, week.key);
  const embed = weekResultEmbed(extra && isFinished(extra) ? extra : main, week.next);
  if (!extra) embed.setFooter({ text: TEXT.skip.raidHint(commandPrefix(ctx, 'skip'), fmt(CONFIG.skip.raid)) });
  return embed;
}

/** `skip raid`: pays for the week's extra raid and starts it. */
export const runExtraRaid = (ctx: CommandContext): Promise<void> => runRaid(ctx, null, true);

/** Why the site couldn't start a raid: the server is busy (a raid or event going on), or this week's raid was already fought or started. */
export type RaidRefusal = 'busy' | 'raided' | 'started';

/**
 * A raid started from the site (startRaidFromWeb): why it didn't start goes back to the page instead
 * of into the channel, and `opened` says when the lobby is up.
 */
interface WebStart {
  refused(reason: RaidRefusal): void;
  opened(): void;
}

/**
 * Starts this week's raid, against `forced` (the admin's `raid force`) or else the boss the week
 * picked; or with `extra`, the week's extra raid bought with `skip raid` (see beginExtraRaid). `web`
 * is for one started from the site.
 */
async function runRaid(ctx: CommandContext, forced: RaidBossId | null = null, extra = false, web: WebStart | null = null): Promise<void> {
  const release = claimGuild(ctx.guildId);
  if (!release) {
    if (web) web.refused('busy');
    else await ctx.reply(TEXT.raid.busy);
    return;
  }
  const cfg: RaidSettings = { ...CONFIG.raid };
  const week = raidWeek();
  let boss: RaidBossId = forced ?? bossForWeek(ctx.guildId, week.key);
  let id: string | null = null;
  let message: Message | null = null;
  let live: LiveRaid | null = null;
  let settled = false;
  try {
    if (extra) {
      const begun = await beginExtraRaid(ctx, week);
      if (!begun) {
        settled = true;
        return;
      }
      ({ id, boss } = begun);
    } else {
      const started = await startRaidWeek(ctx.guildId, week, boss, ctx.user.id);
      if (!started.ok) {
        // Already fought this week: show how it went. (One still being set up or fought is busy above, or just "already started".)
        const existing = started.existing;
        if (web) web.refused(existing && isFinished(existing) ? 'raided' : 'started');
        else if (forced) await ctx.reply(TEXT.raid.forceTaken(ctx.prefix));
        else if (existing && isFinished(existing)) await ctx.reply({ embeds: [await latestResultEmbed(ctx, week, existing)] });
        else await ctx.reply(TEXT.raid.alreadyRaided(unixOfDate(week.next)));
        settled = true;
        return;
      }
      id = started.id;
    }

    const closesAt = Date.now() + cfg.prepareSeconds * 1000;
    const sent = await ctx.reply({ ...lobbyView(ctx.guildId, boss, ctx.user.id, [ctx.user.id], closesAt, cfg, true), files: [bossFile(boss, 'calm')] });
    message = await sent.fetchMessage();
    await updateRaid(id, { channelId: message.channelId, messageId: message.id, players: [ctx.user.id] });

    const names = new Map([[ctx.user.id, ctx.guild.members.cache.get(ctx.user.id)?.displayName ?? ctx.user.displayName]]);
    live = openLiveRaid(ctx.guildId, boss, ctx.user.id, names);
    web?.opened();
    const players = await runLobby(ctx.guildId, boss, message, ctx.user.id, cfg, id, names, live);
    if (players.length === 0) {
      await abandonRaid(id);
      settled = true;
      live.end({ end: 'no_players', state: null, rewarded: false });
      const embed = createEmbed().setTitle(TEXT.raid.bosses[boss].asleep).setDescription(TEXT.raid.noPlayers);
      await message.edit({ embeds: [embed], components: [], files: [], attachments: [] }).catch(() => {});
      return;
    }

    await updateRaid(id, { status: 'fighting' });
    const state = createRaid(boss, players, bossHpFor(players.length, boss, cfg), cfg.playerHp, cfg.maxRounds);
    // Gear counts as it is when the fight starts; changing it mid-fight does nothing until the next raid.
    // Their HP too: raidHp gear has them start (at full) with more.
    equipPlayers(state, await Promise.all(state.players.map((p) => raidGearOf(ctx.guildId, p.userId))), cfg.playerHp);
    // What each raider wore, for the site's end screen: kept on the live raid and the raid's document.
    await snapshotGear(ctx.guildId, id, players, live);
    const { tested } = await runFight(message, state, cfg, id, ctx.guildId, names, live, (moved) => {
      message = moved;
    });

    // The end. Only the outcome decides the reward; the ranking and the last hit are for show.
    const outcome = state.outcome === 'won' || state.outcome === 'wiped' ? state.outcome : 'fled';
    const damage = Object.fromEntries(state.players.map((p) => [p.userId, p.stats.damage]));
    const stats = Object.fromEntries(state.players.map((p) => [p.userId, p.stats]));
    const intoVault = await finishRaid(id, outcome, { damage, stats, lastHit: state.lastHit, rounds: state.round });
    settled = true;

    let reward: RaidReward | null = null;
    const fought = participants(state);
    if (outcome === 'won' && fought.length > 0 && !tested) {
      reward = await rewardRaid(ctx.guildId, fought, cfg.reward, cfg.tokenReward, cfg.gemReward, raidDropChance(fought.length, cfg));
    }
    live.end({ end: outcome, state, rewarded: reward !== null });
    const result = resultEmbed(state, cfg, week.next, reward, intoVault);
    if (tested) result.setFooter({ text: TEXT.raid.test.noRewards(ctx.prefix) });
    await message.edit({ embeds: [result], components: [], files: [bossFile(boss, moodOf(state))], attachments: [] });
    console.log(`Raid ${id} ended (${outcome}) after ${state.round} rounds with ${players.length} players.`);
  } finally {
    // A raid that stopped part way (an error) is called off: points are given back and the week is freed.
    if (id && !settled) {
      const called = await abandonRaid(id).catch((err) => {
        console.error(`Could not call off raid ${id}:`, err);
        return null;
      });
      if (called && message) {
        const embed = createEmbed().setTitle(TEXT.raid.interruptedTitle).setDescription(TEXT.raid.failed);
        await message.edit({ embeds: [embed], components: [], files: [], attachments: [] }).catch(() => {});
      }
      live?.end({ end: 'called_off', state: live.fight?.state ?? null, rewarded: false });
    }
    release();
  }
}

/** This week's raid in a server, for the site's raid page when no raid is going on. */
export interface RaidWeekInfo {
  boss: RaidBossId;
  /** When the week resets (ms). */
  resetsAt: number;
  /** How this week's raid stands (null: not started). */
  status: RaidDoc['status'] | null;
  /** The server has a bot channel, so the site can start the raid there. */
  channel: boolean;
  /** How this week's raid went, once it's been fought: what each raider did (in the order they joined). */
  result: {
    end: 'won' | 'wiped' | 'fled';
    rounds: number;
    lastHit: string | null;
    players: { userId: string; damage: number; healed: number; mitigated: number; healedSelf?: number; healedAllies?: number; supportDamage?: number; damageTaken?: number }[];
    reward: { points: number; tokens: number; gems: number } | null;
    /** Their gear as they fought was kept (raids from before it was don't have it). */
    gear?: boolean;
  } | null;
  /** The raiders' names, for the result (the site's socket fills them in). */
  names?: Record<string, string>;
}

/** Keeps what each raider wears as the fight starts (see RaidDoc.gear). Never holds the fight up: a failure only loses the snapshot. */
async function snapshotGear(guildId: string, id: string, players: readonly string[], live: LiveRaid | null): Promise<void> {
  try {
    const views = await Promise.all(players.map(async (userId) => [userId, wornGear(await gearStore.peek(guildId, userId))] as const));
    for (const [userId, view] of views) live?.gear.set(userId, view);
    await saveRaidGear(id, Object.fromEntries(views));
  } catch (err) {
    console.error(`Could not save the gear of raid ${id}:`, err);
  }
}

/**
 * A raider's gear as they fought this week's raid in `guildId` (the site's end screen): from the raid
 * the site is showing (the live one, while it's still up), else this week's from the database. Null
 * when it wasn't kept (a raid from before, or they weren't in it).
 */
export async function raidGearSnapshot(guildId: string, userId: string): Promise<GearView | null> {
  const live = liveRaid(guildId);
  const kept = live?.gear.get(userId);
  if (kept) return kept as GearView;
  const doc = await findRaid(raidId(guildId, raidWeek().key));
  return (doc?.gear?.[userId] as GearView | undefined) ?? null;
}

export async function raidWeekInfo(guildId: string): Promise<RaidWeekInfo> {
  const week = raidWeek();
  const [doc, channelId] = await Promise.all([findRaid(raidId(guildId, week.key)), getChannelId(guildId)]);
  const fought = doc && isFinished(doc) ? doc : null;
  // Raids saved before every stat was kept only have damage; the rest shows as nothing for them.
  const result: RaidWeekInfo['result'] = fought
    ? {
        end: fought.status,
        rounds: fought.rounds ?? 0,
        lastHit: fought.lastHit ?? null,
        players: fought.players.map((userId) => {
          const stats = fought.stats?.[userId];
          return { userId, ...statsOf(stats), damage: stats?.damage ?? fought.damage?.[userId] ?? 0 };
        }),
        reward: fought.status === 'won' ? { points: CONFIG.raid.reward, tokens: CONFIG.raid.tokenReward, gems: CONFIG.raid.gemReward } : null,
        gear: fought.gear !== undefined,
      }
    : null;
  return { boss: doc?.boss ?? bossForWeek(guildId, week.key), resetsAt: week.next.getTime(), status: doc?.status ?? null, channel: channelId !== null, result };
}

/** How starting a raid from the site went: its lobby is up in the server's channel, or why not. */
export type WebRaidStart = { ok: true } | { ok: false; reason: RaidRefusal | 'no_channel' | 'failed' };

/**
 * Starts this week's raid for `userId` from the site: its lobby goes up in the server's channel (the
 * one the bot is confined to, where events spawn), with them as the host, as if they had run `raid`
 * there. Without such a channel it can only be started in Discord. Answers once the lobby is up (the
 * raid then runs on by itself) or it's clear it won't be.
 */
export async function startRaidFromWeb(client: Client<true>, guildId: string, userId: string): Promise<WebRaidStart> {
  const guild = client.guilds.cache.get(guildId);
  const channelId = await getChannelId(guildId);
  if (!guild || !channelId) return { ok: false, reason: 'no_channel' };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  const user = await client.users.fetch(userId).catch(() => null);
  if (!channel || !channel.isSendable() || channel.isDMBased()) return { ok: false, reason: 'no_channel' };
  if (!user) return { ok: false, reason: 'failed' };

  const ctx: CommandContext = {
    source: 'message',
    prefix: getPrefix(),
    guildId,
    guild,
    user,
    args: [],
    async reply(options) {
      const { ephemeral: _ephemeral, ...rest } = typeof options === 'string' ? { content: options } : options;
      const sent = await channel.send(rest);
      return {
        fetchMessage: async () => sent,
        edit: async (edit) => {
          await sent.edit(edit);
        },
      };
    },
  };
  return new Promise((resolve) => {
    let answered = false;
    const answer = (result: WebRaidStart): void => {
      if (answered) return;
      answered = true;
      resolve(result);
    };
    runRaid(ctx, null, false, { refused: (reason) => answer({ ok: false, reason }), opened: () => answer({ ok: true }) })
      .catch((err) => console.error(`The raid started from the site in ${guildId} failed:`, err))
      // Ended without its lobby ever going up (the channel refused the message, say).
      .finally(() => answer({ ok: false, reason: 'failed' }));
  });
}

/**
 * Calls off every raid that was still going when the bot last stopped (a restart, a deploy): the
 * players get back what they spent and what was stolen, the week is freed so it can be started
 * again, and the raid's message says so. Run once the bot is ready.
 */
export async function settleUnfinishedRaids(client: Client): Promise<void> {
  for (const raid of await listUnfinishedRaids()) {
    try {
      const called = await abandonRaid(raid._id);
      if (!called?.channelId || !called.messageId) continue;
      const channel = await client.channels.fetch(called.channelId).catch(() => null);
      if (!channel?.isTextBased()) continue;
      const message = await channel.messages.fetch(called.messageId).catch(() => null);
      const embed = createEmbed().setTitle(TEXT.raid.interruptedTitle).setDescription(TEXT.raid.interrupted);
      await message?.edit({ embeds: [embed], components: [], files: [], attachments: [] }).catch(() => {});
      console.log(`Called off raid ${raid._id}, left unfinished when the bot stopped.`);
    } catch (err) {
      console.error(`Could not call off raid ${raid._id}:`, err);
    }
  }
}

export const raid: Command = {
  name: 'raid',
  category: 'adventure',
  aliases: ['boss'],
  description:
    "Start the weekly raid: everyone joins in to fight this week's boss together, turn by turn. Beat it for a reward. One raid per week (resets Saturday at midnight Eastern), and a different boss from last week's; once it's been fought, `raid` shows how it went. `raid stats` shows this week's boss, its stats and moves.",
  usage: 'raid [stats]',
  slashUsage: 'raid start  or  raid stats',

  async execute(ctx) {
    const action = ctx.args[0]?.toLowerCase();
    if (action === 'stats' && ctx.args.length === 1) {
      const week = raidWeek();
      const boss = bossForWeek(ctx.guildId, week.key);
      await ctx.reply({ embeds: [bossInfoEmbed(CONFIG.raid, boss, week.next)], files: [bossFile(boss, 'calm')] });
      return;
    }
    if (action === 'force') {
      if (!isAdmin(ctx.user.id)) {
        await ctx.reply(TEXT.raid.adminOnly);
        return;
      }
      const boss = ctx.args.length >= 2 ? bossByName(ctx.args.slice(1).join(' ')) : null;
      if (!boss) {
        await ctx.reply(TEXT.raid.forceUsage(ctx.prefix, RAID_BOSS_IDS.map((id) => TEXT.raid.bosses[id].name)));
        return;
      }
      await runRaid(ctx, boss);
      return;
    }
    if (action === 'reset') {
      if (!isAdmin(ctx.user.id)) {
        await ctx.reply(TEXT.raid.adminOnly);
        return;
      }
      const done = await resetRaidWeek(ctx.guildId, raidWeek().key);
      await ctx.reply(done ? TEXT.raid.resetDone : TEXT.raid.resetNothing);
      return;
    }
    if (action === 'test') {
      if (!isAdmin(ctx.user.id)) {
        await ctx.reply(TEXT.raid.adminOnly);
        return;
      }
      const what = ctx.args[1]?.toLowerCase() as TestAction | undefined;
      if (!what || !TEST_ACTIONS.includes(what)) {
        await ctx.reply(TEXT.raid.test.usage(ctx.prefix));
        return;
      }
      const fight = LIVE.get(ctx.guildId);
      if (!fight) {
        await ctx.reply(TEXT.raid.test.noFight);
        return;
      }
      await ctx.reply(applyRaidTest(fight, what, ctx.user.id, ctx.args[2]));
      return;
    }
    if (ctx.args.length > 0) {
      await ctx.reply(TEXT.raid.usage(ctx.prefix));
      return;
    }
    await runRaid(ctx);
  },
};
