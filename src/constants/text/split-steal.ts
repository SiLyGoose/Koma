import { boldMoney } from './currency.js';

export const splitStealText = {
  title: 'Split or Steal',
  /** `prize` is what's in play, `min` how many players are needed, `unix` when joining closes. */
  joinDescription: (prize: string, min: number, unix: number) =>
    `${boldMoney(prize)} from the vault is on the table. Press **Join** before <t:${unix}:R> (at least **${min}** players).\n\n` +
    `Then everyone secretly picks **Split** or **Steal**. If everyone splits, the prize is shared. If exactly one person steals, they take it all. If two or more steal, nobody gets anything.`,
  joinButton: 'Join',
  splitButton: 'Split',
  stealButton: 'Steal',
  playersField: 'Players',
  playersNobody: 'Nobody yet',
  playersCount: (count: number, min: number) => `${count} ${count === 1 ? 'person' : 'people'}${count < min ? ` (needs ${min})` : ''}`,
  joined: "You're in! Choosing starts when the timer ends.",
  alreadyJoined: 'You already joined this game.',
  notEnoughTitle: 'Not enough players',
  notEnough: (count: number, min: number) =>
    `Only **${count}** ${count === 1 ? 'person' : 'people'} joined; it takes at least **${min}**. The money stays in the vault.`,
  decideTitle: 'Split or Steal: choose!',
  /** `prize` is what's in play, `unix` when choosing closes. */
  decideDescription: (prize: string, unix: number) =>
    `${boldMoney(prize)} is on the table. Players, press **Split** or **Steal** before <t:${unix}:R>. ` +
    `Nobody sees your choice until the end, and you can change your mind until then. No choice counts as Split.`,
  /** How many players have chosen so far (not what). */
  chosenCount: (chosen: number, total: number) => `${chosen} of ${total} have chosen`,
  notPlaying: "You're not in this game.",
  /** `unix` is when choosing closes. */
  choseSplit: (unix: number) => `You chose **Split**. You can change your mind until <t:${unix}:R>.`,
  choseSteal: (unix: number) => `You chose **Steal**. You can change your mind until <t:${unix}:R>.`,
  sharedTitle: 'Everyone split!',
  /** `prize` split between `count` people, `each`/`extra` as the crate's `opened`. */
  shared: (prize: string, count: number, each: string, extra: number) =>
    `Nobody stole. ${boldMoney(prize)} split between **${count}** people: ${boldMoney(each)} each${
      extra > 0 ? `, and ${extra} lucky ${extra === 1 ? 'player' : 'players'} got 1 more` : ''
    }.`,
  stolenTitle: 'Stolen!',
  stolen: (thief: string, prize: string) => `${thief} was the only one to steal, and takes all ${boldMoney(prize)}`,
  greedTitle: 'Too greedy',
  greed: (count: number) => `**${count}** people stole, so nobody gets anything. The money stays in the vault.`,
  choicesField: 'Choices',
  /** One player's choice, and what they won (empty when nothing). */
  choiceLine: (user: string, choice: string, won: string) => `${user}: **${choice}**${won === '' ? '' : ` +${boldMoney(won)}`}`,
  split: 'Split',
  steal: 'Steal',
  noChoice: 'Split (no choice)',
  more: (count: number) => `...and ${count} more`,
  failedTitle: 'The game fell apart',
  failed: 'Something went wrong while paying out, so nobody was paid. Ask the bot admin to look at the logs.',
  someFailed: (count: number) => `${count} ${count === 1 ? 'payout' : 'payouts'} could not be made. Ask the bot admin to look at the logs.`,
};
