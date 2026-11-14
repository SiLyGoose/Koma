import { AUTOCOMPLETE_MAX_CHOICES } from '../constants/index.js';
import { normalize } from './text.js';
const MAX_PART = 100;
const cut = (text) => (text.length > MAX_PART ? `${text.slice(0, MAX_PART - 1)}…` : text);
/**
 * How well `texts` match what was typed, best first (lower is better), or null for no match:
 * 0 a text starts with it, 1 a word in a text starts with it, 2 a text contains it.
 * Case and punctuation are ignored, like item lookups are.
 */
function rank(wanted, texts) {
    let best = null;
    for (const raw of texts) {
        const text = normalize(raw);
        let score = null;
        if (text.startsWith(wanted))
            score = 0;
        else if (text.split(' ').some((word) => word.startsWith(wanted)))
            score = 1;
        else if (text.includes(wanted))
            score = 2;
        if (score !== null && (best === null || score < best))
            best = score;
    }
    return best;
}
/**
 * The items that match what a member has typed so far, for the item option of a slash command.
 * Nothing typed lists the first items. The value is the item's id, which item lookups accept.
 */
export function itemChoices(query, items, max = AUTOCOMPLETE_MAX_CHOICES) {
    const wanted = normalize(query);
    return items
        .map((item, index) => ({ item, index, score: wanted === '' ? 0 : rank(wanted, [item.name, item.id]) }))
        .filter((entry) => entry.score !== null)
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .slice(0, max)
        .map(({ item }) => ({ name: cut(item.name), value: cut(item.id) }));
}
/** The same for a list of plain names, like setting keys. */
export function nameChoices(query, names, max = AUTOCOMPLETE_MAX_CHOICES) {
    const wanted = normalize(query);
    return names
        .map((name, index) => ({ name, index, score: wanted === '' ? 0 : rank(wanted, [name]) }))
        .filter((entry) => entry.score !== null)
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .slice(0, max)
        .map(({ name }) => ({ name: cut(name), value: cut(name) }));
}
//# sourceMappingURL=autocomplete.js.map