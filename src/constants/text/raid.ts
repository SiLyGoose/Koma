import { RAID_EMOJI as E, type RaidBossId } from '../raid.js';
import { boldGems, boldMoney, boldTokens } from './currency.js';

/*
 * The weekly raid boss. `user`, `target` and the like are mentions; `unix` values are Unix seconds.
 * Lines that name the boss take its RaidBossText (`b`), from `bosses`.
 */

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

type CrowdControl = 'stunned' | 'disarmed' | 'taunted';
/** What each crowd-control effect is called, and what it stops. */
const CC: Record<CrowdControl, { name: string; does: string }> = {
  stunned: { name: 'stunned', does: "can't act" },
  disarmed: { name: 'disarmed', does: "can't attack" },
  taunted: { name: 'taunted', does: 'can only attack' },
};
const ccMove: Record<CrowdControl, string> = { stunned: 'Stun', disarmed: 'Disarm', taunted: 'Taunt' };

/** What each raider gets for a win: the points, then komaTokens and komaGems (each left out at 0). */
const rewards = (reward: string, tokens: number, gems: number): string =>
  andList([boldMoney(reward), ...(tokens > 0 ? [boldTokens(tokens)] : []), ...(gems > 0 ? [boldGems(gems)] : [])]);

/** "A", "A and B", "A, B and C". */
const andList = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** What changes from one boss to another. */
export interface RaidBossText {
  name: string;
  emoji: string;
  /** How a line calls it in the middle of a sentence, and at the start of one. */
  it: string;
  It: string;
  /** The start of the lobby: where the host came across it. */
  found: (host: string) => string;
  /** Its shield, the emoji that goes with it, and what attacks do against it ("bounced off"). */
  shield: string;
  shieldEmoji: string;
  bounce: string;
  shieldUp: string;
  shieldBroken: string;
  /** The lobby's title when nobody joined. */
  asleep: string;
  /** How it gets away when the rounds run out: the emoji, the log line, the end of "It was still standing after 15 rounds and ...", and the same now ("It ... if"). */
  fledEmoji: string;
  fledLog: string;
  fledHow: string;
  fleesHow: string;
}

/** A group of players all hit by the same move, in one line. `rest` is " for **24** each" or empty. */
const HIT_MANY = {
  breath: (who: string, rest: string) => `🔥 Fire Breath burned ${who}${rest}.`,
  sweep: (who: string, rest: string) => `🌀 Tail Sweep hit ${who}${rest}.`,
  drain: (who: string, rest: string) => `👻 Soul Drain drained ${who}${rest}.`,
  scythe: (who: string, rest: string) => `🌙 Scythe Sweep cut ${who}${rest}.`,
};
type ManyMove = keyof typeof HIT_MANY;

export const raidText = {
  bosses: {
    wyrm: {
      name: 'Ember Wyrm',
      emoji: '🐉',
      it: 'the dragon',
      It: 'The dragon',
      found: (host: string) => `${host} found the dragon's lair.`,
      shield: 'Scale Shield',
      shieldEmoji: '🔷',
      bounce: 'bounced off',
      shieldUp: '🔷 The dragon raises its Scale Shield.',
      shieldBroken: '💥 The Scale Shield shatters!',
      asleep: 'The dragon went back to sleep',
      fledEmoji: '🌬️',
      fledLog: '🌬️ The dragon grows bored and flies off with its hoard.',
      fledHow: 'flew off',
      fleesHow: 'flies off',
    },
    reaper: {
      name: 'Soul Reaper',
      emoji: '💀',
      it: 'the reaper',
      It: 'The reaper',
      found: (host: string) => `${host} strayed into the reaper's graveyard.`,
      shield: 'Spectral Veil',
      shieldEmoji: '🌫️',
      bounce: 'passed right through',
      shieldUp: '🌫️ The reaper fades behind its Spectral Veil.',
      shieldBroken: '💥 The Spectral Veil is torn away!',
      asleep: 'The reaper found nobody to reap',
      fledEmoji: '🌫️',
      fledLog: '🌫️ The reaper fades back into the fog, its harvest done.',
      fledHow: 'faded back into the fog',
      fleesHow: 'fades back into the fog',
    },
  } satisfies Record<RaidBossId, RaidBossText>,

  usage: (p: string) => `Use \`${p}raid\` to start this week's raid (or see how it went, once it has been fought), or \`${p}raid stats\` to see this week's boss, its stats and its moves.`,
  busy: 'Something else is going on in this server right now. Try again when it is over.',
  /** `unix` is when the next raid week starts. */
  alreadyRaided: (unix: number) => `This week's raid has already been started. The next one can be started <t:${unix}:F> (<t:${unix}:R>).`,

  // The lobby
  lobbyTitle: (b: RaidBossText) => `${b.emoji} A wild ${b.name} appears!`,
  /** `host` found it, `unix` is when the fight starts, `rounds` how long the party has to win. */
  lobby: (b: RaidBossText, host: string, unix: number, rounds: number, reward: string, tokens: number, gems: number) =>
    `${b.found(host)} Press **Join** to fight. The battle starts <t:${unix}:R> (or when the host presses **Start now**). ` +
    `No one can join once it starts.\n\n` +
    `Beat it within **${rounds}** rounds and everyone who takes part gets ${rewards(reward, tokens, gems)}.`,
  howToField: 'How to fight',
  /** `steals` when this boss can steal points from wallets, `cc` when it has crowd control for Support to lift. */
  howTo: (b: RaidBossText, turnSeconds: number, boostCost: string, shieldBreak: number, rallyMultiplier: string, rallyTurns: number, steals: boolean, cc: boolean) =>
    [
      `Each round you have **${turnSeconds}s** to pick one action. ${b.It} then makes the move it announced.`,
      `${E.attack} **Attack**: damage ${b.it}.`,
      `${E.guard} **Guard**: take half damage, jump in front of attacks aimed at others, and soften attacks that hit everyone.`,
      `${E.heal} **Heal**: pick an ally to heal, or bring back one who was knocked out (or let the bot pick whoever needs it most).`,
      cc
        ? `✨ **Support**: frees an ally who is ${E.stunned} stunned, ${E.disarmed} disarmed or ${E.taunted} taunted. If nobody is, rallies the party instead: attacks do **${rallyMultiplier}** damage for the next ${plural(rallyTurns, 'turn', 'turns')}. ${shieldBreak} Supports in one turn break its ${b.shield}.`
        : `✨ **Support**: rallies the party: attacks do **${rallyMultiplier}** damage for the next ${plural(rallyTurns, 'turn', 'turns')}. ${shieldBreak} Supports in one turn break its ${b.shield}.`,
      steals
        ? `💸 Attack and Heal can be boosted: ${boostCost} per 1%. Points spent on boosts, and anything ${b.it} steals, go into the vault.`
        : `💸 Attack and Heal can be boosted: ${boostCost} per 1%. Points spent on boosts go into the vault.`,
    ].join('\n'),
  playersField: (count: number) => `Raiders (${count})`,
  nobody: 'Nobody yet',
  bossHpField: (b: RaidBossText) => `${b.name} HP`,
  /** The HP the boss will have with the party as it is now. */
  lobbyBossHp: (hp: string, min: string) => `**${hp}**
Grows with every raider (at least ${min}).`,
  hostTag: ' (host)',
  joinButton: 'Join',
  leaveButton: 'Leave',
  startButton: 'Start now',
  joined: "You're in! Get ready.",
  alreadyJoined: "You're already in this raid.",
  left: 'You left the raid.',
  notJoined: "You haven't joined this raid.",
  onlyHost: 'Only the host (the first raider on the list) can start early.',
  lobbyClosed: 'The fight has already started, so no one else can join.',
  noPlayers: 'Nobody joined the raid. It has not been used up: it can be started again this week.',

  // The fight
  fightTitle: (b: RaidBossText, round: number, maxRounds: number) => `${b.emoji} ${b.name} (round ${round} of ${maxRounds})`,
  bossHp: (bar: string, hp: string, max: string) => `${bar}\n**${hp}** / ${max} HP`,
  enraged: (level: number) => (level >= 2 ? '😡 **FURIOUS**' : '😠 **ENRAGED**'),
  shielded: (b: RaidBossText) => `${b.shieldEmoji} **${b.shield} up**: attacks do nothing unless enough raiders Support`,
  rallied: (multiplier: string, turns: number) => `✨ **Rallied**: attacks do ${multiplier} damage (${plural(turns, 'turn', 'turns')} left)`,
  nextMove: (text: string) => `**Next:** ${text}`,
  turnEnds: (unix: number) => `Pick your action. The turn ends <t:${unix}:R>.`,
  resolving: 'The turn is over...',
  partyField: 'Party',
  logField: 'Recent actions',
  logEmpty: 'Nothing yet.',
  footer: (boostCost: string, maxBoost: number) => `Boost: ${boostCost} points per 1%, up to +${maxBoost}%.`,
  /** `bar` is the player's HP bar, `cc` their crowd-control tag (ccTag) or empty. */
  partyLine: (status: string, user: string, bar: string, hp: number, maxHp: number, cc: string) =>
    `${status} ${user} ${bar} ❤️ ${hp}/${maxHp}${cc ? ` ${cc}` : ''}`,
  /** A player's crowd control on the party list, with the turns it has left. */
  ccTag: (effect: CrowdControl, turns: number) => `${E[effect]} ${CC[effect].name} (${turns})`,
  /** The party list's status column for a stunned player (they can't pick anything). */
  statusStunned: E.stunned,
  statusChosen: '✅',
  statusWaiting: '⏳',
  statusDown: '💀',

  attackButton: 'Attack',
  guardButton: 'Guard',
  healButton: 'Heal',
  supportButton: 'Support',

  // What the boss is about to do
  intent: {
    claw: (target: string, damage: number) => `🦴 **Claw** at ${target} (${damage} damage)`,
    breath: (damage: number) => `🔥 **Fire Breath**, hitting everyone (${damage} damage each)`,
    sweep: (targets: string, damage: number) => `🌀 **Tail Sweep** at ${targets} (${damage} damage each)`,
    hoard: (target: string) => `💰 **Hoard**: it wants to steal from ${target}'s wallet. A guard can stop it.`,
    shield: (supports: number) => `🔷 **Scale Shield**: next turn attacks bounce off unless ${supports} raiders Support`,
    /** `lifesteal` is how many times the damage dealt it heals. */
    /** `lifesteal` is how many times the damage dealt it heals, like "3.75x". */
    reap: (target: string, damage: number, lifesteal: string) => `🩸 **Reap** at ${target} (${damage} damage; it heals ${lifesteal} what it deals)`,
    drain: (damage: number, lifesteal: string) => `👻 **Soul Drain**, hitting everyone (${damage} damage each; it heals ${lifesteal} what it drains)`,
    scythe: (targets: string, damage: number) => `🌙 **Scythe Sweep** at ${targets} (${damage} damage each)`,
    /** `heal` is the HP it would heal. */
    harvest: (target: string, damage: number, heal: string) => `🕯️ **Harvest**: it reaches for ${target}'s soul (${damage} damage, and it heals ${heal}). A guard can stop it.`,
    veil: (supports: number) => `🌫️ **Spectral Veil**: next turn attacks pass right through it unless ${supports} raiders Support`,
    /** `damage` is each cast's damage to every raider, `casts` how many times Soul Drain is cast. */
    charge: (damage: number, casts: number) =>
      `🌑 **Soul Requiem** is charging: next turn it casts Soul Drain ${casts} times, hitting everyone for ${damage} damage each cast. Guard and heal up!`,
    requiem: (damage: number, casts: number, lifesteal: string) =>
      `🌑 **Soul Requiem**: Soul Drain ${casts} times on everyone (${damage} damage each cast; it heals ${lifesteal} what it drains)`,
    /** `targets` is one or more mentions. */
    cc: (effect: CrowdControl, targets: string, rounds: number) =>
      `${E[effect]} **${ccMove[effect]}** on ${targets}: ${CC[effect].does} for ${plural(rounds, 'turn', 'turns')}. A Support can free them.`,
  },

  // The action log. The plural lines are several of the same thing in one turn, on one line
  // (`users` and `parts` are lists, joined here).
  andList,
  log: {
    guards: (users: readonly string[]) => `${E.guard} ${andList(users)} stand guard.`,
    /** Several attacks that all did the same (no crits, same boost). */
    attacks: (users: readonly string[], damage: string, boost: string) => `${E.attack} ${andList(users)} hit for **${damage}** each${boost}.`,
    /** Several attacks that did different amounts; each part is attackPart. */
    attacksMixed: (parts: readonly string[]) => `${E.attack} Hits: ${parts.join(', ')}.`,
    attackPart: (user: string, damage: string, crit: boolean, boost: string) => `${user} **${damage}**${crit ? ` (${E.crit} critical!)` : ''}${boost}`,
    bouncedMany: (b: RaidBossText, users: readonly string[]) => `${b.shieldEmoji} Attacks from ${andList(users)} ${b.bounce} the ${b.shield}.`,
    /** A move that hit several players for the same damage. */
    hits: (move: ManyMove, users: readonly string[], damage: number) => HIT_MANY[move](andList(users), ` for **${damage}** each`),
    /** A move that hit several players for different damage (a guard took less); each part is hitPart. */
    hitsMixed: (move: ManyMove, parts: readonly string[]) => HIT_MANY[move](andList(parts), ''),
    hitPart: (user: string, damage: number) => `${user} for **${damage}**`,
    knockedOutMany: (users: readonly string[]) => `💀 ${andList(users)} were knocked out!`,
    ccMany: (effect: CrowdControl, users: readonly string[]) => `${E[effect]} ${andList(users)} are ${CC[effect].name}: ${CC[effect].does}.`,

    guard: (user: string) => `${E.guard} ${user} stands guard.`,
    heal: (user: string, target: string, amount: number, boost: string) => `${E.heal} ${user} healed ${target} for **${amount}**${boost}.`,
    revive: (user: string, target: string, hp: number, boost: string) => `${E.heal} ${user} brought ${target} back with **${hp}** HP${boost}!`,
    healSplash: (user: string, target: string, amount: number) => `${E.heal} ${user}'s heal spilled over onto ${target} for **${amount}**.`,
    healWasted: (user: string) => `${E.heal} ${user} tried to heal, but nobody was hurt.`,
    rally: (user: string, multiplier: string, turns: number) => `✨ ${user} rallies the party: attacks do ${multiplier} damage for the next ${plural(turns, 'turn', 'turns')}.`,
    cleansed: (user: string, target: string, effect: CrowdControl) => `✨ ${user} freed ${target}: no longer ${E[effect]} ${CC[effect].name}.`,
    attack: (user: string, damage: string, crit: boolean, boost: string) => `${E.attack} ${user} hit for **${damage}**${crit ? ` (${E.crit} **critical!**)` : ''}${boost}.`,
    bounced: (b: RaidBossText, user: string) => `${b.shieldEmoji} ${user}'s attack ${b.bounce} the ${b.shield}.`,
    defeated: (user: string) => `🏆 ${user} landed the final blow!`,
    enrage: (b: RaidBossText, level: number) =>
      level >= 2 ? `😡 ${b.It} is **furious**! From its next move on, it hits even harder.` : `😠 ${b.It} is **enraged**! From its next move on, it hits harder.`,
    claw: (target: string, damage: number) => `🐉 Claw hit ${target} for **${damage}**.`,
    breath: (target: string, damage: number) => `🔥 Fire Breath burned ${target} for **${damage}**.`,
    sweep: (target: string, damage: number) => `🌀 Tail Sweep hit ${target} for **${damage}**.`,
    reap: (target: string, damage: number) => `🩸 Reap cut ${target} for **${damage}**.`,
    drain: (target: string, damage: number) => `👻 Soul Drain drained ${target} for **${damage}**.`,
    scythe: (target: string, damage: number) => `🌙 Scythe Sweep cut ${target} for **${damage}**.`,
    harvest: (target: string, damage: number) => `🕯️ Harvest tore **${damage}** HP out of ${target}'s soul.`,
    /** A guard who jumped in front of a one-target hit. */
    covered: (move: 'claw' | 'reap', guard: string, target: string, damage: number) =>
      move === 'claw' ? `🐉 ${guard} took the Claw for ${target}: **${damage}**.` : `🩸 ${guard} took the Reap for ${target}: **${damage}**.`,
    charging: (b: RaidBossText) => `🌑 ${b.It} gathers the souls around it. **Soul Requiem** is coming next turn!`,
    requiem: (b: RaidBossText) => `🌑 ${b.It} unleashes **Soul Requiem**!`,
    /** `cut` is how much less it healed because of heal-cut gear ("25%"), or null. */
    lifesteal: (b: RaidBossText, amount: number, cut: string | null = null) =>
      `🩸 ${b.It} feeds on the stolen life and heals **${amount}** HP${cut === null ? '' : ` (${cut} less, cut by gear)`}.`,
    knockedOut: (user: string) => `💀 ${user} was knocked out!`,
    cc: (effect: CrowdControl, user: string) => `${E[effect]} ${user} is ${CC[effect].name}: ${CC[effect].does}.`,
    hoardBlocked: (guard: string, target: string) => `💰 ${guard} kept the dragon's claws off ${target}'s wallet.`,
    harvestBlocked: (guard: string, target: string) => `🕯️ ${guard} kept the reaper's hand off ${target}'s soul.`,
    stole: (user: string, amount: string) => `💰 The dragon stole ${boldMoney(amount)} from ${user}!`,
    stoleNothing: (user: string) => `💰 The dragon went for ${user}'s wallet and found it empty.`,
    wiped: '☠️ The whole party has fallen.',
    boost: (percent: number) => ` (+${percent}%)`,
  },

  // Private answers to the action buttons
  notPlaying: "You're not in this raid.",
  knockedOut: "You're knocked out. Someone has to heal you first.",
  /** Why a player under crowd control can't make the pick they pressed. */
  held: (effect: CrowdControl, turns: number) =>
    effect === 'stunned'
      ? `You're ${E.stunned} stunned and can't act for ${plural(turns, 'more turn', 'more turns')}, unless a Support frees you.`
      : effect === 'disarmed'
        ? `You're ${E.disarmed} disarmed and can't attack for ${plural(turns, 'more turn', 'more turns')}. Pick something else, or get a Support to free you.`
        : `You're ${E.taunted} taunted and can only attack for ${plural(turns, 'more turn', 'more turns')}, unless a Support frees you.`,
  alreadyChose: (action: string) => `You already picked **${action}** this turn.`,
  paying: 'Your boost is still being paid for...',
  turnOver: 'Too late: the turn is over.',
  /** `target` is who a heal is for (a mention), or empty when the bot picks. */
  chose: (action: string, target = '') => `You'll **${action}**${target ? ` ${target}` : ''} this turn.`,
  choseBoosted: (action: string, percent: number, cost: string, target = '') =>
    `You'll **${action}**${target ? ` ${target}` : ''} this turn, boosted **+${percent}%** (${boldMoney(cost)} spent).`,
  healPrompt: 'Who do you want to heal? If they no longer need it when the turn ends, the heal goes to whoever needs it most.',
  healPlaceholder: 'Pick an ally',
  healAuto: 'Whoever needs it most',
  healAutoDescription: 'Brings back a knocked-out ally first, then heals the most hurt.',
  /** One ally in the heal picker. `name` is their display name. */
  healOption: (name: string, you: boolean) => `${name}${you ? ' (you)' : ''}`,
  healOptionHurt: (hp: number, maxHp: number) => `❤️ ${hp}/${maxHp} HP`,
  healOptionDown: '💀 Knocked out: bring them back',
  boostPrompt: (action: string, cost: string, balance: string) => `Boost your **${action}**? Each 1% costs ${boldMoney(cost)}. Your wallet: ${boldMoney(balance)}.`,
  noBoostButton: 'No boost',
  boostButton: (percent: number, cost: string) => `+${percent}% (${cost})`,
  customBoostButton: 'Custom %',
  boostModalTitle: 'Boost',
  boostLabel: (max: number) => `Boost in percent (0 to ${max})`,
  badBoost: (max: number) => `That's not a boost. Enter a whole number from 0 to ${max}, then press your action again.`,
  cantAfford: (cost: string, balance: string) => `A boost that big costs ${boldMoney(cost)}, but you only have ${boldMoney(balance)}. Press your action again to pick another one.`,
  actions: { attack: 'Attack', guard: 'Guard', heal: 'Heal', support: 'Support' },

  // The end
  wonTitle: (b: RaidBossText) => `🏆 The ${b.name} has been slain!`,
  won: (rounds: number, reward: string, tokens: number, gems: number) =>
    `The party won in **${plural(rounds, 'round', 'rounds')}**. Everyone who fought gets ${rewards(reward, tokens, gems)}.`,
  wipedTitle: (b: RaidBossText) => `☠️ The ${b.name} wins`,
  wiped: (rounds: number) => `Every raider was knocked out in round **${rounds}**. No rewards this week.`,
  fledTitle: (b: RaidBossText) => `${b.fledEmoji} The ${b.name} got away`,
  fled: (b: RaidBossText, rounds: number) => `${b.It} was still standing after **${plural(rounds, 'round', 'rounds')}** and ${b.fledHow}. No rewards this week.`,
  bossLeft: (hp: string, max: string) => `It had **${hp}** / ${max} HP left.`,
  nextRaid: (unix: number) => `The next raid can be started <t:${unix}:R>.`,
  rankingField: 'Damage',
  rankingLine: (place: string, user: string, damage: string, share: string) => `${place} ${user}: **${damage}** (${share})`,
  noDamage: 'Nobody landed a hit.',
  lastHitField: 'Final blow',
  teamField: 'Team play',
  teamLine: (user: string, healed: number, guards: number, supports: number) => `${user}: ${E.heal} ${healed} healed · ${E.guard} ${guards} · ✨ ${supports}`,
  pointsField: 'Points lost',
  /** Shown under the points lost when some went into the vault. */
  intoVault: (amount: string) => `${boldMoney(amount)} went into the vault.`,
  pointsLine: (user: string, spent: string, stolen: string) => `${user}: 💸 ${spent} on boosts · 💰 ${stolen} stolen`,
  noPointsLost: 'None.',
  places: ['🥇', '🥈', '🥉'],
  payFailed: (count: number) => `${plural(count, 'reward', 'rewards')} could not be paid. Ask the admin.`,

  // `raid` once this week's raid has been fought: how it went
  weekTitle: (b: RaidBossText, outcome: 'won' | 'wiped' | 'fled') =>
    outcome === 'won' ? `📊 This week's raid: the ${b.name} was slain` : outcome === 'wiped' ? `📊 This week's raid: the ${b.name} won` : `📊 This week's raid: the ${b.name} got away`,
  /** `ended` is when the fight ended (null if that wasn't saved), `next` when the next raid can be started. */
  weekDescription: (b: RaidBossText, outcome: 'won' | 'wiped' | 'fled', rounds: number, players: number, ended: number | null, next: number) =>
    [
      outcome === 'won'
        ? `Slain in **${plural(rounds, 'round', 'rounds')}** by ${plural(players, 'raider', 'raiders')}${ended === null ? '' : ` <t:${ended}:R>`}.`
        : outcome === 'wiped'
          ? `All ${plural(players, 'raider', 'raiders')} were knocked out in round **${rounds}**${ended === null ? '' : ` <t:${ended}:R>`}.`
          : `It was still standing after **${plural(rounds, 'round', 'rounds')}** and ${b.fledHow}${ended === null ? '' : ` <t:${ended}:R>`}.`,
      `The next raid can be started <t:${next}:R>.`,
    ].join('\n'),

  // `raid stats`: this week's boss
  bossTitle: (b: RaidBossText) => `${b.emoji} ${b.name}`,
  /** Above the stats: it is this week's boss, and until when. */
  bossWeek: (unix: number) => `This week's raid boss, until <t:${unix}:F>.`,
  /** `examples` is a few party sizes and the HP the boss has for them, already formatted. */
  bossInfoHp: (perRaider: string, growth: string, min: string, examples: string) =>
    `❤️ **HP**: ${perRaider} per raider, growing ${growth} more for every raider past the first, and never below ${min}.\n${examples}`,
  bossHpExample: (raiders: number, hp: string) => `${plural(raiders, 'raider', 'raiders')}: ${hp}`,
  bossRounds: (b: RaidBossText, rounds: number) => `⏳ It ${b.fleesHow} (and the raid is lost) if it is still standing after **${rounds}** rounds.`,
  rewardsField: 'Rewards',
  /** What each raider who takes part gets when the boss is slain (nothing if it wins or gets away). */
  bossRewards: (reward: string, tokens: number, gems: number) =>
    `Upon slaying, everyone who fought gets ${rewards(reward, tokens, gems)}.`,
  phasesField: 'Phases',
  /**
   * `below` is the share of HP the phase starts at (null for the first), `multiplier` how hard it
   * hits, `cc` how often and on how many raiders it uses crowd control (null for a boss without any),
   * `heals` what its healing is multiplied by (null for a boss that doesn't heal).
   */
  phaseLine: (name: string, below: string | null, multiplier: string, cc: { cooldown: number; targets: number } | null, heals: string | null) =>
    `**${name}**${below === null ? '' : ` (below ${below} HP)`}: hits **${multiplier}** as hard.` +
    (cc === null ? '' : ` Crowd control once every **${plural(cc.cooldown, 'round', 'rounds')}**, on ${plural(cc.targets, 'raider', 'raiders')}.`) +
    (heals === null ? '' : ` Heals **${heals}** as much.`),
  phaseNames: ['😌 Calm', '😠 Enraged', '😡 Furious'],
  movesField: 'Moves',
  /** Its moves at their base damage (calm); each phase multiplies the damage. */
  moves: {
    claw: (damage: number) => `🦴 **Claw**: ${damage} damage to one raider. Other raiders can guard to redirect attack to themselves.`,
    breath: (damage: number) => `🔥 **Fire Breath**: ${damage} damage to everyone. Guards reduce damage taken.`,
    sweep: (damage: number, min: number, max: number) => `🌀 **Tail Sweep**: ${damage} damage to ${min === max ? min : `${min} to ${max}`} raiders. Guards reduce damage taken.`,
    hoard: (min: string, max: string) => `💰 **Hoard**: steals ${boldMoney(min)} to ${boldMoney(max)} from one raider's wallet. A guard can stop it.`,
    shield: (supports: number) => `🔷 **Scale Shield**: attacks bounce off for a turn unless ${supports} raiders Support.`,
    reap: (damage: number, lifesteal: number) =>
      `🩸 **Reap**: ${damage} damage to one raider, and it heals **${lifesteal}x** the damage dealt. Other raiders can guard to take it instead, and guarding cuts what it heals.`,
    drain: (damage: number, lifesteal: number) => `👻 **Soul Drain**: ${damage} damage to everyone, and it heals **${lifesteal}x** the damage dealt. Guards reduce both.`,
    scythe: (damage: number, min: number, max: number) => `🌙 **Scythe Sweep**: ${damage} damage to ${min === max ? min : `${min} to ${max}`} raiders. Guards reduce damage taken.`,
    harvest: (damage: number, share: string) => `🕯️ **Harvest**: Tears ${damage} HP out of one raider and heals **${share}** of its max HP. A guard can stop it.`,
    veil: (supports: number) => `🌫️ **Spectral Veil**: attacks pass right through it for a turn unless ${supports} raiders Support.`,
    /** Its special attack. `phase` is the phase's name. */
    requiem: (phase: string, casts: number, cooldown: number) =>
      `🌑 **Soul Requiem** (${phase} only): charges for a turn, then casts Soul Drain ${casts} times in a row. ${cooldown} round cooldown.`,
    cc: (effect: CrowdControl, rounds: number) =>
      `${E[effect]} **${ccMove[effect]}**: ${CC[effect].name} raiders ${CC[effect].does} for ${plural(rounds, 'turn', 'turns')}. A Support frees them.`,
  },
  /** Under the moves: crowd control shares one cooldown, which the phases set. */
  movesCcNote: 'Stun, Disarm and Taunt are crowd control: they share one cooldown, set by the phase.',
  bossFooter: 'Aimed moves go after whoever the boss has aimed at least so far, so everyone gets hit about equally.',

  // A raid the bot didn't finish
  interruptedTitle: 'The raid was cut short',
  interrupted: 'The bot stopped in the middle of this raid. Everything spent on boosts or stolen by the boss has been given back, and the raid can be started again this week.',
  failed: 'Something went wrong in the middle of this raid. Everything spent on boosts or stolen by the boss has been given back, and the raid can be started again this week.',

  // Admin test tools (`raid test ...`), for seeing each phase and ending on Discord
  test: {
    usage: (p: string) =>
      [
        `**Raid test tools** (admin only, on the fight going on in this server):`,
        `\`${p}raid test calm | enraged | furious\`: jump to that phase (sets the boss's HP just inside it)`,
        `\`${p}raid test hp 40%\` or \`${p}raid test hp 1200\`: set the boss's HP`,
        `\`${p}raid test shield\`: raise or drop the boss's shield for this turn`,
        `\`${p}raid test next\`: end this turn now`,
        `\`${p}raid test kill | wipe | flee\`: end the fight with that result`,
        `A fight the tools changed pays no rewards. \`${p}raid reset\` frees the week again afterwards.`,
      ].join('\n'),
    noFight: 'There is no raid fight going on in this server right now. Start one (and press Start now to skip the lobby).',
    badHp: 'Give the HP as a number or a percentage, like `1200` or `40%`.',
    hp: (hp: string, max: string) => `Boss HP set to **${hp}** / ${max}.`,
    phase: (phase: string, hp: string) => `Boss set to **${phase}** (${hp} HP).`,
    shieldOn: (b: RaidBossText) => `${b.shield} raised for this turn.`,
    shieldOff: (b: RaidBossText) => `${b.shield} dropped.`,
    next: 'Ending this turn now.',
    kill: 'Killing the boss: the victory screen is coming up.',
    wipe: 'Knocking out the whole party: the defeat screen is coming up.',
    flee: 'The boss gets away: the escape screen is coming up.',
    /** The line the fight's action log shows for a test change. */
    logLine: (user: string, what: string) => `🛠️ ${user} (test): ${what}`,
    noRewards: (p: string) => `Test raid: no rewards were paid. Use ${p}raid reset to run another this week.`,
  },

  // Admin
  resetDone: "This week's raid has been reset. It can be started again.",
  resetNothing: 'There is no finished raid this week to reset (one still being played cannot be reset).',
  adminOnly: 'Only the bot admin can do that.',
};
