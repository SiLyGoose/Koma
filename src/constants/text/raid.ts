import { RAID_EMOJI as E } from '../raid.js';
import { boldMoney, boldTokens } from './currency.js';

/*
 * The weekly raid boss. `user`, `target` and the like are mentions; `unix` values are Unix seconds.
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

/** "A", "A and B", "A, B and C". */
const andList = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export const raidText = {
  /** The boss's name (bosses with their own personalities come later). */
  bossName: 'Ember Wyrm',
  usage: (p: string) => `Use \`${p}raid\` to start this week's raid (or see how it went, once it has been fought), or \`${p}raid stats\` to see the dragon's stats and moves.`,
  busy: 'Something else is going on in this server right now. Try again when it is over.',
  /** `unix` is when the next raid week starts. */
  alreadyRaided: (unix: number) => `This week's raid has already been started. The next one can be started <t:${unix}:F> (<t:${unix}:R>).`,

  // The lobby
  lobbyTitle: (boss: string) => `🐉 A wild ${boss} appears!`,
  /** `host` found it, `unix` is when the fight starts, `rounds` how long the party has to win. */
  lobby: (host: string, unix: number, rounds: number, reward: string, tokens: number) =>
    `${host} found the dragon's lair. Press **Join** to fight. The battle starts <t:${unix}:R> (or when the host presses **Start now**). ` +
    `No one can join once it starts.\n\n` +
    `Beat it within **${rounds}** rounds and everyone who takes part gets ${boldMoney(reward)} and ${boldTokens(tokens)}.`,
  howToField: 'How to fight',
  howTo: (turnSeconds: number, boostCost: string, shieldBreak: number, rallyMultiplier: string, rallyTurns: number) =>
    [
      `Each round you have **${turnSeconds}s** to pick one action. The dragon then makes the move it announced.`,
      `${E.attack} **Attack**: damage the dragon.`,
      `${E.guard} **Guard**: take half damage, jump in front of attacks aimed at others, and soften attacks that hit everyone.`,
      `${E.heal} **Heal**: pick an ally to heal, or bring back one who was knocked out (or let the bot pick whoever needs it most).`,
      `✨ **Support**: frees an ally who is ${E.stunned} stunned, ${E.disarmed} disarmed or ${E.taunted} taunted. If nobody is, rallies the party instead: attacks do **${rallyMultiplier}** damage for the next ${plural(rallyTurns, 'turn', 'turns')}. ${shieldBreak} Supports in one turn break its shield.`,
      `💸 Attack and Heal can be boosted: ${boostCost} per 1%. Points spent on boosts, and anything the dragon steals, go into the vault.`,
    ].join('\n'),
  playersField: (count: number) => `Raiders (${count})`,
  nobody: 'Nobody yet',
  bossHpField: 'Dragon HP',
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
  noPlayersTitle: 'The dragon went back to sleep',
  noPlayers: 'Nobody joined the raid. It has not been used up: it can be started again this week.',

  // The fight
  fightTitle: (boss: string, round: number, maxRounds: number) => `🐉 ${boss} (round ${round} of ${maxRounds})`,
  bossHp: (bar: string, hp: string, max: string) => `${bar}\n**${hp}** / ${max} HP`,
  enraged: (level: number) => (level >= 2 ? '😡 **FURIOUS**' : '😠 **ENRAGED**'),
  shielded: '🔷 **Scale Shield up**: attacks bounce off unless enough raiders Support',
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

  // What the dragon is about to do
  intent: {
    claw: (target: string, damage: number) => `🦴 **Claw** at ${target} (${damage} damage)`,
    breath: (damage: number) => `🔥 **Fire Breath**, hitting everyone (${damage} damage each)`,
    sweep: (targets: string, damage: number) => `🌀 **Tail Sweep** at ${targets} (${damage} damage each)`,
    hoard: (target: string) => `💰 **Hoard**: it wants to steal from ${target}'s wallet. A guard can stop it.`,
    shield: (supports: number) => `🔷 **Scale Shield**: next turn attacks bounce off unless ${supports} raiders Support`,
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
    bouncedMany: (users: readonly string[]) => `🔷 Attacks from ${andList(users)} bounced off the Scale Shield.`,
    /** A move that hit several players for the same damage. */
    hits: (move: 'breath' | 'sweep', users: readonly string[], damage: number) =>
      move === 'breath' ? `🔥 Fire Breath burned ${andList(users)} for **${damage}** each.` : `🌀 Tail Sweep hit ${andList(users)} for **${damage}** each.`,
    /** A move that hit several players for different damage (a guard took less); each part is hitPart. */
    hitsMixed: (move: 'breath' | 'sweep', parts: readonly string[]) =>
      move === 'breath' ? `🔥 Fire Breath burned ${andList(parts)}.` : `🌀 Tail Sweep hit ${andList(parts)}.`,
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
    shieldBroken: '💥 The Scale Shield shatters!',
    attack: (user: string, damage: string, crit: boolean, boost: string) => `${E.attack} ${user} hit for **${damage}**${crit ? ` (${E.crit} **critical!**)` : ''}${boost}.`,
    bounced: (user: string) => `🔷 ${user}'s attack bounced off the Scale Shield.`,
    defeated: (user: string) => `🏆 ${user} landed the final blow!`,
    enrage: (level: number) =>
      level >= 2 ? '😡 The dragon is **furious**! From its next move on, it hits even harder.' : '😠 The dragon is **enraged**! From its next move on, it hits harder.',
    claw: (target: string, damage: number) => `🐉 Claw hit ${target} for **${damage}**.`,
    clawCovered: (guard: string, target: string, damage: number) => `🐉 ${guard} took the Claw for ${target}: **${damage}**.`,
    breath: (target: string, damage: number) => `🔥 Fire Breath burned ${target} for **${damage}**.`,
    sweep: (target: string, damage: number) => `🌀 Tail Sweep hit ${target} for **${damage}**.`,
    knockedOut: (user: string) => `💀 ${user} was knocked out!`,
    shieldUp: '🔷 The dragon raises its Scale Shield.',
    cc: (effect: CrowdControl, user: string) => `${E[effect]} ${user} is ${CC[effect].name}: ${CC[effect].does}.`,
    hoardBlocked: (guard: string, target: string) => `💰 ${guard} kept the dragon's claws off ${target}'s wallet.`,
    stole: (user: string, amount: string) => `💰 The dragon stole ${boldMoney(amount)} from ${user}!`,
    stoleNothing: (user: string) => `💰 The dragon went for ${user}'s wallet and found it empty.`,
    wiped: '☠️ The whole party has fallen.',
    fled: '🌬️ The dragon grows bored and flies off with its hoard.',
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
  wonTitle: (boss: string) => `🏆 The ${boss} has been slain!`,
  won: (rounds: number, reward: string, tokens: number) =>
    `The party won in **${plural(rounds, 'round', 'rounds')}**. Everyone who fought gets ${boldMoney(reward)} and ${boldTokens(tokens)}.`,
  wipedTitle: (boss: string) => `☠️ The ${boss} wins`,
  wiped: (rounds: number) => `Every raider was knocked out in round **${rounds}**. No rewards this week.`,
  fledTitle: (boss: string) => `🌬️ The ${boss} got away`,
  fled: (rounds: number) => `The dragon was still standing after **${plural(rounds, 'round', 'rounds')}** and flew off. No rewards this week.`,
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
  weekTitle: (boss: string, outcome: 'won' | 'wiped' | 'fled') =>
    outcome === 'won' ? `📊 This week's raid: the ${boss} was slain` : outcome === 'wiped' ? `📊 This week's raid: the ${boss} won` : `📊 This week's raid: the ${boss} got away`,
  /** `ended` is when the fight ended (null if that wasn't saved), `next` when the next raid can be started. */
  weekDescription: (outcome: 'won' | 'wiped' | 'fled', rounds: number, players: number, ended: number | null, next: number) =>
    [
      outcome === 'won'
        ? `Slain in **${plural(rounds, 'round', 'rounds')}** by ${plural(players, 'raider', 'raiders')}${ended === null ? '' : ` <t:${ended}:R>`}.`
        : outcome === 'wiped'
          ? `All ${plural(players, 'raider', 'raiders')} were knocked out in round **${rounds}**${ended === null ? '' : ` <t:${ended}:R>`}.`
          : `It was still standing after **${plural(rounds, 'round', 'rounds')}** and flew off${ended === null ? '' : ` <t:${ended}:R>`}.`,
      `The next raid can be started <t:${next}:R>.`,
    ].join('\n'),

  // `raid stats`: the boss itself
  bossTitle: (boss: string) => `🐉 ${boss}`,
  /** `examples` is a few party sizes and the HP the dragon has for them, already formatted. */
  bossInfoHp: (perRaider: string, growth: string, min: string, examples: string) =>
    `❤️ **HP**: ${perRaider} per raider, growing ${growth} more for every raider past the first, and never below ${min}.\n${examples}`,
  bossHpExample: (raiders: number, hp: string) => `${plural(raiders, 'raider', 'raiders')}: ${hp}`,
  bossRounds: (rounds: number) => `⏳ It flies off (and the raid is lost) if it is still standing after **${rounds}** rounds.`,
  phasesField: 'Phases',
  /** `below` is the share of HP the phase starts at (null for the first), `multiplier` how hard it hits. */
  phaseLine: (name: string, below: string | null, multiplier: string, cooldown: number, targets: number) =>
    `**${name}**${below === null ? '' : ` (below ${below} HP)`}: hits **${multiplier}** as hard. Crowd control once every **${plural(cooldown, 'round', 'rounds')}**, on ${plural(targets, 'raider', 'raiders')}.`,
  phaseNames: ['😌 Calm', '😠 Enraged', '😡 Furious'],
  movesField: 'Moves',
  /** Its moves at their base damage (calm); each phase multiplies the damage. */
  moves: {
    claw: (damage: number) => `🦴 **Claw**: ${damage} damage to one raider. Other raiders can guard to redirect attack to themselves.`,
    breath: (damage: number) => `🔥 **Fire Breath**: ${damage} damage to everyone. Guards reduce damage taken.`,
    sweep: (damage: number, min: number, max: number) => `🌀 **Tail Sweep**: ${damage} damage to ${min === max ? min : `${min} to ${max}`} raiders. Guards reduce damage taken.`,
    hoard: (min: string, max: string) => `💰 **Hoard**: steals ${boldMoney(min)} to ${boldMoney(max)} from one raider's wallet. A guard can stop it.`,
    shield: (supports: number) => `🔷 **Scale Shield**: attacks bounce off for a turn unless ${supports} raiders Support.`,
    cc: (effect: CrowdControl, rounds: number) =>
      `${E[effect]} **${ccMove[effect]}**: ${CC[effect].name} raiders ${CC[effect].does} for ${plural(rounds, 'turn', 'turns')}. A Support frees them.`,
  },
  /** Under the moves: crowd control shares one cooldown, which the phases set. */
  movesCcNote: 'Stun, Disarm and Taunt are crowd control: they share one cooldown, set by the phase.',
  bossFooter: 'Aimed moves go after whoever the dragon has aimed at least so far, so everyone gets hit about equally.',

  // A raid the bot didn't finish
  interruptedTitle: 'The raid was cut short',
  interrupted: 'The bot stopped in the middle of this raid. Everything spent on boosts or stolen by the dragon has been given back, and the raid can be started again this week.',
  failed: 'Something went wrong in the middle of this raid. Everything spent on boosts or stolen by the dragon has been given back, and the raid can be started again this week.',

  // Admin test tools (`raid test ...`), for seeing each phase and ending on Discord
  test: {
    usage: (p: string) =>
      [
        `**Raid test tools** (admin only, on the fight going on in this server):`,
        `\`${p}raid test calm | enraged | furious\`: jump to that phase (sets the dragon's HP just inside it)`,
        `\`${p}raid test hp 40%\` or \`${p}raid test hp 1200\`: set the dragon's HP`,
        `\`${p}raid test shield\`: raise or drop the Scale Shield for this turn`,
        `\`${p}raid test next\`: end this turn now`,
        `\`${p}raid test kill | wipe | flee\`: end the fight with that result`,
        `A fight the tools changed pays no rewards. \`${p}raid reset\` frees the week again afterwards.`,
      ].join('\n'),
    noFight: 'There is no raid fight going on in this server right now. Start one (and press Start now to skip the lobby).',
    badHp: 'Give the HP as a number or a percentage, like `1200` or `40%`.',
    hp: (hp: string, max: string) => `Dragon HP set to **${hp}** / ${max}.`,
    phase: (phase: string, hp: string) => `Dragon set to **${phase}** (${hp} HP).`,
    shieldOn: 'Scale Shield raised for this turn.',
    shieldOff: 'Scale Shield dropped.',
    next: 'Ending this turn now.',
    kill: 'Killing the dragon: the victory screen is coming up.',
    wipe: 'Knocking out the whole party: the defeat screen is coming up.',
    flee: 'The dragon flies off: the escape screen is coming up.',
    /** The line the fight's action log shows for a test change. */
    logLine: (user: string, what: string) => `🛠️ ${user} (test): ${what}`,
    noRewards: (p: string) => `Test raid: no rewards were paid. Use ${p}raid reset to run another this week.`,
  },

  // Admin
  resetDone: "This week's raid has been reset. It can be started again.",
  resetNothing: 'There is no finished raid this week to reset (one still being played cannot be reset).',
  adminOnly: 'Only the bot admin can do that.',
};
