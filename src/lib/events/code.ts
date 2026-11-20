import { randomInt } from 'node:crypto';

/*
 * The rules of the Codedle event, with no database and no Discord. The code is a string of
 * digits (repeats allowed, leading zeros kept, like "04471"). A guess is scored the Wordle way,
 * digit by digit:
 *   - hit:  the right digit in the right spot;
 *   - near: a digit the code has, but in another spot;
 *   - miss: not in the code (or the code has no more of that digit left to match).
 * Hits are matched first, then nears from what's left, so a digit is never counted more often than
 * the code has it.
 */

export type Mark = 'hit' | 'near' | 'miss';

/** A new code of `length` random digits. `digit` is injectable for tests. */
export function rollCode(length: number, digit: () => number = () => randomInt(10)): string {
  return Array.from({ length }, () => String(digit())).join('');
}

/** A guess as typed, cleaned up: `length` digits (spaces and dashes between them are ignored), or null if it isn't one. */
export function parseGuess(text: string, length: number): string | null {
  const cleaned = text.replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${length}}$`).test(cleaned) ? cleaned : null;
}

/** How each digit of `guess` scores against `code` (both the same length). */
export function scoreGuess(code: string, guess: string): Mark[] {
  const marks: Mark[] = Array.from({ length: guess.length }, () => 'miss');
  const left = new Map<string, number>();
  for (let i = 0; i < code.length; i++) {
    if (guess[i] === code[i]) marks[i] = 'hit';
    else left.set(code[i] as string, (left.get(code[i] as string) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'hit') continue;
    const digit = guess[i] as string;
    const count = left.get(digit) ?? 0;
    if (count > 0) {
      marks[i] = 'near';
      left.set(digit, count - 1);
    }
  }
  return marks;
}

