/** Reads `<item id> [amount]`. The id is lowercased so "C4" finds "c4". */
export function parseGiveArgs(args, maxAmount) {
    const [id, amount, ...extra] = args;
    if (!id || extra.length > 0)
        return { ok: false, reason: 'usage' };
    let count = 1;
    if (amount !== undefined) {
        if (!/^\d{1,9}$/.test(amount))
            return { ok: false, reason: 'bad_amount' };
        count = Number(amount);
        if (count < 1 || count > maxAmount)
            return { ok: false, reason: 'bad_amount' };
    }
    return { ok: true, itemId: id.toLowerCase(), count };
}
//# sourceMappingURL=give.js.map