/** What the admin typed after the give command: an item id and an optional amount. */
export type GiveArgs =
  | { ok: true; itemId: string; count: number }
  /** Nothing typed, or too many words. */
  | { ok: false; reason: 'usage' }
  /** The amount was not a whole number from 1 to the maximum. */
  | { ok: false; reason: 'bad_amount' };

/** Reads `<item id> [amount]`. The id is lowercased so "C4" finds "c4". */
export function parseGiveArgs(args: readonly string[], maxAmount: number): GiveArgs {
  const [id, amount, ...extra] = args;
  if (!id || extra.length > 0) return { ok: false, reason: 'usage' };

  let count = 1;
  if (amount !== undefined) {
    if (!/^\d{1,9}$/.test(amount)) return { ok: false, reason: 'bad_amount' };
    count = Number(amount);
    if (count < 1 || count > maxAmount) return { ok: false, reason: 'bad_amount' };
  }
  return { ok: true, itemId: id.toLowerCase(), count };
}
