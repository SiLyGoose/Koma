import { boldMoney } from './currency.js';

export const heistText = {
  title: 'Greedy Heist',
  /** `prize` is what's in play, `rounds` how many rounds at most, `fine` what getting caught costs, `unix` when joining closes. */
  joinDescription: (prize: string, rounds: number, fine: string, unix: number) =>
    `A crew is breaking into the vault: ${boldMoney(prize)} is up for grabs over up to **${rounds}** rounds. Press **Join** before <t:${unix}:R>.\n\n` +
    `Every round, loot is split between everyone still inside, and the alarm gets more likely to go off. Press **Escape** to leave with your loot. ` +
    `Anyone still inside when the alarm goes off gets nothing and pays a ${boldMoney(fine)} fine.`,
  joinButton: 'Join',
  escapeButton: 'Escape',
  crewField: 'Crew',
  crewNobody: 'Nobody yet',
  crewCount: (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`,
  joined: "You're in! The heist starts when the timer ends.",
  alreadyJoined: 'You already joined this heist.',
  noCrewTitle: 'Nobody showed up',
  noCrew: 'Nobody joined, so the heist is off. The vault keeps its money.',
  /** The live heist. `round` 0 is the moment it starts, before any loot. */
  roundTitle: (round: number, rounds: number) => (round === 0 ? 'Greedy Heist: the crew is in' : `Greedy Heist: round ${round} of ${rounds}`),
  /** `left` is what's still to be handed out, `chance` the chance the alarm goes off next round. */
  roundDescription: (left: string, chance: string) =>
    `${boldMoney(left)} still in the vault. Chance the alarm goes off next round: **${chance}**.\nPress **Escape** to leave with your loot.`,
  insideField: 'Still inside',
  escapedField: 'Escaped',
  caughtField: 'Caught',
  nobody: 'Nobody',
  /** One player and their loot. */
  playerLine: (user: string, loot: string) => `${user} ${boldMoney(loot)}`,
  /** One caught player: the loot they lost and the fine they paid. */
  caughtLine: (user: string, fine: string) => `${user} paid ${boldMoney(fine)}`,
  more: (count: number) => `...and ${count} more`,
  notInHeist: "You're not in this heist.",
  alreadyEscaped: (loot: string) => `You already escaped with ${boldMoney(loot)}.`,
  escaped: (loot: string) => `You escaped with ${boldMoney(loot)}! It's paid out when the heist ends.`,
  alarmTitle: 'The alarm went off!',
  /** `round` it went off in, `caught` how many were still inside, `fine` what each paid. */
  alarm: (round: number, caught: number, fine: string) =>
    `The alarm went off in round **${round}**. ${caught === 1 ? 'The one person' : `The **${caught}** people`} still inside got caught, lost their loot and paid a ${boldMoney(fine)} fine.`,
  getawayTitle: 'Clean getaway!',
  getaway: 'The alarm never went off. Everyone still inside escaped with their loot.',
  allOutTitle: 'Everyone got out',
  allOut: 'The whole crew escaped before the alarm went off.',
  /** `taken` is everything paid out. The rest stays in the vault. */
  summary: (taken: string) => `The crew made off with ${boldMoney(taken)} in total. The rest stays in the vault.`,
  failedTitle: 'The heist fell apart',
  failed: 'Something went wrong while settling the heist, so nobody was paid or fined. Ask the bot admin to look at the logs.',
  someFailed: (count: number) => `${count} ${count === 1 ? 'payout' : 'payouts'} could not be made. Ask the bot admin to look at the logs.`,
};
