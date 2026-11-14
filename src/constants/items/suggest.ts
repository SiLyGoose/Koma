/*
 * Guessing which item a misspelled name meant (suggestItems in data/items/lookup.ts), and the
 * "Did you mean...?" question that asks about it (discord/item-pick.ts).
 *
 * `typos` is how many typos (a letter added, dropped, changed, or two swapped) a name can have and
 * still be guessed, by how many letters were typed: [at least this many letters, typos] pairs,
 * longest first. Shorter than the last pair, nothing is guessed.
 */
export const ITEM_SUGGEST = {
  typos: [
    [9, 3],
    [6, 2],
    [3, 1],
  ] as readonly (readonly [number, number])[],
  /** The most items the question offers at once (one button each, next to a "None of these" button). */
  maxChoices: 4,
  /** How long the member has to answer before the question gives up. */
  timeoutMs: 30_000,
  /** The buttons' ids: `prefix` + the item's place in the list, and the one for "no". */
  prefix: 'item_suggest:',
  noId: 'item_suggest_no',
};
