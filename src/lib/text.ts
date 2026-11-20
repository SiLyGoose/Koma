/** Lowercase and drop punctuation so "merchants coat" finds "Merchant's Coat". */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/['’`".,!?-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * How many typos apart two strings are: the fewest letters to add, drop, change or swap with the
 * one next to it (Damerau-Levenshtein, optimal string alignment) to turn `a` into `b`.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  // Three rows of the table: two back (for swaps), the last one, and the one being filled.
  let before = new Array<number>(b.length + 1).fill(0);
  let last = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min((last[j] as number) + 1, (row[j - 1] as number) + 1, (last[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, (before[j - 2] as number) + 1);
      row.push(best);
    }
    before = last;
    last = row;
  }
  return last[b.length] as number;
}
