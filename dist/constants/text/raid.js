import { RAID_CLASS_EMOJI, RAID_COMBAT, RAID_EMOJI as E } from '../raid.js';
import { boldGems, boldMoney, boldTokens } from './currency.js';
/*
 * The Weekly Boss (it was the raid: it is still fought with `raid`). `user`, `target` and the like are mentions; `unix` values are Unix seconds.
 * Lines that name the boss take its RaidBossText (`b`), from `bosses`.
 */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** What each crowd-control effect is called, and what it stops. */
const CC = {
    stunned: { name: 'stunned', does: "can't act" },
    disarmed: { name: 'disarmed', does: "can't attack" },
    taunted: { name: 'taunted', does: 'can only attack' },
};
const ccMove = { stunned: 'Stun', disarmed: 'Disarm', taunted: 'Taunt' };
/** The Blight a hit from the matriarch leaves, like "+2 🦠". */
const blightAdds = (move) => `+${RAID_COMBAT.moves[move].blight} 🦠`;
/** What each raider gets for a win: the points, then komaTokens, komaGems and its boss's hero essences (each left out at 0, or with none). */
const rewards = (reward, tokens, gems, essences = null) => andList([
    boldMoney(reward),
    ...(tokens > 0 ? [boldTokens(tokens)] : []),
    ...(gems > 0 ? [boldGems(gems)] : []),
    ...(essences && essences.amount > 0 ? [`**${essences.amount}** each of the ${andList(essences.names)} hero essences 💠`] : []),
]);
/** "A", "A and B", "A, B and C". */
const andList = (items) => items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
/** A group of players all hit by the same move, in one line. `rest` is " for **24** each" or empty. */
const HIT_MANY = {
    breath: (who, rest) => `🔥 Fire Breath burned ${who}${rest}.`,
    sweep: (who, rest) => `🌀 Tail Sweep hit ${who}${rest}.`,
    drain: (who, rest) => `👻 Soul Drain drained ${who}${rest}.`,
    scythe: (who, rest) => `🌙 Scythe Sweep cut ${who}${rest}.`,
    reckoning: (who, rest) => `⚰️ Grim Reckoning struck ${who}${rest}.`,
    miasma: (who, rest) => `☁️ Miasma choked ${who}${rest} (${blightAdds('miasma')} each).`,
    rot: (who, rest) => `🍄 Creeping Rot took hold of ${who}${rest} (${blightAdds('rot')} each).`,
};
const CLASS_NAMES = { knight: 'Knight', warrior: 'Warrior', priest: 'Priest', mechanic: 'Mechanic', wizard: 'Wizard', assassin: 'Assassin', archer: 'Archer' };
export const raidText = {
    /** The raid classes' names (constants/raid.ts's RAID_CLASSES), and each one's badge (its RAID_CLASS_EMOJI). */
    classes: {
        knight: { name: CLASS_NAMES.knight, emoji: RAID_CLASS_EMOJI.knight },
        warrior: { name: CLASS_NAMES.warrior, emoji: RAID_CLASS_EMOJI.warrior },
        priest: { name: CLASS_NAMES.priest, emoji: RAID_CLASS_EMOJI.priest },
        mechanic: { name: CLASS_NAMES.mechanic, emoji: RAID_CLASS_EMOJI.mechanic },
        wizard: { name: CLASS_NAMES.wizard, emoji: RAID_CLASS_EMOJI.wizard },
        assassin: { name: CLASS_NAMES.assassin, emoji: RAID_CLASS_EMOJI.assassin },
        archer: { name: CLASS_NAMES.archer, emoji: RAID_CLASS_EMOJI.archer },
    },
    /** The `class` command: seeing and picking a raid class. `classes` is every class, listed. */
    classCommand: {
        none: (p, classes) => `You have no raid class yet. Pick one with \`${p}class <name>\`: ${classes}. \`${p}databank classes\` shows what each does.`,
        yours: (p) => `Your raid class. Change it with \`${p}class <name>\`, or clear it with \`${p}class none\`.`,
        picked: (name) => `You are now a **${name}**. It counts from the next raid you fight.`,
        cleared: (p) => `You have no raid class now. Pick one again with \`${p}class <name>\`.`,
        noSuchClass: (p, query, classes) => `There is no raid class called "${query}". The classes are ${classes}. \`${p}class none\` clears yours.`,
    },
    /** A class as Discord names it: its badge, then its name. */
    classLabel: (id) => `${RAID_CLASS_EMOJI[id]} ${CLASS_NAMES[id]}`,
    /**
     * What a class's rules do (constants/raid.ts's RaidClassRules), a line each, for the databanks: only the
     * ones that aren't a raider without a class's are said (lib/game/raid-classes.ts). `times` is a
     * multiplier, like "0.75x"; a share is like "10%".
     */
    classTraits: {
        attack: (times) => `${E.attack} **Attack**: their attacks do **${times}** damage.`,
        /** `step` is what every turn in a row adds, `max` the most it adds up to. */
        ramp: (step, max) => `${E.attack} **Ramp**: their attacks do **${step}** more for every turn in a row they have attacked, up to **${max}** more. A turn they don't attack, or a hit from the boss, starts it over.`,
        hex: (share) => `🔮 **Hex**: their attacks that land hex the boss, and the move it announced that turn hits **${share}** weaker. Hexes don't stack: the strongest counts.`,
        crit: (share) => `${E.crit} **Keen eye**: **+${share}** crit chance.`,
        hp: (times) => `❤️ **HP**: they fight with **${times}** HP.`,
        /** `share` is how much of one of their attacks, like "50%". */
        retaliate: (share) => `${E.attack} **Retaliate**: every turn the boss hits them and leaves them standing, they strike back once for **${share}** of an attack (no crit or rally; a shield stops it).`,
        healed: (times) => `${E.heal} **Hard to mend**: heals on them do **${times}** (a revive brings them back as it does anyone).`,
        taken: (times) => `💢 **Damage taken**: the boss's hits on them do **${times}** damage.`,
        /** `max` is the most the cut can be, with gear. */
        partyCut: (cut, max) => `${E.guard} **Party guard**: while they guard, everyone else takes **${cut}** less from moves that hit several raiders (more with gear, up to ${max}). Guards don't stack: the strongest counts.`,
        covers: () => `${E.guard} **Cover**: while they guard, they take a hit aimed at one other raider in their place, and stop a steal aimed at one.`,
        heal: (times) => `${E.heal} **Heal**: their heals and revives do **${times}**.`,
        healCrit: () => `${E.heal} **Critical heals**: their heals and revives can crit, with their own crit chance and crit damage.`,
        /** `more` is how many turns longer, `turns` how long that makes it. */
        rallyTurns: (more, turns) => `✨ **Long rally**: their rally lasts ${plural(more, 'turn', 'turns')} longer (${turns} in all).`,
        interrupts: (count) => `✨ **Interrupt**: their Support counts as ${count} towards interrupting a channel.`,
        ward: () => `🛡️ **Ward**: in place of a Support's usual work they can ward an ally, and the first hit the boss lands on that ally that turn does nothing.`,
        massDispel: () => `✨ **Mass dispel**: their Support frees every ally under crowd control, not just one.`,
    },
    bosses: {
        wyrm: {
            name: 'Wyvern',
            emoji: '🐉',
            it: 'the dragon',
            It: 'The dragon',
            found: (host) => `${host} found the dragon's lair.`,
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
            found: (host) => `${host} strayed into the reaper's graveyard.`,
            shield: 'Spectral Veil',
            shieldEmoji: '🌫️',
            bounce: 'passed right through',
            shieldUp: '🌫️ The reaper fades behind its Spectral Veil.',
            shieldBroken: "💥 The raiders break the reaper's focus: the Spectral Veil never forms!",
            asleep: 'The reaper found nobody to reap',
            fledEmoji: '🌫️',
            fledLog: '🌫️ The reaper fades back into the fog, its harvest done.',
            fledHow: 'faded back into the fog',
            fleesHow: 'fades back into the fog',
        },
        plague: {
            name: 'Plague Matriarch',
            emoji: '🦠',
            it: 'the matriarch',
            It: 'The matriarch',
            found: (host) => `${host} followed the stench down into the matriarch's sewer.`,
            shield: 'Fly Swarm',
            shieldEmoji: '🪰',
            bounce: 'got lost in',
            shieldUp: '🪰 A Fly Swarm thickens round the matriarch.',
            shieldBroken: '💥 The raiders scatter the flies before they can swarm!',
            asleep: 'The matriarch found nobody to infect',
            fledEmoji: '🦠',
            fledLog: '🦠 The matriarch sinks back into the sewer, leaving her sickness behind.',
            fledHow: 'sank back into the sewer',
            fleesHow: 'sinks back into the sewer',
        },
    },
    usage: (p) => `Use \`${p}raid\` to start a Weekly Boss fight against this week's boss, or \`${p}raid stats\` to see the boss, its stats and its moves.`,
    busy: 'Something else is going on in this server right now. Try again when it is over.',
    // The lobby
    lobbyTitle: (b) => `${b.emoji} A wild ${b.name} appears!`,
    /** `host` found it, `rounds` is how long the party has to win. */
    lobby: (b, host, rounds, reward, tokens, gems, essences = null) => `${b.found(host)} Press **Join** to fight. The battle starts when the host presses **Start raid** (the host can also **Disband** it). ` +
        `No one can join once it starts.\n\n` +
        `Beat it within **${rounds}** rounds and everyone who takes part gets ${rewards(reward, tokens, gems, essences)} for their first win of the week.`,
    howToField: 'How to fight',
    /**
     * `steals` when this boss can steal points from wallets, `cc` when it has crowd control for Support to
     * lift, `blight` when it leaves Blight (the stacks a raider carries before a Support clears some, and how many it clears).
     * `shieldBreak` is how many Supports interrupt its shield while it channels it; `deflects` is how many
     * attacks its shield takes instead, for a boss that doesn't channel it (0 for one that does).
     */
    howTo: (b, turnSeconds, shieldBreak, rallyMultiplier, rallyTurns, steals, cc, blight = null, deflects = 0) => {
        // A shield it channels is interrupted by Supports; one it doesn't just has to be hit enough.
        const interrupt = deflects > 0 ? '' : ` ${shieldBreak} Supports in the turn it channels its ${b.shield} interrupt it, and it is staggered for the turn after.`;
        return [
            `Each round you have **${turnSeconds}s** to pick one action. ${b.It} then makes the move it announced.`,
            deflects > 0
                ? `${E.attack} **Attack**: damage ${b.it}. Its ${b.shield} goes up without warning and deflects the next ${plural(deflects, 'attack', 'attacks')}.`
                : `${E.attack} **Attack**: damage ${b.it}.`,
            `${E.guard} **Guard**: take half damage.`,
            blight
                ? `${E.heal} **Heal**: pick an ally to heal, or bring back one who was knocked out (or let the bot pick whoever needs it most). Heals don't clear 🦠 Blight.`
                : `${E.heal} **Heal**: pick an ally to heal, or bring back one who was knocked out (or let the bot pick whoever needs it most).`,
            cc
                ? `✨ **Support**: frees an ally who is ${E.stunned} stunned, ${E.disarmed} disarmed or ${E.taunted} taunted. If nobody is, rallies the party instead: attacks do **${rallyMultiplier}** damage for the next ${plural(rallyTurns, 'turn', 'turns')}.${interrupt}`
                : blight
                    ? `✨ **Support**: once an ally carries ${blight.supportAt} or more 🦠 Blight stacks, one Support a turn clears ${plural(blight.clears, 'stack', 'stacks')} off the most infected (more with the right gear). Any other Support rallies the party: attacks do **${rallyMultiplier}** damage for the next ${plural(rallyTurns, 'turn', 'turns')}.${interrupt}`
                    : `✨ **Support**: rallies the party: attacks do **${rallyMultiplier}** damage for the next ${plural(rallyTurns, 'turn', 'turns')}.${interrupt}`,
            ...(steals ? [`💰 Anything ${b.it} steals goes into the vault.`] : []),
        ].join('\n');
    },
    playersField: (count) => `Raiders (${count})`,
    nobody: 'Nobody yet',
    bossHpField: (b) => `${b.name} HP`,
    /** The HP the boss will have with the party as it is now. */
    lobbyBossHp: (hp, min) => `**${hp}**
Grows with every raider (at least ${min}).`,
    // The lobby's difficulty (constants/raid.ts's RAID_DIFFICULTY): the host picks it, up to the hardest the server has unlocked
    difficultyField: 'Difficulty',
    /**
     * `hp` and `damage` are what it multiplies the boss's by (like "1.5x"), `loot` what a win can drop (lootKinds).
     * `extra` is the HP the boss has on top for every raider at this level (null at level 1).
     */
    lobbyDifficulty: (level, unlocked, max, hp, damage, loot, extra = null) => [
        `**${level}** / ${max}${level > 1 ? ` · ❤️ ${hp} HP${extra === null ? '' : ` +${extra} a raider`} · 💥 ${damage} damage` : ''}`,
        `🎁 Can drop ${loot} each.`,
        unlocked < max ? `Beat level ${unlocked} to unlock level ${unlocked + 1}.` : '',
    ]
        .filter(Boolean)
        .join('\n'),
    difficultyPlaceholder: (level) => `Difficulty ${level} (the host can change it)`,
    difficultyOption: (level) => `Difficulty ${level}`,
    difficultyOptionDescription: (hp, damage, loot, extra = null) => `${hp} HP${extra === null ? '' : ` +${extra}/raider`} · ${damage} damage · drops ${loot}`.slice(0, 100),
    onlyHostDifficulty: 'Only the host (the first raider on the list) can change the difficulty.',
    difficultyLocked: (unlocked) => `This server has only unlocked difficulty ${unlocked} so far. Beat it to unlock the next.`,
    /** On the fight screen, past level 1. */
    difficultyTag: (level) => `⚔️ **Difficulty ${level}**`,
    /** What a win drops for each raider, like "a 3★ raid item" or "1× 4★ and 4× 3★ raid items". */
    lootKinds: (parts) => {
        const total = parts.reduce((sum, part) => sum + part.count, 0);
        if (total === 1)
            return `a T${parts.find((part) => part.count > 0)?.stars ?? 3} raid item`;
        return `${andList(parts.filter((part) => part.count > 0).map((part) => `${part.count}× T${part.stars}`))} raid items`;
    },
    hostTag: ' (host)',
    joinButton: 'Join',
    leaveButton: 'Leave',
    startButton: 'Start raid',
    disbandButton: 'Disband',
    webButton: 'Play on the web',
    joined: "You're in! Get ready.",
    alreadyJoined: "You're already in this raid.",
    left: 'You left the raid.',
    notJoined: "You haven't joined this raid.",
    onlyHost: 'Only the host (the first raider on the list) can start the raid.',
    onlyHostDisband: 'Only the host (the first raider on the list) can disband the raid.',
    lobbyClosed: 'The fight has already started, so no one else can join.',
    /** The lobby closed without a fight: everyone left it, its host disbanded it, or it sat idle too long. */
    noPlayers: 'Everyone left the raid, so its lobby closed. Start another whenever you like.',
    disbandedTitle: 'The raid was disbanded',
    disbanded: (user) => `${user} disbanded the raid before the fight. Start another whenever you like.`,
    lobbyIdle: (minutes) => `Nothing happened in the raid's lobby for ${minutes} minutes, so it was disbanded. Start another whenever you like.`,
    // The fight
    fightTitle: (b, round, maxRounds) => `${b.emoji} ${b.name} (round ${round} of ${maxRounds})`,
    bossHp: (bar, hp, max) => `${bar}\n**${hp}** / ${max} HP`,
    enraged: (level) => (level >= 2 ? '😡 **FURIOUS**' : '😠 **ENRAGED**'),
    /** `deflects` is how many more attacks the shield takes before it shatters (0 for a channeled one, up for the turn). */
    shielded: (b, deflects = 0) => deflects > 0
        ? `${b.shieldEmoji} **${b.shield} up**: the next ${plural(deflects, 'attack', 'attacks')} do nothing, then it shatters`
        : `${b.shieldEmoji} **${b.shield} up**: attacks do nothing this turn`,
    rallied: (multiplier, turns) => `✨ **Rallied**: attacks do ${multiplier} damage (${plural(turns, 'turn', 'turns')} left)`,
    nextMove: (text) => `**Next:** ${text}`,
    turnEnds: (unix) => `Pick your action. The turn ends <t:${unix}:R>.`,
    resolving: 'The turn is over...',
    partyField: 'Party',
    logField: 'Recent actions',
    logEmpty: 'Nothing yet.',
    /** `bar` is the player's HP bar, `cc` their crowd-control tag (ccTag) or empty. */
    /** `cls` is their class's badge (its emoji), or null with none. */
    partyLine: (status, user, bar, hp, maxHp, cc, cls = null) => `${status} ${cls === null ? '' : `${cls} `}${user} ${bar} ❤️ ${hp}/${maxHp}${cc ? ` ${cc}` : ''}`,
    /** A player's crowd control on the party list, with the turns it has left. */
    ccTag: (effect, turns) => `${E[effect]} ${CC[effect].name} (${turns})`,
    /** A player's Blight stacks on the party list. */
    blightTag: (stacks) => `🦠 ${stacks}`,
    /** The party list's status column for a stunned player (they can't pick anything). */
    statusStunned: E.stunned,
    /** The party list's status column once a player has picked: the icon of what they picked. */
    statusChosen: { attack: E.attack, guard: E.guard, heal: E.heal, support: '✨' },
    statusWaiting: '⏳',
    statusDown: '💀',
    attackButton: 'Attack',
    guardButton: 'Guard',
    healButton: 'Heal',
    supportButton: 'Support',
    // What the boss is about to do
    intent: {
        claw: (target, damage) => `🦴 **Claw** at ${target} (${damage} damage)`,
        breath: (damage) => `🔥 **Fire Breath**, hitting everyone (${damage} damage each)`,
        sweep: (targets, damage) => `🌀 **Tail Sweep** at ${targets} (${damage} damage each)`,
        hoard: (target) => `💰 **Hoard**: it wants to steal from ${target}'s wallet. Their guard stops it, or a knight's.`,
        /** `deflects` is how many attacks it takes before it shatters. */
        shield: (deflects) => `🔷 **Scale Shield**: it raised its shield instead of making a move this turn. It deflects ${plural(deflects, 'attack', 'attacks')}, then shatters. Support can't break it`,
        /** `lifesteal` is how many times the damage dealt it heals. */
        /** `lifesteal` is how many times the damage dealt it heals, like "3.75x". */
        reap: (target, damage, lifesteal) => `🩸 **Reap** at ${target} (${damage} damage; it heals ${lifesteal} what it deals)`,
        drain: (damage, lifesteal) => `👻 **Soul Drain**, hitting everyone (${damage} damage each; it heals ${lifesteal} what it drains)`,
        scythe: (targets, damage) => `🌙 **Scythe Sweep** at ${targets} (${damage} damage each)`,
        /** `heal` is the HP it would heal. */
        harvest: (target, damage, heal) => `🕯️ **Harvest**: it reaches for ${target}'s soul (${damage} damage, and it heals ${heal}). Their guard stops it, or a knight's.`,
        /** `supports` is how many Supports interrupt it, `stagger` what attacks do to it the turn after they do, like "1.5x". */
        veil: (supports, stagger) => `🌫️ **Spectral Veil**: it is channeling its veil. ${supports} raiders must Support **this turn** to interrupt it (it then loses its next turn and takes ${stagger} damage), or attacks pass right through it all next turn`,
        /** `multiplier` is how much harder its next attack hits, like "1.5x". */
        empower: (multiplier) => `💢 **Dark Empowerment**: it spends this turn powering up, and its next attack does ${multiplier} damage`,
        /** `turns` is how many turns of gathering are left, this one included. */
        gather: (turns, damage, min, max) => `⚰️ **Grim Reckoning** is gathering: ${plural(turns, 'more turn', 'more turns')}, then it strikes ${min === max ? min : `${min} to ${max}`} raiders for ${damage} damage each. Guard and heal up!`,
        reckoning: (targets, damage) => `⚰️ **Grim Reckoning** at ${targets} (${damage} damage each)`,
        /** Put in front of an attack the boss empowered the turn before. */
        empowered: (text) => `💢 Empowered! ${text}`,
        /** `damage` is each cast's damage to every raider, `casts` how many times Soul Drain is cast. */
        charge: (damage, casts) => `🌑 **Soul Requiem** is charging: next turn it casts Soul Drain ${casts} times, hitting everyone for ${damage} damage each cast. Support can't interrupt it: guard and heal up!`,
        requiem: (damage, casts, lifesteal) => `🌑 **Soul Requiem**: Soul Drain ${casts} times on everyone (${damage} damage each cast; it heals ${lifesteal} what it drains)`,
        spit: (target, damage) => `🤢 **Plague Spit** at ${target} (${damage} damage, ${blightAdds('spit')} Blight)`,
        miasma: (damage) => `☁️ **Miasma**, hitting everyone (${damage} damage and ${blightAdds('miasma')} Blight each)`,
        rot: (targets, damage) => `🍄 **Creeping Rot** at ${targets} (${damage} damage and ${blightAdds('rot')} Blight each)`,
        flies: (supports, stagger) => `🪰 **Fly Swarm**: she is calling her flies. ${supports} raiders must Support **this turn** to interrupt her (she then loses her next turn and takes ${stagger} damage), or attacks get lost in the swarm all next turn`,
        /** The turn after its channel was interrupted. `multiplier` is what attacks do to it, like "1.5x". */
        stagger: (b, multiplier) => `😵 **Staggered**: ${b.it} is reeling from the broken channel. No move this turn, and every attack does **${multiplier}** damage. Strike now!`,
        brew: () => `⚗️ **Pestilence** is brewing: next turn every raider's 🦠 Blight doubles. Cleanse it now!`,
        pestilence: () => `☣️ **Pestilence**: every raider's 🦠 Blight doubles`,
        /** `targets` is one or more mentions. */
        cc: (effect, targets, rounds) => `${E[effect]} **${ccMove[effect]}** on ${targets}: ${CC[effect].does} for ${plural(rounds, 'turn', 'turns')}. A Support can free them.`,
    },
    // The action log. The plural lines are several of the same thing in one turn, on one line
    // (`users` and `parts` are lists, joined here).
    andList,
    log: {
        guards: (users) => `${E.guard} ${andList(users)} stand guard.`,
        /** Several attacks that all did the same (no crits, same boost). */
        attacks: (users, damage, boost) => `${E.attack} ${andList(users)} hit for **${damage}** each${boost}.`,
        /** Several attacks that did different amounts; each part is attackPart. */
        attacksMixed: (parts) => `${E.attack} Hits: ${parts.join(', ')}.`,
        attackPart: (user, damage, crit, boost) => `${user} **${damage}**${crit ? ` (${E.crit} critical!)` : ''}${boost}`,
        bouncedMany: (b, users) => `${b.shieldEmoji} Attacks from ${andList(users)} ${b.bounce} the ${b.shield}.`,
        /** A move that hit several players for the same damage. */
        hits: (move, users, damage) => HIT_MANY[move](andList(users), ` for **${damage}** each`),
        /** A move that hit several players for different damage (a guard took less); each part is hitPart. */
        hitsMixed: (move, parts) => HIT_MANY[move](andList(parts), ''),
        hitPart: (user, damage) => `${user} for **${damage}**`,
        knockedOutMany: (users) => `💀 ${andList(users)} were knocked out!`,
        ccMany: (effect, users) => `${E[effect]} ${andList(users)} are ${CC[effect].name}: ${CC[effect].does}.`,
        guard: (user) => `${E.guard} ${user} stands guard.`,
        heal: (user, target, amount, boost) => `${E.heal} ${user} healed ${target} for **${amount}**${boost}.`,
        revive: (user, target, hp, boost) => `${E.heal} ${user} brought ${target} back with **${hp}** HP${boost}!`,
        healSplash: (user, target, amount) => `${E.heal} ${user}'s heal spilled over onto ${target} for **${amount}**.`,
        purged: (user, target, stacks) => `✨ ${user} cleared ${plural(stacks, 'stack', 'stacks')} of 🦠 Blight off ${target}.`,
        healWasted: (user) => `${E.heal} ${user} tried to heal, but nobody was hurt.`,
        /** A priest's item: what their heal couldn't mend hit the boss instead. */
        overheal: (user, b, damage) => `${E.heal} ${user}'s healing overflows and sears ${b.it} for **${damage}**.`,
        rally: (user, multiplier, turns) => `✨ ${user} rallies the party: attacks do ${multiplier} damage for the next ${plural(turns, 'turn', 'turns')}.`,
        cleansed: (user, target, effect) => `✨ ${user} freed ${target}: no longer ${E[effect]} ${CC[effect].name}.`,
        attack: (user, damage, crit, boost) => `${E.attack} ${user} hit for **${damage}**${crit ? ` (${E.crit} **critical!**)` : ''}${boost}.`,
        bounced: (b, user) => `${b.shieldEmoji} ${user}'s attack ${b.bounce} the ${b.shield}.`,
        defeated: (user) => `🏆 ${user} landed the final blow!`,
        enrage: (b, level) => level >= 2 ? `😡 ${b.It} is **furious**! From its next move on, it hits even harder.` : `😠 ${b.It} is **enraged**! From its next move on, it hits harder.`,
        claw: (target, damage) => `🐉 Claw hit ${target} for **${damage}**.`,
        breath: (target, damage) => `🔥 Fire Breath burned ${target} for **${damage}**.`,
        sweep: (target, damage) => `🌀 Tail Sweep hit ${target} for **${damage}**.`,
        reap: (target, damage) => `🩸 Reap cut ${target} for **${damage}**.`,
        drain: (target, damage) => `👻 Soul Drain drained ${target} for **${damage}**.`,
        scythe: (target, damage) => `🌙 Scythe Sweep cut ${target} for **${damage}**.`,
        harvest: (target, damage) => `🕯️ Harvest tore **${damage}** HP out of ${target}'s soul.`,
        spit: (target, damage) => `🤢 Plague Spit hit ${target} for **${damage}** (${blightAdds('spit')}).`,
        miasma: (target, damage) => `☁️ Miasma choked ${target} for **${damage}** (${blightAdds('miasma')}).`,
        rot: (target, damage) => `🍄 Creeping Rot took hold of ${target} for **${damage}** (${blightAdds('rot')}).`,
        /** A guard (a knight) who jumped in front of a one-target hit. */
        covered: (move, guard, target, damage) => move === 'claw'
            ? `🐉 ${guard} took the Claw for ${target}: **${damage}**.`
            : move === 'reap'
                ? `🩸 ${guard} took the Reap for ${target}: **${damage}**.`
                : `🤢 ${guard} took the Plague Spit for ${target}: **${damage}** (${blightAdds('spit')}).`,
        staggered: (b) => `😵 ${b.It} is still reeling and makes no move.`,
        ward: (user, target) => `🛡️ ${user} wards ${target}: the next hit on them this turn does nothing.`,
        warded: (user) => `🛡️ The ward takes the hit for ${user}!`,
        retaliate: (user, damage) => `${E.attack} ${user} strikes back for **${damage}**!`,
        /** `share` is how much weaker its move hits, like "20%". */
        hexed: (user, b, share) => `🔮 ${user} hexes ${b.it}: its move this turn hits **${share}** weaker.`,
        brewing: (b) => `⚗️ ${b.It} stirs a bubbling brew. **Pestilence** is coming next turn!`,
        pestilence: (b) => `☣️ ${b.It} unleashes **Pestilence**! Every raider's 🦠 Blight doubles.`,
        /** Each part is festerPart. */
        festered: (parts) => `🦠 Blight festers: ${andList(parts)}.`,
        festerPart: (user, damage) => `${user} **${damage}**`,
        charging: (b) => `🌑 ${b.It} gathers the souls around it. **Soul Requiem** is coming next turn!`,
        requiem: (b) => `🌑 ${b.It} unleashes **Soul Requiem**!`,
        empowered: (b) => `💢 ${b.It} powers up. Its next attack will hit harder!`,
        /** `left` is how many more turns it gathers (0: it strikes next turn). */
        gathering: (b, left) => left > 0
            ? `⚰️ ${b.It} gathers its strength for **Grim Reckoning** (${plural(left, 'more turn', 'more turns')}).`
            : `⚰️ ${b.It} has gathered its strength. **Grim Reckoning** strikes next turn!`,
        reckoning: (target, damage) => `⚰️ Grim Reckoning struck ${target} for **${damage}**.`,
        /** `cut` is how much less it healed because of heal-cut gear ("25%"), or null. */
        lifesteal: (b, amount, cut = null) => `🩸 ${b.It} feeds on the stolen life and heals **${amount}** HP${cut === null ? '' : ` (${cut} less, cut by gear)`}.`,
        knockedOut: (user) => `💀 ${user} was knocked out!`,
        cc: (effect, user) => `${E[effect]} ${user} is ${CC[effect].name}: ${CC[effect].does}.`,
        hoardBlocked: (guard, target) => `💰 ${guard} kept the dragon's claws off ${target}'s wallet.`,
        harvestBlocked: (guard, target) => `🕯️ ${guard} kept the reaper's hand off ${target}'s soul.`,
        stole: (user, amount) => `💰 The dragon stole ${boldMoney(amount)} from ${user}!`,
        stoleNothing: (user) => `💰 The dragon went for ${user}'s wallet and found it empty.`,
        wiped: '☠️ The whole party has fallen.',
        boost: (percent) => ` (+${percent}%)`,
    },
    // Private answers to the action buttons
    notPlaying: "You're not in this raid.",
    knockedOut: "You're knocked out. Someone has to heal you first.",
    /** Why a player under crowd control can't make the pick they pressed. */
    held: (effect, turns) => effect === 'stunned'
        ? `You're ${E.stunned} stunned and can't act for ${plural(turns, 'more turn', 'more turns')}, unless a Support frees you.`
        : effect === 'disarmed'
            ? `You're ${E.disarmed} disarmed and can't attack for ${plural(turns, 'more turn', 'more turns')}. Pick something else, or get a Support to free you.`
            : `You're ${E.taunted} taunted and can only attack for ${plural(turns, 'more turn', 'more turns')}, unless a Support frees you.`,
    alreadyChose: (action) => `You already picked **${action}** this turn.`,
    turnOver: 'Too late: the turn is over.',
    /** `target` is who a heal is for (a mention), or empty when the bot picks. */
    chose: (action, target = '') => `You'll **${action}**${target ? ` ${target}` : ''} this turn.`,
    // Support, for a class that can ward: the usual Support, or a ward on an ally.
    supportSkillPrompt: 'Support as usual, or ward an ally? A ward makes the first hit the boss lands on them this turn do nothing, in place of everything else a Support does.',
    supportSkillPlaceholder: 'Pick what your Support does',
    supportAsUsual: 'Support as usual',
    supportAsUsualDescription: 'Frees, cleanses or rallies, and counts towards interrupting a channel.',
    wardAuto: 'Ward whoever the boss is aiming at',
    wardAutoDescription: 'Or the most hurt ally, when it is aiming at nobody.',
    wardOption: (name, you) => `Ward ${name}${you ? ' (you)' : ''}`,
    choseWard: (target = '') => `You'll **ward** ${target || 'whoever the boss is aiming at'} this turn.`,
    healPrompt: 'Who do you want to heal? If they no longer need it when the turn ends, the heal goes to whoever needs it most.',
    healPlaceholder: 'Pick an ally',
    healAuto: 'Whoever needs it most',
    healAutoDescription: 'Brings back a knocked-out ally first, then heals the most hurt.',
    /** One ally in the heal picker. `name` is their display name. */
    healOption: (name, you) => `${name}${you ? ' (you)' : ''}`,
    /** `blight` is their Blight stacks (0 for none). */
    healOptionHurt: (hp, maxHp, blight = 0) => `❤️ ${hp}/${maxHp} HP${blight > 0 ? ` · 🦠 ${blight} Blight` : ''}`,
    healOptionDown: '💀 Knocked out: bring them back',
    actions: { attack: 'Attack', guard: 'Guard', heal: 'Heal', support: 'Support' },
    // The end
    wonTitle: (b) => `🏆 The ${b.name} has been slain!`,
    won: (rounds, reward, tokens, gems, essences = null) => `The party won in **${plural(rounds, 'round', 'rounds')}**. Everyone who fought gets ${rewards(reward, tokens, gems, essences)} for their first win of the week.`,
    /** Under a win: those who won it already this week, and get nothing more for it (`users` are mentions). */
    alreadyPaid: (users) => `${andList(users)} already had this week's Weekly Boss reward, so this win pays them nothing more.`,
    wipedTitle: (b) => `☠️ The ${b.name} wins`,
    wiped: (rounds) => `Every raider was knocked out in round **${rounds}**. No rewards this time.`,
    fledTitle: (b) => `${b.fledEmoji} The ${b.name} got away`,
    fled: (b, rounds) => `${b.It} was still standing after **${plural(rounds, 'round', 'rounds')}** and ${b.fledHow}. No rewards this time.`,
    bossLeft: (hp, max) => `It had **${hp}** / ${max} HP left.`,
    rankingField: 'Damage',
    rankingLine: (place, user, damage, share) => `${place} ${user}: **${damage}** (${share})`,
    noDamage: 'Nobody landed a hit.',
    lastHitField: 'Final blow',
    teamField: 'Team play',
    teamLine: (user, healed, guards, supports) => `${user}: ${E.heal} ${healed} healed · ${E.guard} ${guards} · ✨ ${supports}`,
    pointsField: 'Points lost',
    /** Shown under the points lost when some went into the vault. */
    intoVault: (amount) => `${boldMoney(amount)} went into the vault.`,
    /** `spent` is what they spent on boosts, back when raids had them (null when nothing). */
    pointsLine: (user, spent, stolen) => `${user}: ${spent === null ? '' : `💸 ${spent} on boosts · `}💰 ${stolen} stolen`,
    noPointsLost: 'None.',
    places: ['🥇', '🥈', '🥉'],
    payFailed: (count) => `${plural(count, 'reward', 'rewards')} could not be paid. Ask the admin.`,
    /**
     * Under the rewards in the lobby and `raid stats`: the party's chance (like "20%") that everyone finds a
     * raid-only item, and what each raider adds (like "10%"). `now` is the chance with the lobby's party so far.
     */
    dropChance: (chance, perRaider, now, loot = 'a T3 raid item') => `The party also has a **${chance}** chance (+${perRaider} for each raider${now ? `, **${now}** with this party` : ''}) that everyone finds ${loot}, which can't be pulled from the gacha.`,
    /** The raid items found after a win (raid drops). `stars` is like "★★★★". */
    lootField: '🎁 Loot',
    lootLine: (user, item) => `${user} found **${item}**!`,
    /** A raider who found several: `items` is their lootItem parts. */
    lootLineMany: (user, items) => `${user} found ${items.join(', ')}`,
    /** One kind of item a raider found, and how many of it. */
    lootItem: (item, count = 1) => `**${item}**${count > 1 ? ` ×${count}` : ''}`,
    noLoot: 'No raid items dropped this time.',
    /** Under a won raid: shows whoever presses it their own items, privately (they can dismiss it). */
    lootButton: 'My loot',
    lootMineTitle: '🎁 Your raid loot',
    /** One line of that list: `slot` is the slot's emoji, `isNew` when it is their first copy. */
    lootMineLine: (slot, item, count, isNew) => `${slot} **${item}**${count > 1 ? ` ×${count}` : ''}${isNew ? ' 🆕' : ''}`,
    lootMineFooter: 'They are in your inventory. Only you can see this.',
    lootMineNone: "You didn't find any items in this raid.",
    // `raid stats`: this week's boss
    bossTitle: (b) => `${b.emoji} ${b.name}`,
    /** Above the stats: it is this week's boss, and until when. */
    bossWeek: (unix) => `This week's Weekly Boss, until <t:${unix}:F>. Only your first win of the week pays.`,
    /** `examples` is a few party sizes and the HP the boss has for them, already formatted. */
    /** `overhead` is how many raiders it counts as busy (they add no HP), like "2.5". */
    bossInfoHp: (perRaider, overhead, minRaiders, examples) => `❤️ **HP**: ${perRaider} for every raider past the first ${overhead}, and a party of fewer than ${minRaiders} fights it as if it had ${minRaiders}.\n${examples}`,
    bossHpExample: (raiders, hp) => `${plural(raiders, 'raider', 'raiders')}: ${hp}`,
    /** `hp` and `damage` are what each level past 1 adds, like "25%". */
    bossDifficulty: (max, hp, damage) => `⚔️ **Difficulty**: these are its numbers at level 1. Each level past it, up to ${max}, gives it +${hp} HP and +${damage} damage and drops more raid items. The host picks the level in the lobby, up to one past the hardest this server has beaten.`,
    /**
     * The top levels, from `from`: `damage` is what it hits harder by at level `max` besides (null with none), `supports`
     * how many Supports interrupt its channel there (null for a boss without one), `cc` whether its crowd control holds one more.
     */
    bossTop: (from, max, damage, supports, cc) => `🔥 **Levels ${from} to ${max}**: built for a party whose classes fit together. ${[
        ...(damage === null ? [] : [`It hits harder still, up to +${damage} at level ${max}`]),
        ...(supports === null ? [] : [`its channel takes ${supports} Supports to interrupt`]),
        ...(cc ? ['its crowd control holds one more raider'] : []),
    ].join(', ')}.`,
    /** `hp` is what it has on top for every raider from level `from` on (it climbs to that from level 2). */
    bossGear: (from, hp) => `❤️ **HP by level**: every level past 1 also gives it more HP for every raider, in equal steps up to **${hp}** at level ${from} and every level past it.`,
    bossRounds: (b, rounds) => `⏳ It ${b.fleesHow} (and the raid is lost) if it is still standing after **${rounds}** rounds.`,
    rewardsField: 'Rewards',
    /** What each raider who takes part gets when the boss is slain (nothing if it wins or gets away). */
    /** What each raider got for a win, with the currencies' emojis ("**1,000** <:zeiucoin:…>, **10** … and **5** …"). */
    rewardList: (reward, tokens, gems, essences = null) => rewards(reward, tokens, gems, essences),
    /**
     * `perLevel` is the points every level past 1 adds (null with none), `gemStep` the komaGems each of
     * `gemLevels` (the milestone levels) adds (null with none), `essenceStep` the hero essences of each kind every
     * level past 1 adds (null with none).
     */
    bossRewards: (reward, tokens, gems, perLevel = null, gemStep = null, gemLevels = [], essences = null, essenceStep = null) => `Upon slaying, everyone who fought gets ${rewards(reward, tokens, gems, essences)} (their first win of the week).` +
        (perLevel === null && gemStep === null && essenceStep === null
            ? ''
            : `\n📈 **Harder levels pay more**: ${[
                ...(perLevel === null && essenceStep === null
                    ? []
                    : [
                        `${andList([...(perLevel === null ? [] : [boldMoney(perLevel)]), ...(essenceStep === null ? [] : [`**${essenceStep}** of each hero essence 💠`])])} more for every level past 1`,
                    ]),
                ...(gemStep === null ? [] : [`${boldGems(gemStep)} more from ${gemLevels.map((level) => `level ${level}`).join(', and again from ')}`]),
            ].join(', and ')}.`),
    phasesField: 'Phases',
    /**
     * `below` is the share of HP the phase starts at (null for the first), `multiplier` how hard it
     * hits, `cc` how often and on how many raiders it uses crowd control (null for a boss without any),
     * `heals` what its healing is multiplied by (null for a boss that doesn't heal).
     */
    phaseLine: (name, below, multiplier, cc, heals) => `**${name}**${below === null ? '' : ` (below ${below} HP)`}: hits **${multiplier}** as hard.` +
        (cc === null ? '' : ` Crowd control once every **${plural(cc.cooldown, 'round', 'rounds')}**, on ${plural(cc.targets, 'raider', 'raiders')}.`) +
        (heals === null ? '' : ` Heals **${heals}** as much.`),
    phaseNames: ['😌 Calm', '😠 Enraged', '😡 Furious'],
    movesField: 'Moves',
    /** Its moves at their base damage (calm); each phase multiplies the damage. */
    moves: {
        claw: (damage) => `🦴 **Claw**: ${damage} damage to one raider. A guarding knight takes it instead.`,
        breath: (damage) => `🔥 **Fire Breath**: ${damage} damage to everyone. Guards reduce damage taken.`,
        sweep: (damage, min, max) => `🌀 **Tail Sweep**: ${damage} damage to ${min === max ? min : `${min} to ${max}`} raiders. Guards reduce damage taken.`,
        hoard: (min, max) => `💰 **Hoard**: steals ${boldMoney(min)} to ${boldMoney(max)} from one raider's wallet. Their guard stops it, or a knight's.`,
        shield: (deflects) => `🔷 **Scale Shield**: goes up without warning, in place of its move that turn, and deflects the next ${plural(deflects, 'attack', 'attacks')} before it shatters. Support can't break it.`,
        reap: (damage, lifesteal) => `🩸 **Reap**: ${damage} damage to one raider, and it heals **${lifesteal}x** the damage dealt. A guarding knight takes it instead, and guarding cuts what it heals.`,
        drain: (damage, lifesteal) => `👻 **Soul Drain**: ${damage} damage to everyone, and it heals **${lifesteal}x** the damage dealt. Guards reduce both.`,
        scythe: (damage, min, max) => `🌙 **Scythe Sweep**: ${damage} damage to ${min === max ? min : `${min} to ${max}`} raiders. Guards reduce damage taken.`,
        harvest: (damage, share) => `🕯️ **Harvest**: Tears ${damage} HP out of one raider and heals **${share}** of its max HP. Their guard stops it, or a knight's.`,
        /** `stagger` is what attacks do to it the turn after an interrupt, like "1.5x". */
        veil: (supports, stagger) => `🌫️ **Spectral Veil**: channels for a turn, then attacks pass right through it for a turn. ${supports} Supports while it channels interrupt it: it then skips a turn and takes **${stagger}** damage.`,
        empower: (multiplier) => `💢 **Dark Empowerment**: spends a turn powering up, and its next move is an attack doing **${multiplier}** damage.`,
        reckoning: (turns, damage, min, max) => `⚰️ **Grim Reckoning**: gathers for ${plural(turns, 'turn', 'turns')}, then hits ${min === max ? min : `${min} to ${max}`} raiders for ${damage} damage each. Guards reduce damage taken.`,
        spit: (damage, stacks) => `🤢 **Plague Spit**: ${damage} damage and +${stacks} 🦠 Blight to one raider. A guarding knight takes it instead.`,
        miasma: (damage, stacks) => `☁️ **Miasma**: ${damage} damage and +${stacks} 🦠 Blight to everyone. Guards reduce the damage.`,
        /** `per` is how many raiders it hits one of (RAID_COMBAT.moves.rot.raidersPerTarget). */
        rot: (damage, stacks, per) => `🍄 **Creeping Rot**: ${damage} damage and +${stacks} 🦠 Blight to ${per === 1 ? 'every raider' : `1 in every ${per} raiders (rounded up)`}. Guards reduce the damage.`,
        flies: (supports, stagger) => `🪰 **Fly Swarm**: channels for a turn, then attacks get lost in it for a turn. ${supports} Supports while it channels interrupt it: it then skips a turn and takes **${stagger}** damage.`,
        /** `from` is the share of its HP it starts brewing at, like "75%". */
        pestilence: (from, max) => `☣️ **Pestilence** (at ${from} HP or less): brews for a turn, then doubles every raider's 🦠 Blight (up to ${max} stacks).`,
        /** Its special attack. `phase` is the phase's name. */
        requiem: (phase, casts, cooldown) => `🌑 **Soul Requiem** (${phase} only): charges for a turn, then casts Soul Drain ${casts} times in a row. Support can't interrupt it. ${cooldown} round cooldown.`,
        cc: (effect, rounds) => `${E[effect]} **${ccMove[effect]}**: ${CC[effect].name} raiders ${CC[effect].does} for ${plural(rounds, 'turn', 'turns')}. A Support frees them.`,
    },
    /** Under the moves: crowd control shares one cooldown, which the phases set. */
    movesCcNote: 'Stun, Disarm and Taunt are crowd control: they share one cooldown, set by the phase.',
    /** Under the moves of a boss that leaves Blight: how it works. `cut` and `maxCut` are like "10%". */
    movesBlightNote: (tick, cut, maxCut, supportClears, supportAt, max) => `🦠 **Blight**: each stack deals **${tick}** damage at the end of every round and cuts the healing its raider gets by **${cut}** (at most ${maxCut}). ` +
        `Heals don't clear it. Once a raider carries ${supportAt} or more, one Support a turn clears ${plural(supportClears, 'stack', 'stacks')} off the most infected (more with the right gear). Getting knocked out clears it all. Up to ${max} stacks.`,
    bossFooter: 'Aimed moves go after whoever the boss has aimed at least so far, so everyone gets hit about equally.',
    // A raid the bot didn't finish
    interruptedTitle: 'The raid was cut short',
    interrupted: 'The bot stopped in the middle of this raid. Everything stolen by the boss has been given back, and another raid can be started.',
    failed: 'Something went wrong in the middle of this raid. Everything stolen by the boss has been given back, and another raid can be started.',
    // Admin test tools (`raid test ...`), for seeing each phase and ending on Discord
    test: {
        usage: (p) => [
            `**Raid test tools** (admin only, on the fight going on in this server):`,
            `\`${p}raid test calm | enraged | furious\`: jump to that phase (sets the boss's HP just inside it)`,
            `\`${p}raid test hp 40%\` or \`${p}raid test hp 1200\`: set the boss's HP`,
            `\`${p}raid test shield\`: raise or drop the boss's shield`,
            `\`${p}raid test next\`: end this turn now`,
            `\`${p}raid test kill | wipe | flee\`: end the fight with that result`,
            `A fight the tools changed pays no rewards.`,
        ].join('\n'),
        noFight: 'There is no raid fight going on in this server right now. Start one (and press Start raid to get into the fight).',
        badHp: 'Give the HP as a number or a percentage, like `1200` or `40%`.',
        hp: (hp, max) => `Boss HP set to **${hp}** / ${max}.`,
        phase: (phase, hp) => `Boss set to **${phase}** (${hp} HP).`,
        shieldOn: (b) => `${b.shield} raised.`,
        shieldOff: (b) => `${b.shield} dropped.`,
        next: 'Ending this turn now.',
        kill: 'Killing the boss: the victory screen is coming up.',
        wipe: 'Knocking out the whole party: the defeat screen is coming up.',
        flee: 'The boss gets away: the escape screen is coming up.',
        /** The line the fight's action log shows for a test change. */
        logLine: (user, what) => `🛠️ ${user} (test): ${what}`,
        noRewards: 'Test raid: no rewards were paid.',
    },
    // Admin
    /** `bosses` is every boss's name. */
    forceUsage: (p, bosses) => `Use \`${p}raid force <boss>\` to start a raid against a boss of your choice (${andList(bosses)}), instead of the one the week picked.`,
    adminOnly: 'Only the bot admin can do that.',
};
//# sourceMappingURL=raid.js.map