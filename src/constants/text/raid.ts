import { boldMoney, boldTokens } from './currency.js';

/*
 * The weekly raid boss. `user`, `target` and the like are mentions; `unix` values are Unix seconds.
 */

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const raidText = {
  /** The boss's name (bosses with their own personalities come later). */
  bossName: 'Ember Wyrm',
  usage: (p: string) => `Use \`${p}raid\` to start this week's raid.`,
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
      `⚔️ **Attack**: damage the dragon.`,
      `🛡️ **Guard**: take half damage, jump in front of attacks aimed at others, and soften attacks that hit everyone.`,
      `💚 **Heal**: heal the most hurt ally, or bring back one who was knocked out.`,
      `✨ **Support**: lifts a curse. If nobody is cursed, rallies the party instead: attacks do **${rallyMultiplier}** damage for the next ${plural(rallyTurns, 'turn', 'turns')}. ${shieldBreak} Supports in one turn break its shield.`,
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
  partyLine: (status: string, user: string, hp: number, maxHp: number, cursed: number) =>
    `${status} ${user} ❤️ ${hp}/${maxHp}${cursed > 0 ? ` 🌑 cursed (${cursed})` : ''}`,
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
    curse: (target: string, rounds: number) => `🌑 **Curse** on ${target}: can't attack for ${plural(rounds, 'turn', 'turns')}`,
  },

  // The action log
  log: {
    guard: (user: string) => `🛡️ ${user} stands guard.`,
    heal: (user: string, target: string, amount: number, boost: string) => `💚 ${user} healed ${target} for **${amount}**${boost}.`,
    revive: (user: string, target: string, hp: number, boost: string) => `💚 ${user} brought ${target} back with **${hp}** HP${boost}!`,
    healWasted: (user: string) => `💚 ${user} tried to heal, but nobody was hurt.`,
    rally: (user: string, multiplier: string, turns: number) => `✨ ${user} rallies the party: attacks do ${multiplier} damage for the next ${plural(turns, 'turn', 'turns')}.`,
    cleansed: (user: string, target: string) => `✨ ${user} lifted ${target}'s curse.`,
    shieldBroken: '💥 The Scale Shield shatters!',
    attack: (user: string, damage: string, crit: boolean, boost: string) => `⚔️ ${user} hit for **${damage}**${crit ? ' (**critical!**)' : ''}${boost}.`,
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
    curse: (user: string) => `🌑 ${user} is cursed.`,
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
  cursed: (turns: number) => `You're cursed and can't attack for ${plural(turns, 'more turn', 'more turns')}. Pick something else, or get a Support to lift it.`,
  alreadyChose: (action: string) => `You already picked **${action}** this turn.`,
  paying: 'Your boost is still being paid for...',
  turnOver: 'Too late: the turn is over.',
  chose: (action: string) => `You'll **${action}** this turn.`,
  choseBoosted: (action: string, percent: number, cost: string) => `You'll **${action}** this turn, boosted **+${percent}%** (${boldMoney(cost)} spent).`,
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
  teamLine: (user: string, healed: number, guards: number, supports: number) => `${user}: 💚 ${healed} healed · 🛡️ ${guards} · ✨ ${supports}`,
  pointsField: 'Points lost',
  /** Shown under the points lost when some went into the vault. */
  intoVault: (amount: string) => `${boldMoney(amount)} went into the vault.`,
  pointsLine: (user: string, spent: string, stolen: string) => `${user}: 💸 ${spent} on boosts · 💰 ${stolen} stolen`,
  noPointsLost: 'None.',
  places: ['🥇', '🥈', '🥉'],
  payFailed: (count: number) => `${plural(count, 'reward', 'rewards')} could not be paid. Ask the admin.`,

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
