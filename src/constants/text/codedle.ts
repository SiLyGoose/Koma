import { boldMoney } from './currency.js';

export const codedleText = {
  title: 'Codedle',
  /** `prize` is what's in play, `length` how many digits, `cost` what a guess costs ('' when free), `unix` when it closes. */
  description: (prize: string, length: number, cost: string, unix: number) =>
    `The vault is locked with a **${length}-digit** code, and ${boldMoney(prize)} is inside. The first to guess it wins it all. Closes <t:${unix}:R>.\n\n` +
    `Press **Guess** and type ${length} digits (repeats allowed). ${cost === '' ? 'Guessing is free.' : `Each guess costs ${boldMoney(cost)}, added to the vault.`}\n` +
    `🟩 right digit, right spot · 🟨 in the code, wrong spot · ⬛ not in the code`,
  guessButton: 'Guess',
  modalTitle: 'Codedle',
  /** The pop-up's text box label. */
  inputLabel: (length: number) => `Your ${length}-digit guess`,
  inputPlaceholder: (length: number) => '0'.repeat(length),
  boardField: 'Guesses so far',
  boardEmpty: 'No guesses yet.',
  /** One guess on the board: its hint squares, the digits, and who guessed. */
  boardLine: (squares: string, guess: string, user: string) => `${squares} \`${guess}\` ${user}`,
  /** Shown under the board when older guesses are hidden. */
  olderGuesses: (count: number) => `...and ${count} older ${count === 1 ? 'guess' : 'guesses'}`,
  ruledOutField: 'Not in the code',
  guessCount: (count: number) => `${count} ${count === 1 ? 'guess' : 'guesses'} so far`,
  badGuess: (length: number) => `That isn't a ${length}-digit code. Type exactly ${length} digits, like ${'1234567890'.slice(0, length)}.`,
  cantAfford: (cost: string) => `A guess costs ${boldMoney(cost)} and you don't have enough.`,
  over: 'Too late, this vault is already closed.',
  /** A wrong guess, told privately. */
  wrong: (squares: string, guess: string) => `${squares} \`${guess}\` Not quite. The hint is on the board for everyone.`,
  crackedTitle: 'Cracked!',
  /** `user` guessed `code` and won `prize`, after `count` guesses in total. */
  cracked: (user: string, code: string, prize: string, count: number) =>
    `${user} cracked the code \`${code}\` and takes ${boldMoney(prize)}! It took **${count}** ${count === 1 ? 'guess' : 'guesses'} in all.`,
  youWon: (prize: string) => `🟩🟩🟩🟩🟩 You cracked it! ${boldMoney(prize)} is yours.`,
  lockedTitle: 'The vault stayed locked',
  locked: (code: string, count: number) =>
    `Nobody cracked it. The code was \`${code}\`, after **${count}** ${count === 1 ? 'guess' : 'guesses'}. The money stays in the vault.`,
  failedTitle: 'The lock jammed',
  failed: 'Something went wrong paying out the prize. Ask the bot admin to look at the logs.',
  somethingWrong: 'Something went wrong with your guess, so it was not counted (and not charged). Try again.',
};
