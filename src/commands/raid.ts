import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  GuildMember,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type Interaction,
  type Message,
} from 'discord.js';
import { CONFIG, isAdmin, type Settings } from '../config.js';
import { RAID, RAID_COMBAT, RAID_EMOJI, TEXT } from '../constants/index.js';
import { dragonPicture, type DragonMood } from '../animations/images/dragon-image.js';
import { replyPrivately } from '../discord/reply.js';
import type { Command, CommandContext } from '../discord/types.js';
import { claimGuild } from '../events/busy.js';
import { limitedLines } from '../events/vault-game.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import {
  actionProblem,
  bossHpFor,
  bossTurn,
  canAct,
  CC_EFFECT,
  createRaid,
  damageRanking,
  emptyGear,
  raidGearFrom,
  type RaidGear,
  emptyStats,
  endRound,
  enrageLevel,
  findPlayer,
  isAlive,
  livingPlayers,
  participants,
  recordTheft,
  resolvePlayerTurn,
  type BossIntent,
  type RaidAction,
  type RaidChoice,
  type RaidEvent,
  type RaidState,
  type RaidStats,
} from '../lib/events/raid.js';
import { raidWeek } from '../lib/events/raid-week.js';
import { gearEffects } from '../lib/game/equipment.js';
import { getEquipment } from '../services/equipment.js';
import { fmt, formatMultiplier, formatPercent, joinLimited, mention } from '../lib/format.js';
import { sleep } from '../lib/time.js';
import type { RaidDoc } from '../types.js';
import {
  abandonRaid,
  findRaid,
  finishRaid,
  listUnfinishedRaids,
  payForBoost,
  refundBoost,
  resetRaidWeek,
  rewardRaid,
  startRaidWeek,
  stealFromWallet,
  updateRaid,
  walletOf,
  type RaidReward,
} from '../services/raid.js';

/*
 * The weekly raid boss: `raid` opens a lobby, and when it closes the party fights the dragon in
 * rounds on one live message (lib/events/raid.ts has the rules). One raid per server per week,
 * resetting every Saturday at midnight Eastern (lib/events/raid-week.ts). The server counts as busy
 * for the whole raid, so no random event starts in the middle of it.
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
  const { multiplier } = intent;
  const target = mention(intent.targets[0] ?? '');
  const { moves, support } = RAID_COMBAT;
  switch (intent.move) {
    case 'claw':
      return TEXT.raid.intent.claw(target, Math.round(moves.claw.damage * multiplier));
    case 'breath':
      return TEXT.raid.intent.breath(Math.round(moves.breath.damage * multiplier));
    case 'sweep':
      return TEXT.raid.intent.sweep(intent.targets.map(mention).join(', '), Math.round(moves.sweep.damage * multiplier));
    case 'hoard':
      return TEXT.raid.intent.hoard(target);
    case 'shield':
      return TEXT.raid.intent.shield(support.shieldBreak);
    case 'stun':
    case 'disarm':
    case 'taunt':
      return TEXT.raid.intent.cc(CC_EFFECT[intent.move], intent.targets.map(mention).join(', '), RAID_COMBAT.cc.rounds);
  }
}

/** One line of the action log. */
export function eventText(event: RaidEvent): string {
  const log = TEXT.raid.log;
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
    case 'shieldBroken':
      return log.shieldBroken;
    case 'attack':
      return log.attack(mention(event.userId), fmt(event.damage), event.crit, boost(event.boost));
    case 'bounced':
      return log.bounced(mention(event.userId));
    case 'defeated':
      return log.defeated(mention(event.userId));
    case 'enrage':
      return log.enrage(event.level);
    case 'hit':
      if (event.coveredFor) return log.clawCovered(mention(event.userId), mention(event.coveredFor), event.damage);
      return log[event.move](mention(event.userId), event.damage);
    case 'knockedOut':
      return log.knockedOut(mention(event.userId));
    case 'shieldUp':
      return log.shieldUp;
    case 'cc':
      return log.cc(event.effect, mention(event.userId));
    case 'hoardBlocked':
      return log.hoardBlocked(mention(event.userId), mention(event.targetId));
    case 'stole':
      return event.amount > 0 ? log.stole(mention(event.userId), fmt(event.amount)) : log.stoleNothing(mention(event.userId));
    case 'wiped':
      return log.wiped;
    case 'fled':
      return log.fled;
  }
}

/** Which picture of the dragon fits the fight right now. */
export function moodOf(state: RaidState): DragonMood {
  if (state.bossHp <= 0) return 'defeated';
  if (state.outcome === 'wiped') return 'gloating';
  if (state.outcome === 'fled') return 'fled';
  if (state.shielded) return 'shielded';
  return state.enrage >= 2 ? 'furious' : state.enrage === 1 ? 'enraged' : 'calm';
}

const dragonFile = (mood: DragonMood) => ({ attachment: dragonPicture(mood), name: RAID.imageName });

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
  const tags = [
    state.enrage > 0 ? r.enraged(state.enrage) : '',
    state.shielded ? r.shielded : '',
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
    const status = !isAlive(p) ? r.statusDown : !canAct(p) ? r.statusStunned : choices.has(p.userId) ? r.statusChosen : r.statusWaiting;
    const cc = isAlive(p) && p.cc ? r.ccTag(p.cc.effect, p.cc.turns) : '';
    return r.partyLine(status, mention(p.userId), playerHpBar(p.hp, p.maxHp), p.hp, p.maxHp, cc);
  });
  return createEmbed()
    .setTitle(r.fightTitle(r.bossName, state.round, state.maxRounds))
    .setDescription(description)
    .addFields(
      // Cut by length, not a line count: the custom crowd-control emojis make some lines much longer than others.
      { name: r.partyField, value: party.length === 0 ? r.nobody : joinLimited(party) },
      { name: r.logField, value: log.length === 0 ? r.logEmpty : joinLimited(log.slice(-RAID.logSize)) },
    )
    .setImage(`attachment://${RAID.imageName}`)
    .setFooter({ text: r.footer(fmt(cfg.boostCost), cfg.maxBoost) });
}

/** The screen once the fight is over: how it ended, and who did what (none of it changes the rewards). */
export function resultEmbed(state: RaidState, cfg: RaidSettings, nextRaid: Date, reward: RaidReward | null, intoVault = 0): BotEmbed {
  const r = TEXT.raid;
  const embed = createEmbed().setImage(`attachment://${RAID.imageName}`);
  const rounds = state.round;
  if (state.outcome === 'won') {
    embed.setTitle(r.wonTitle(r.bossName)).setDescription(r.won(rounds, fmt(cfg.reward), cfg.tokenReward));
  } else {
    const how = state.outcome === 'wiped' ? r.wiped(rounds) : r.fled(rounds);
    embed
      .setTitle(state.outcome === 'wiped' ? r.wipedTitle(r.bossName) : r.fledTitle(r.bossName))
      .setDescription(`${how}\n${r.bossLeft(fmt(state.bossHp), fmt(state.bossMaxHp))}\n${r.nextRaid(unixOfDate(nextRaid))}`);
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
    .map((p) => r.pointsLine(mention(p.userId), fmt(p.stats.spent), fmt(p.stats.stolen)));
  const vaultLine = intoVault > 0 ? `
${r.intoVault(fmt(intoVault))}` : '';
  embed.addFields({ name: r.pointsField, value: lost.length === 0 ? r.noPointsLost : `${joinLimited(lost, 950)}${vaultLine}` });
}

/**
 * `raid stats`: this week's fight, looked back on once the dragon has been slain. Raids saved
 * before every stat was kept only have damage; the rest shows as nothing for them.
 */
export function statsEmbed(raid: RaidDoc): BotEmbed {
  const r = TEXT.raid;
  const players = raid.players.map((userId) => ({
    userId,
    stats: raid.stats?.[userId] ?? { ...emptyStats(), damage: raid.damage?.[userId] ?? 0, spent: raid.spent[userId] ?? 0, stolen: raid.stolen[userId] ?? 0 },
  }));
  const ended = raid.endedAt ? unixOfDate(raid.endedAt) : null;
  const embed = createEmbed()
    .setTitle(r.statsTitle(r.bossName))
    .setDescription(r.statsDescription(raid.rounds ?? 0, players.length, ended));
  addStatsFields(embed, players, raid.lastHit ?? null);
  return embed;
}

/** What `raid stats` says for this week's raid: the stats once the dragon is slain, otherwise why there are none. */
export function statsReply(raid: RaidDoc | null, prefix: string, nextRaid: Date): string | BotEmbed {
  const r = TEXT.raid;
  if (!raid) return r.statsNoRaid(prefix);
  if (raid.status === 'preparing' || raid.status === 'fighting') return r.statsOngoing;
  if (raid.status !== 'won') return r.statsNotDefeated(unixOfDate(nextRaid));
  return statsEmbed(raid);
}

export interface HealOption {
  label: string;
  value: string;
  description: string;
}

/**
 * The heal picker for `userId`: "whoever needs it most" first, then every ally who needs healing,
 * knocked-out ones first and then the most hurt. Allies at full HP are left out. `names` has the
 * display names seen in the lobby (a missing one shows as the user id).
 */
export function healOptions(state: RaidState, userId: string, names: ReadonlyMap<string, string>): HealOption[] {
  const r = TEXT.raid;
  const share = (p: RaidState['players'][number]): number => p.hp / p.maxHp;
  const allies = state.players
    .filter((p) => p.hp < p.maxHp)
    .sort((a, b) => share(a) - share(b))
    .slice(0, RAID.selectMax - 1)
    .map((p) => ({
      label: r.healOption(names.get(p.userId) ?? p.userId, p.userId === userId).slice(0, 100),
      value: p.userId,
      description: isAlive(p) ? r.healOptionHurt(p.hp, p.maxHp) : r.healOptionDown,
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
 * state when an edit goes out. The dragon's picture is only uploaded again when its mood changes.
 * `toBottom` moves the fight back to the bottom of the channel when chat has pushed it up.
 */
class RaidScreen {
  private dirty = false;
  private inFlight: Promise<void> | null = null;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
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
      .edit({ ...this.view(), ...(newPicture ? { files: [dragonFile(mood)], attachments: [] } : {}) })
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
      moved = await channel.send({ ...this.view(), files: [dragonFile(mood)] });
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

function lobbyView(host: string, players: readonly string[], closesAt: number, cfg: RaidSettings, open: boolean) {
  const r = TEXT.raid;
  const lines = players.map((userId, i) => `${mention(userId)}${i === 0 ? r.hostTag : ''}`);
  const embed = createEmbed()
    .setTitle(r.lobbyTitle(r.bossName))
    .setDescription(r.lobby(mention(host), unixOf(closesAt), cfg.maxRounds, fmt(cfg.reward), cfg.tokenReward))
    .addFields(
      { name: r.howToField, value: r.howTo(cfg.turnSeconds, fmt(cfg.boostCost), RAID_COMBAT.support.shieldBreak, formatMultiplier(RAID_COMBAT.support.attackMultiplier), RAID_COMBAT.support.rallyTurns) },
      { name: r.playersField(players.length), value: limitedLines(lines, RAID.listMax, TEXT.common.moreLines, r.nobody), inline: true },
      { name: r.bossHpField, value: r.lobbyBossHp(fmt(bossHpFor(Math.max(1, players.length), cfg)), fmt(cfg.minBossHp)), inline: true },
    )
    .setImage(`attachment://${RAID.imageName}`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(RAID.joinId).setLabel(r.joinButton).setStyle(ButtonStyle.Success).setDisabled(!open),
    new ButtonBuilder().setCustomId(RAID.leaveId).setLabel(r.leaveButton).setStyle(ButtonStyle.Secondary).setDisabled(!open),
    new ButtonBuilder().setCustomId(RAID.startId).setLabel(r.startButton).setStyle(ButtonStyle.Primary).setDisabled(!open || players.length === 0),
  );
  return { embeds: [embed], components: [row] };
}

/** Runs the lobby until it closes (time up, or the host starts early). Returns who is in, in the order they joined. */
async function runLobby(message: Message, host: string, cfg: RaidSettings, raidId: string, names: Map<string, string>): Promise<string[]> {
  const players = [host];
  const closesAt = Date.now() + cfg.prepareSeconds * 1000;
  const screen = new RaidScreen(message, () => lobbyView(host, players, closesAt, cfg, true), () => 'calm', 'calm');
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: cfg.prepareSeconds * 1000 });

  collector.on('collect', (press) => {
    const userId = press.user.id;
    const at = players.indexOf(userId);
    if (press.customId === RAID.joinId) {
      if (at !== -1) return void replyPrivately(press, TEXT.raid.alreadyJoined);
      players.push(userId);
      names.set(userId, displayNameOf(press));
      screen.update();
      return void replyPrivately(press, TEXT.raid.joined);
    }
    if (press.customId === RAID.leaveId) {
      if (at === -1) return void replyPrivately(press, TEXT.raid.notJoined);
      players.splice(at, 1);
      screen.update();
      return void replyPrivately(press, TEXT.raid.left);
    }
    if (press.customId === RAID.startId) {
      if (at !== 0) return void replyPrivately(press, TEXT.raid.onlyHost);
      void press.deferUpdate().catch(() => {});
      collector.stop('start');
    }
  });

  await new Promise<void>((resolve) => collector.once('end', () => resolve()));
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

type Commit =
  | { kind: 'ok'; cost: number }
  | { kind: 'late' }
  | { kind: 'already'; action: RaidAction }
  | { kind: 'paying' }
  | { kind: 'broke'; cost: number; balance: number }
  | { kind: 'problem'; text: string };

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
  onMove: (message: Message) => void,
): Promise<{ tested: boolean }> {
  const log: string[] = [];
  const paying = new Set<string>();
  let turn: Turn = { round: state.round, open: false, endsAt: 0, choices: new Map(), allIn: () => {} };

  const view = () => ({ embeds: [fightEmbed(state, turn.choices, log, turn.open ? turn.endsAt : null, cfg)], components: [actionRow(!turn.open)] });
  const screen = new RaidScreen(first, view, () => moodOf(state), 'calm');

  const problemText = (problem: ReturnType<typeof actionProblem>, userId: string): string | null => {
    if (problem === 'not_playing') return TEXT.raid.notPlaying;
    if (problem === 'knocked_out') return TEXT.raid.knockedOut;
    if (problem === 'stunned' || problem === 'disarmed' || problem === 'taunted') return TEXT.raid.held(problem, findPlayer(state, userId)?.cc?.turns ?? 1);
    return null;
  };

  /** Locks in a player's pick for the turn, paying for its boost first. */
  const commit = async (userId: string, action: RaidAction, percent: number, forTurn: Turn, target?: string): Promise<Commit> => {
    const stillOpen = (): boolean => forTurn === turn && forTurn.open;
    if (!stillOpen()) return { kind: 'late' };
    const problem = problemText(actionProblem(state, userId, action), userId);
    if (problem) return { kind: 'problem', text: problem };
    const already = forTurn.choices.get(userId);
    if (already) return { kind: 'already', action: already.action };
    if (paying.has(userId)) return { kind: 'paying' };

    const cost = percent * cfg.boostCost;
    if (cost > 0) {
      paying.add(userId);
      try {
        const paid = await payForBoost(guildId, userId, raidId, cost);
        if (!paid.ok) return { kind: 'broke', cost, balance: paid.balance };
        if (!stillOpen() || forTurn.choices.has(userId)) {
          await refundBoost(guildId, userId, raidId, cost).catch((err) => console.error(`Could not refund a raid boost of ${userId}:`, err));
          return { kind: 'late' };
        }
      } finally {
        paying.delete(userId);
      }
    }
    forTurn.choices.set(userId, { action, boost: percent, ...(target === undefined ? {} : { target }) });
    const player = findPlayer(state, userId);
    if (player) player.stats.spent += cost;
    screen.update();
    if (state.players.filter(canAct).every((p) => forTurn.choices.has(p.userId))) forTurn.allIn();
    return { kind: 'ok', cost };
  };

  const commitText = (result: Commit, action: RaidAction, percent: number, target?: string): string => {
    const name = TEXT.raid.actions[action];
    const whom = target === undefined ? '' : mention(target);
    switch (result.kind) {
      case 'ok':
        return result.cost > 0 ? TEXT.raid.choseBoosted(name, percent, fmt(result.cost), whom) : TEXT.raid.chose(name, whom);
      case 'late':
        return TEXT.raid.turnOver;
      case 'already':
        return TEXT.raid.alreadyChose(TEXT.raid.actions[result.action]);
      case 'paying':
        return TEXT.raid.paying;
      case 'broke':
        return TEXT.raid.cantAfford(fmt(result.cost), fmt(result.balance));
      case 'problem':
        return result.text;
    }
  };

  const remainingOf = (forTurn: Turn): number => forTurn.endsAt - Date.now();

  /**
   * Heal asks privately who to heal. Returns their user id, undefined to let the bot choose, or
   * null if the turn ended first (the reply then says so).
   */
  const askHealTarget = async (press: ButtonInteraction, forTurn: Turn): Promise<string | undefined | null> => {
    const userId = press.user.id;
    const options = healOptions(state, userId, names);
    // Nobody needs healing right now: nothing to pick, and the heal is played as usual.
    if (options.length === 1) return undefined;
    const menu = new StringSelectMenuBuilder().setCustomId(RAID.healTargetId).setPlaceholder(TEXT.raid.healPlaceholder).addOptions(options);
    const prompt = await press.editReply({ content: TEXT.raid.healPrompt, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
    const pick = await prompt
      .awaitMessageComponent({ componentType: ComponentType.StringSelect, time: Math.max(1_000, remainingOf(forTurn)), filter: (m) => m.user.id === userId })
      .catch(() => null);
    if (!pick) {
      await press.editReply({ content: TEXT.raid.turnOver, components: [] }).catch(() => {});
      return null;
    }
    await pick.deferUpdate().catch(() => {});
    const value = pick.values[0];
    return value === undefined || value === RAID.healAutoValue ? undefined : value;
  };

  /**
   * Attack and Heal are picked privately: Heal first asks who to heal, then both ask how much to
   * boost them (when boosts are on) before they are locked in.
   */
  const askPrivately = async (press: ButtonInteraction, action: RaidAction, forTurn: Turn): Promise<void> => {
    await press.deferReply({ flags: MessageFlags.Ephemeral });
    let target: string | undefined;
    if (action === 'heal') {
      const picked = await askHealTarget(press, forTurn);
      if (picked === null) return;
      target = picked;
    }
    const percent = cfg.maxBoost > 0 ? await askBoost(press, action, forTurn) : 0;
    if (percent === null) return;
    const result = await commit(press.user.id, action, percent, forTurn, target);
    await press.editReply({ content: commitText(result, action, percent, target), components: [] }).catch(() => {});
  };

  /** Asks privately how much to boost the action. Returns the percent, or null if it wasn't given in time or made no sense (the reply then says so). */
  const askBoost = async (press: ButtonInteraction, action: RaidAction, forTurn: Turn): Promise<number | null> => {
    const userId = press.user.id;
    const balance = await walletOf(guildId, userId);
    const name = TEXT.raid.actions[action];
    const presets = RAID.boostPresets.filter((percent) => percent <= cfg.maxBoost);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${RAID.boostPrefix}0`).setLabel(TEXT.raid.noBoostButton).setStyle(ButtonStyle.Secondary),
      ...presets.map((percent) =>
        new ButtonBuilder()
          .setCustomId(`${RAID.boostPrefix}${percent}`)
          .setLabel(TEXT.raid.boostButton(percent, fmt(percent * cfg.boostCost)))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(percent * cfg.boostCost > balance),
      ),
      new ButtonBuilder().setCustomId(RAID.boostCustomId).setLabel(TEXT.raid.customBoostButton).setStyle(ButtonStyle.Primary),
    );
    const prompt = await press.editReply({ content: TEXT.raid.boostPrompt(name, fmt(cfg.boostCost), fmt(balance)), components: [row] });

    const remaining = (): number => remainingOf(forTurn);
    const pick = await prompt
      .awaitMessageComponent({ componentType: ComponentType.Button, time: Math.max(1_000, remaining()), filter: (b) => b.user.id === userId })
      .catch(() => null);
    if (!pick) {
      await press.editReply({ content: TEXT.raid.turnOver, components: [] }).catch(() => {});
      return null;
    }

    let percent: number;
    if (pick.customId === RAID.boostCustomId) {
      const modalId = `raid_boost_modal_${raidId}_${userId}_${forTurn.round}`;
      await pick.showModal(
        new ModalBuilder()
          .setCustomId(modalId)
          .setTitle(TEXT.raid.boostModalTitle)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(RAID.boostInputId)
                .setLabel(TEXT.raid.boostLabel(cfg.maxBoost))
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(6),
            ),
          ),
      );
      const submit = await pick
        .awaitModalSubmit({ time: Math.max(1_000, Math.min(RAID.modalMs, remaining())), filter: (m) => m.customId === modalId && m.user.id === userId })
        .catch(() => null);
      if (!submit) {
        await press.editReply({ content: TEXT.raid.turnOver, components: [] }).catch(() => {});
        return null;
      }
      const typed = submit.fields.getTextInputValue(RAID.boostInputId).trim().replace(/%$/, '');
      const parsed = /^\d+$/.test(typed) ? Number(typed) : Number.NaN;
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > cfg.maxBoost) {
        await submit.deferUpdate().catch(() => {});
        await press.editReply({ content: TEXT.raid.badBoost(cfg.maxBoost), components: [] }).catch(() => {});
        return null;
      }
      percent = parsed;
      await submit.deferUpdate().catch(() => {});
    } else {
      percent = Number(pick.customId.slice(RAID.boostPrefix.length));
      await pick.deferUpdate().catch(() => {});
    }
    return percent;
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

    if (action === 'heal' || (action === 'attack' && cfg.maxBoost > 0)) return askPrivately(press, action, forTurn);
    const result = await commit(userId, action, 0, forTurn);
    return replyPrivately(press, commitText(result, action, 0));
  };

  const live: LiveFight = { state, log, update: () => screen.update(), endTurn: () => {}, tested: false };
  LIVE.set(guildId, live);
  try {
    await first.edit({ ...view(), files: [dragonFile('calm')], attachments: [] });
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
      const collector = screen.current.createMessageComponentCollector({ componentType: ComponentType.Button, time: Math.max(1_000, endsAt - Date.now()) });
      current.allIn = () => collector.stop('all');
      // Nobody can act (everyone standing is stunned): the turn doesn't wait for picks that can't come.
      if (!state.players.some(canAct)) collector.stop('all');
      live.endTurn = () => collector.stop('test');
      collector.on('collect', (press) => {
        void handlePress(press, current).catch((err) => console.error('A raid button failed:', err));
      });
      await new Promise<void>((resolve) => collector.once('end', () => resolve()));
      current.open = false;

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
      log.push(...events.map(eventText));
      await screen.now();
      if (state.outcome !== 'ongoing') break;
      await sleep(RAID.resultMs);
    }
  } finally {
    LIVE.delete(guildId);
    await screen.stop();
  }
  return { tested: live.tested };
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
      reply = state.shielded ? t.shieldOn : t.shieldOff;
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
      fight.log.push(TEXT.raid.log.fled);
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

async function runRaid(ctx: CommandContext): Promise<void> {
  const release = claimGuild(ctx.guildId);
  if (!release) {
    await ctx.reply(TEXT.raid.busy);
    return;
  }
  const cfg: RaidSettings = { ...CONFIG.raid };
  const week = raidWeek();
  let id: string | null = null;
  let message: Message | null = null;
  let settled = false;
  try {
    const started = await startRaidWeek(ctx.guildId, week, ctx.user.id);
    if (!started.ok) {
      await ctx.reply(TEXT.raid.alreadyRaided(unixOfDate(week.next)));
      settled = true;
      return;
    }
    id = started.id;

    const closesAt = Date.now() + cfg.prepareSeconds * 1000;
    const sent = await ctx.reply({ ...lobbyView(ctx.user.id, [ctx.user.id], closesAt, cfg, true), files: [dragonFile('calm')] });
    message = await sent.fetchMessage();
    await updateRaid(id, { channelId: message.channelId, messageId: message.id, players: [ctx.user.id] });

    const names = new Map([[ctx.user.id, ctx.guild.members.cache.get(ctx.user.id)?.displayName ?? ctx.user.displayName]]);
    const players = await runLobby(message, ctx.user.id, cfg, id, names);
    if (players.length === 0) {
      await abandonRaid(id);
      settled = true;
      const embed = createEmbed().setTitle(TEXT.raid.noPlayersTitle).setDescription(TEXT.raid.noPlayers);
      await message.edit({ embeds: [embed], components: [], files: [], attachments: [] }).catch(() => {});
      return;
    }

    await updateRaid(id, { status: 'fighting' });
    const state = createRaid(players, bossHpFor(players.length, cfg), cfg.playerHp, cfg.maxRounds);
    // Gear counts as it is when the fight starts; changing it mid-fight does nothing until the next raid.
    const gear = await Promise.all(state.players.map((p) => raidGearOf(ctx.guildId, p.userId)));
    state.players.forEach((p, i) => {
      p.gear = gear[i] ?? p.gear;
    });
    const { tested } = await runFight(message, state, cfg, id, ctx.guildId, names, (moved) => {
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
    if (outcome === 'won' && fought.length > 0 && !tested) reward = await rewardRaid(ctx.guildId, fought, cfg.reward, cfg.tokenReward);
    const result = resultEmbed(state, cfg, week.next, reward, intoVault);
    if (tested) result.setFooter({ text: TEXT.raid.test.noRewards(ctx.prefix) });
    await message.edit({ embeds: [result], components: [], files: [dragonFile(moodOf(state))], attachments: [] });
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
    }
    release();
  }
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
  aliases: ['boss'],
  description:
    'Start the weekly raid: everyone joins in to fight a dragon together, turn by turn. Beat it for a reward. One raid per week (resets Saturday at midnight Eastern). `raid stats` shows who did what once the dragon is slain.',
  usage: 'raid [stats]',
  slashUsage: 'raid start  or  raid stats',

  async execute(ctx) {
    const action = ctx.args[0]?.toLowerCase();
    if (action === 'stats' && ctx.args.length === 1) {
      const week = raidWeek();
      const reply = statsReply(await findRaid(ctx.guildId, week.key), ctx.prefix, week.next);
      await ctx.reply(typeof reply === 'string' ? reply : { embeds: [reply] });
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
