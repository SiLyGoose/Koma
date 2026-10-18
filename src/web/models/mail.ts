import { HEROES } from '../../data/heroes.js';
import { ITEMS_BY_ID, UNIQUE_TREASURES, UNIQUE_WEAPONS } from '../../data/items.js';
import { KR_RUNES_BY_ID } from '../../data/kr-gear.js';
import { claimMail, listMail, readMail, type SelectorPick } from '../../services/mail.js';
import type { MailAttachment, MailDoc } from '../../types.js';
import type { MailAttachmentView, MailboxView, MailClaimError, MailHero, MailPickItem, MailView } from '../../protocol/mail.js';

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
      return { text: `${attachment.amount.toLocaleString()} zeiucoins`, icon: null, selector: null };
    case 'gems':
      return { text: `${attachment.amount.toLocaleString()} komaGems`, icon: null, selector: null };
    case 'tokens':
      return { text: `${attachment.amount.toLocaleString()} komaTokens`, icon: null, selector: null };
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

/** The heroes a selector can be picked for: every hero, with its unique weapon and its four unique treasures (those it has). */
export const MAIL_HEROES: readonly MailHero[] = HEROES.map((hero) => ({
  id: hero.id,
  name: hero.name,
  weapon: pickItem(UNIQUE_WEAPONS.find((item) => item.uniqueWeapon === hero.id)?.id),
  treasures: [1, 2, 3, 4].flatMap((skill) => {
    const item = pickItem(UNIQUE_TREASURES.find((one) => one.uniqueTreasure?.hero === hero.id && one.uniqueTreasure.skill === skill)?.id);
    return item ? [item] : [];
  }),
}));

async function load(guildId: string, userId: string): Promise<MailboxView> {
  const { mail, unread } = await listMail(guildId, userId);
  return { mail: mail.map(mailView), unread, heroes: [...MAIL_HEROES] };
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
