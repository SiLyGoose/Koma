import { randomInt } from 'node:crypto';
/** A new code of `length` random digits. `digit` is injectable for tests. */
export function rollCode(length, digit = () => randomInt(10)) {
    return Array.from({ length }, () => String(digit())).join('');
}
/** A guess as typed, cleaned up: `length` digits (spaces and dashes between them are ignored), or null if it isn't one. */
export function parseGuess(text, length) {
    const cleaned = text.replace(/[\s-]/g, '');
    return new RegExp(`^\\d{${length}}$`).test(cleaned) ? cleaned : null;
}
/** How each digit of `guess` scores against `code` (both the same length). */
export function scoreGuess(code, guess) {
    const marks = Array.from({ length: guess.length }, () => 'miss');
    const left = new Map();
    for (let i = 0; i < code.length; i++) {
        if (guess[i] === code[i])
            marks[i] = 'hit';
        else
            left.set(code[i], (left.get(code[i]) ?? 0) + 1);
    }
    for (let i = 0; i < guess.length; i++) {
        if (marks[i] === 'hit')
            continue;
        const digit = guess[i];
        const count = left.get(digit) ?? 0;
        if (count > 0) {
            marks[i] = 'near';
            left.set(digit, count - 1);
        }
    }
    return marks;
}
//# sourceMappingURL=code.js.map