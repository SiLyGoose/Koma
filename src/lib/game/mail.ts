import { ITEMS_BY_ID } from '../../data/items.js';
import { KR_RUNES_BY_ID } from '../../data/kr-gear.js';
import type { MailAttachment } from '../../types.js';

/*
 * The mail command's words (commands/mail.ts), with no database: whom to, the title, the message and the rewards, as
 * `<@user | all> | <title> | <message> [| <rewards>]`. Rewards are separated by commas or spaces: `points:5000`, `gems:20`,
 * `tokens:5`, `item:<item id>` (`x3` after it for 3), `rune:<rune id>` (the same), `uw` or `ut` (a Unique Weapon or
 * Unique Treasure Ticket: a selector), and `tp` (a Transcendence Attribute Point (5 TP), `tpx3` or `tp:3` for 3).
 */

/** The most of any one amount a mail may carry. */
export const MAIL_MOST = 1_000_000_000;

export type MailCommand =
  | { ok: true; to: 'all' | string; title: string; message: string; attachments: MailAttachment[] }
  | { ok: false; reason: 'usage' | 'bad_target' | 'bad_reward'; detail?: string };

/** Whom a mail goes to, from a mention, an id, or "all" / "everyone" (null: neither). */
export function mailTarget(word: string): 'all' | string | null {
  const text = word.trim();
  if (/^(all|everyone|@everyone)$/i.test(text)) return 'all';
  const id = /^<@!?(\d{17,20})>$/.exec(text)?.[1] ?? (/^\d{17,20}$/.test(text) ? text : null);
  return id;
}

/** One reward word as an attachment (null: not one). */
export function parseReward(word: string): MailAttachment | null {
  const text = word.trim();
  if (/^(uw|selector:uw)$/i.test(text)) return { kind: 'selector', of: 'uw' };
  if (/^(ut|selector:ut)$/i.test(text)) return { kind: 'selector', of: 'ut' };
  const tp = /^tp(?:x(\d+)|:(\d+))?$/i.exec(text);
  if (tp) {
    const count = Number(tp[1] ?? tp[2] ?? 1);
    return Number.isSafeInteger(count) && count > 0 && count <= 100 ? { kind: 'tp', count } : null;
  }
  const amount = /^(points|zeiucoins|coins|gems|tokens):(\d+)$/i.exec(text);
  if (amount) {
    const n = Number(amount[2]);
    if (!Number.isSafeInteger(n) || n <= 0 || n > MAIL_MOST) return null;
    const kind = (amount[1] as string).toLowerCase();
    return { kind: kind === 'gems' ? 'gems' : kind === 'tokens' ? 'tokens' : 'points', amount: n };
  }
  const thing = /^(item|rune):([\w-]+?)(?:x(\d+))?$/i.exec(text);
  if (thing) {
    const id = thing[2] as string;
    const count = thing[3] === undefined ? 1 : Number(thing[3]);
    if (!Number.isSafeInteger(count) || count <= 0 || count > 100) return null;
    if ((thing[1] as string).toLowerCase() === 'item') return ITEMS_BY_ID.has(id) && !ITEMS_BY_ID.get(id)?.grant ? { kind: 'item', itemId: id, count } : null;
    return KR_RUNES_BY_ID.has(id) ? { kind: 'rune', runeId: id, count } : null;
  }
  return null;
}

/** The mail command's words: whom to, the title, the message and the rewards (or why not). */
export function parseMailCommand(raw: string): MailCommand {
  const parts = raw.split('|').map((part) => part.trim());
  if (parts.length < 3 || !parts[1] || !parts[2]) return { ok: false, reason: 'usage' };
  const to = mailTarget(parts[0] as string);
  if (to === null) return { ok: false, reason: 'bad_target', detail: parts[0] };
  const attachments: MailAttachment[] = [];
  for (const word of (parts.slice(3).join(' ') ?? '').split(/[\s,]+/).filter(Boolean)) {
    const reward = parseReward(word);
    if (!reward) return { ok: false, reason: 'bad_reward', detail: word };
    attachments.push(reward);
  }
  return { ok: true, to, title: (parts[1] as string).slice(0, 100), message: (parts[2] as string).slice(0, 2000), attachments };
}
