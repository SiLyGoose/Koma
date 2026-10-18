import { HEROES } from '../../data/heroes.js';
import { ITEMS_BY_ID, UNIQUE_TREASURES, UNIQUE_WEAPONS } from '../../data/items.js';
import { copyMainStat } from '../../lib/game/heroes.js';
import { uniqueTreasureText, uniqueWeaponText } from '../../../vendor/technomagic-sim.mjs';
import { KR_RUNES_BY_ID } from '../../data/kr-gear.js';
import { claimMail, listMail, readMail, type SelectorPick } from '../../services/mail.js';
import type { MailAttachment, MailDoc } from '../../types.js';
import type { MailAttachmentView, MailboxView, MailClaimError, MailHero, MailPickItem, MailTicketItem, MailView } from '../../protocol/mail.js';

export type { MailboxView };

/*
 * The mailbox on the site (GET /api/mail, POST /api/mail/read, /claim): a member's mail, the newest first, what each carries
 * a line each, and the heroes a selector can be picked for (services/mail.ts sends and claims it).
 */

/** What the mail routes use (the database's, unless a test says otherwise). */
export interface MailStore {
  view: (guildId: string, userId: string) => Promise<MailboxView>;
  read: (guildId: string, userId: string, id: string | null) => Promise<MailboxView>;
  claim: (guildId: string, userId: string, id: string, picks?: SelectorPick | readonly SelectorPick[]) => Promise<(MailboxView & { given: string[] }) | MailClaimError>;
}

const SELECTOR_ICON = { uw: 'WEAPON_UNIQUE_SELECT_ITEM', ut: 'TREASURE_UNIQUE_SELECT_ITEM' } as const;

/** An item as a pick (its id and name); null: no such item. */
const pickItem = (id: string | null | undefined): MailPickItem | null => {
  const item = id ? ITEMS_BY_ID.get(id) : undefined;
  return item ? { itemId: item.id, name: item.name } : null;
};

/** What an attachment carries, as the page shows it (a selector claimed: what it was `picked` as). */
export function attachmentView(attachment: MailAttachment, picked?: string | null): MailAttachmentView {
  switch (attachment.kind) {
    case 'points':
      return { text: `${attachment.amount.toLocaleString()} zeiucoins`, icon: null, selector: null, currency: 'points' };
    case 'gems':
      return { text: `${attachment.amount.toLocaleString()} komaGems`, icon: null, selector: null, currency: 'gems' };
    case 'tokens':
      return { text: `${attachment.amount.toLocaleString()} komaTokens`, icon: null, selector: null, currency: 'tokens' };
    case 'rune': {
      const rune = KR_RUNES_BY_ID.get(attachment.runeId);
      return { text: `${attachment.count}× ${rune?.name ?? attachment.runeId}`, icon: rune?.icon ?? null, selector: null };
    }
    case 'item': {
      const item = ITEMS_BY_ID.get(attachment.itemId);
      return { text: `${attachment.count}× ${item?.name ?? attachment.itemId}`, icon: item?.kr?.icon ?? item?.grant?.icon ?? null, selector: null };
    }
    case 'selector':
      return { text: attachment.of === 'uw' ? 'Unique Weapon Ticket' : 'Unique Treasure Ticket', icon: SELECTOR_ICON[attachment.of], selector: attachment.of, picked: pickItem(picked) };
  }
}

export const mailView = (doc: MailDoc): MailView => ({
  id: doc._id,
  title: doc.title,
  message: doc.message,
  from: doc.from,
  attachments: doc.attachments.map((attachment, i) => attachmentView(attachment, doc.picked?.[i])),
  sent: doc.createdAt.toISOString(),
  read: doc.readAt !== undefined,
  claimed: doc.claimedAt !== undefined,
});

/** An item as a ticket's popup shows it: a new copy's (0★, as a ticket gives it) main stat, and its unique effect at 0★. */
function ticketItem(id: string | undefined): MailTicketItem | null {
  const item = id ? ITEMS_BY_ID.get(id) : undefined;
  if (!item) return null;
  const ut = item.uniqueTreasure;
  const effect = ut ? (uniqueTreasureText(ut.hero, ut.skill, 0)?.text ?? null) : item.uniqueWeapon ? uniqueWeaponText(item.uniqueWeapon, 0) : null;
  const main = copyMainStat(item, { level: 0 });
  return { itemId: item.id, name: item.name, main: main && { name: main.name, value: main.value }, effect };
}

/** The heroes a selector can be picked for (GET /api/mail/tickets): every hero, with its unique weapon and its four unique treasures (those it has). */
export const MAIL_HEROES: readonly MailHero[] = HEROES.map((hero) => ({
  id: hero.id,
  name: hero.name,
  weapon: ticketItem(UNIQUE_WEAPONS.find((item) => item.uniqueWeapon === hero.id)?.id),
  treasures: [1, 2, 3, 4].flatMap((skill) => {
    const item = ticketItem(UNIQUE_TREASURES.find((one) => one.uniqueTreasure?.hero === hero.id && one.uniqueTreasure.skill === skill)?.id);
    return item ? [item] : [];
  }),
}));

async function load(guildId: string, userId: string): Promise<MailboxView> {
  const { mail, unread } = await listMail(guildId, userId);
  return { mail: mail.map(mailView), unread };
}

export const mailStore: MailStore = {
  view: load,
  read: async (guildId, userId, id) => {
    await readMail(guildId, userId, id);
    return load(guildId, userId);
  },
  claim: async (guildId, userId, id, picks) => {
    const result = await claimMail(guildId, userId, id, picks);
    return result.ok ? { ...(await load(guildId, userId)), given: result.given } : result.reason;
  },
};
