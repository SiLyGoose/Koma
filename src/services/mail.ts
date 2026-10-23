import { randomBytes } from 'node:crypto';
import { ITEMS_BY_ID, UNIQUE_TREASURES, UNIQUE_WEAPONS } from '../data/items.js';
import { KR_RUNES_BY_ID, rollKrOptions, rollRuneOfGrade } from '../data/kr-gear.js';
import { collections } from '../db.js';
import { rollUtOptions } from '../lib/game/technomagic.js';
import type { ItemDef, MailAttachment, MailDoc } from '../types.js';
import { addCopy } from './economy/gacha.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * The members' mailboxes (MailDoc, the `mail` collection): mail the bot sends (a Hero Item pull's Unique Weapon or Unique
 * Treasure Ticket: grantReward) and the bot admin sends with a title, a message and rewards (the mail command: sendMail).
 * A member reads it on the site (its mail icon shows how many wait for them: unread, or with rewards unclaimed) and claims what it carries: points, komaGems,
 * komaTokens, copies of an item, runes, or a selector, held as a ticket (the member's `selectors`, the site's Inventory's
 * Others) until they use it (services/economy/powder.ts useSelector). Claimed once: a second claim finds it claimed.
 */

/** How many mails a mailbox shows at most (the newest). */
export const MAIL_SHOWN = 100;

export const newMailId = (): string => randomBytes(12).toString('base64url');

/** Sends a mail to each of `userIds` in a server (the same for each); how many it went to. */
export async function sendMail(guildId: string, userIds: readonly string[], mail: Pick<MailDoc, 'title' | 'message' | 'from' | 'attachments'>, now: Date = new Date()): Promise<number> {
  const docs: MailDoc[] = [...new Set(userIds)].map((userId) => ({ _id: newMailId(), guildId, userId, ...mail, createdAt: now }));
  if (docs.length > 0) await collections().mail.insertMany(docs);
  return docs.length;
}

/** Everyone a server has a member document for (who has ever done anything with the bot there). */
export async function everyoneIn(guildId: string): Promise<string[]> {
  return (await collections().members.find({ guildId }, { projection: { userId: 1 } }).toArray()).map((member) => member.userId);
}

/**
 * Gives a reward item (ItemDef.grant) a pull gave: a selector as a mail (its ticket, held once claimed), a rune of a
 * grade to their runes. What it gave: the mail's id, or the rune's.
 */
export async function grantReward(guildId: string, userId: string, item: ItemDef): Promise<string | null> {
  const grant = item.grant;
  if (!grant) return null;
  if ('selector' in grant) {
    const id = newMailId();
    await collections().mail.insertOne({
      _id: id,
      guildId,
      userId,
      title: item.name,
      message: `From the Hero Item banner: claim it, then use it in your Inventory's Others to pick the ${grant.selector === 'uw' ? 'unique weapon' : 'unique treasure'} you want.`,
      from: 'system',
      attachments: [{ kind: 'selector', of: grant.selector }],
      createdAt: new Date(),
    });
    return id;
  }
  const rune = rollRuneOfGrade(grant.runeGrade);
  if (!rune) return null;
  await ensureMember(guildId, userId);
  await collections().members.updateOne({ guildId, userId }, { $inc: { [`runes.${rune}`]: 1 } });
  return rune;
}

/** A member's mails that wait for them: unread, or read with rewards not yet claimed. */
const waitingMail = (guildId: string, userId: string) => ({
  guildId,
  userId,
  $or: [{ readAt: { $exists: false } }, { 'attachments.0': { $exists: true }, claimedAt: { $exists: false } }],
});

/** A member's mail, the newest first; and how many wait for them (unread, or with rewards unclaimed). */
export async function listMail(guildId: string, userId: string): Promise<{ mail: MailDoc[]; unread: number }> {
  const { mail } = collections();
  const [list, unread] = await Promise.all([mail.find({ guildId, userId }).sort({ createdAt: -1 }).limit(MAIL_SHOWN).toArray(), mail.countDocuments(waitingMail(guildId, userId))]);
  return { mail: list, unread };
}

/** How many mails wait for a member: unread, or with rewards unclaimed. */
export const unreadMail = (guildId: string, userId: string): Promise<number> => collections().mail.countDocuments(waitingMail(guildId, userId));

/** Marks a member's mail read (all of it, with no id). */
export async function readMail(guildId: string, userId: string, id: string | null, now: Date = new Date()): Promise<void> {
  await collections().mail.updateMany({ guildId, userId, ...(id && { _id: id }), readAt: { $exists: false } }, { $set: { readAt: now } });
}

/** A selector's pick: the hero (a unique weapon's or treasure's), and a unique treasure's skill (1 to 4). */
export interface SelectorPick {
  hero: string;
  skill?: number;
}

export type ClaimResult = { ok: true; given: string[] } | { ok: false; reason: 'not_found' | 'claimed' };

/** The item a selector's pick is (undefined: no such hero's, or skill). */
export function selectorItem(of: 'uw' | 'ut', pick: SelectorPick | undefined): ItemDef | undefined {
  if (!pick) return undefined;
  return of === 'uw' ? UNIQUE_WEAPONS.find((item) => item.uniqueWeapon === pick.hero) : UNIQUE_TREASURES.find((item) => item.uniqueTreasure?.hero === pick.hero && item.uniqueTreasure.skill === pick.skill);
}

/**
 * Claims a member's mail: everything it carries given (a selector, a ticket of its kind held, picked as it is used). What it
 * gave, a line each; or why not.
 */
export async function claimMail(guildId: string, userId: string, id: string, now: Date = new Date()): Promise<ClaimResult> {
  const { mail, members } = collections();
  const doc = await mail.findOne({ _id: id, guildId, userId });
  if (!doc) return { ok: false, reason: 'not_found' };
  if (doc.claimedAt) return { ok: false, reason: 'claimed' };
  const claimed = await mail.updateOne({ _id: id, claimedAt: { $exists: false } }, { $set: { claimedAt: now, readAt: doc.readAt ?? now } });
  if (claimed.modifiedCount === 0) return { ok: false, reason: 'claimed' };
  await ensureMember(guildId, userId);
  const given: string[] = [];
  const inc: Record<string, number> = {};
  for (const attachment of doc.attachments) {
    switch (attachment.kind) {
      case 'points':
      case 'gems':
      case 'tokens':
        inc[attachment.kind] = (inc[attachment.kind] ?? 0) + attachment.amount;
        given.push(`${attachment.amount.toLocaleString()} ${attachment.kind === 'points' ? 'zeiucoins' : attachment.kind === 'gems' ? 'komaGems' : 'komaTokens'}`);
        break;
      case 'rune':
        if (KR_RUNES_BY_ID.has(attachment.runeId)) {
          inc[`runes.${attachment.runeId}`] = (inc[`runes.${attachment.runeId}`] ?? 0) + attachment.count;
          given.push(`${attachment.count}× ${KR_RUNES_BY_ID.get(attachment.runeId)?.name}`);
        }
        break;
      case 'item': {
        const item = ITEMS_BY_ID.get(attachment.itemId);
        if (!item) break;
        for (let n = 0; n < attachment.count; n++) {
          await addCopy(guildId, userId, item.id, { ...(item.uniqueTreasure && { tmPotentials: rollUtOptions() }), ...(item.kr && { options: rollKrOptions(item.kr) }) });
        }
        given.push(`${attachment.count}× ${item.name}`);
        break;
      }
      case 'selector':
        inc[`selectors.${attachment.of}`] = (inc[`selectors.${attachment.of}`] ?? 0) + 1;
        given.push(attachment.of === 'uw' ? 'Unique Weapon Ticket' : 'Unique Treasure Ticket');
        break;
    }
  }
  if (Object.keys(inc).length > 0) await members.updateOne({ guildId, userId }, { $inc: inc });
  if (inc.points || inc.gems || inc.tokens) {
    await recordLedger([{ guildId, userId, delta: inc.points ?? 0, ...(inc.gems && { gemDelta: inc.gems }), ...(inc.tokens && { tokenDelta: inc.tokens }), reason: 'mail' }]);
  }
  return { ok: true, given };
}
