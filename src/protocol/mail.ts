/* The mailbox on the site: what the bot's GET /api/mail (and its POSTs) say of a member's mail. */

/**
 * What a mail carries, as the page shows it: a line ("5,000 zeiucoins", "Unique Weapon Ticket"), its icon (King's Raid's, if
 * any), a selector's kind, and (a selector claimed) the item it was picked as.
 */
export interface MailAttachmentView {
  text: string;
  icon: string | null;
  /** A selector: a unique weapon or a unique treasure, picked as it is claimed. */
  selector: 'uw' | 'ut' | null;
  /** A selector claimed: what it was picked as (its item). Null otherwise (left out: a bot from before). */
  picked?: MailPickItem | null;
}

/** An item a selector can be picked as: its id (its picture) and name. */
export interface MailPickItem {
  itemId: string;
  name: string;
}

/** One mail. */
export interface MailView {
  id: string;
  title: string;
  message: string;
  /** The bot itself (a pull's ticket), or the bot admin. */
  from: 'system' | 'admin';
  attachments: MailAttachmentView[];
  /** When it came (ISO). */
  sent: string;
  read: boolean;
  claimed: boolean;
}

/** An item a ticket can be picked as, as its popup shows it: a new copy's (0★) main stat, and its unique effect (its hero's alone). */
export interface MailTicketItem extends MailPickItem {
  main: { name: string; value: number } | null;
  effect: string | null;
}

/** A hero a selector can give a unique weapon or treasure of: its id and name, its unique weapon, and its four unique treasures (UT1 to UT4). */
export interface MailHero {
  id: string;
  name: string;
  weapon: MailTicketItem | null;
  treasures: MailTicketItem[];
}

/** GET /api/mail: their mail (the newest first), and how many unread. */
export interface MailboxView {
  mail: MailView[];
  unread: number;
}

/** GET /api/mail/tickets: the heroes a ticket can be picked for (asked for as a ticket's popup opens, not with the mail). */
export interface MailTickets {
  heroes: MailHero[];
}

/** POST /api/mail/claim's answer: the mailbox after, and what it gave, a line each. */
export type MailClaimed = MailboxView & { given: string[] };

/** Why a mail wasn't claimed (nothing given). */
export type MailClaimError = 'not_found' | 'claimed' | 'needs_pick' | 'bad_pick';
