import type { EssenceId } from '../../data/transcend.js';
import { collections } from '../../db.js';
import { ensureMember, recordLedger } from './shared.js';

/*
 * Hero essences (data/transcend.ts): King's Raid's seven kinds, won by beating the weekly raid (three kinds, its
 * boss's) and spent transcending the TechnoMagic Raid's heroes on the site's heroes page (services/heroes.ts). They
 * are kept on the member (`essences`, a count of each kind; missing means none).
 */

/** Gives a member so many of each of `essences`. */
export async function giveEssences(guildId: string, userId: string, essences: Partial<Record<EssenceId, number>>, reason: 'raid_essences'): Promise<void> {
  const given = Object.entries(essences).filter(([, amount]) => (amount ?? 0) > 0);
  if (given.length === 0) return;
  await ensureMember(guildId, userId);
  await collections().members.updateOne({ guildId, userId }, { $inc: Object.fromEntries(given.map(([id, amount]) => [`essences.${id}`, amount])) });
  await recordLedger([{ guildId, userId, delta: 0, essenceDelta: Object.fromEntries(given), reason }]);
}
