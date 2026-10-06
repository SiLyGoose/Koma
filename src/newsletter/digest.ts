import { RAID_TIME_ZONE, TEXT } from '../constants/index.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { bossForWeek } from '../lib/events/raid-boss.js';
import type { RaidWeek } from '../lib/events/raid-week.js';
import { fmt, mention } from '../lib/format.js';
import { summarizeRaid, summarizeRobs, type RaidSummary } from '../lib/newsletter.js';
import type { WeekFacts } from '../services/newsletter.js';
import type { RaidBossId } from '../constants/index.js';

/*
 * The weekly digest (src/newsletter): how the week that just ended went in a server (its raid and
 * its robs), the admin's note if there is one, and which boss the week that just started has (its
 * card is in `raid stats` and `databank bosses`).
 */

/** A message ready to send. */
export interface Digest {
  embeds: BotEmbed[];
}

const bossName = (boss: RaidBossId): string => {
  const b = TEXT.raid.bosses[boss];
  return `${b.emoji} ${b.name}`;
};

/** How a raid ended, in one line. */
function raidResult(raid: RaidSummary): string {
  const t = TEXT.newsletter;
  const boss = bossName(raid.boss);
  if (raid.status === 'won') return t.raidWon(boss, raid.raiders, raid.rounds);
  if (raid.status === 'wiped') return t.raidWiped(boss, raid.raiders, raid.rounds);
  return t.raidFled(boss, raid.raiders, TEXT.raid.bosses[raid.boss].fledHow);
}

/** The raid field: how the week's raid (and extra raid) went, and who stood out. `weekBoss` is the boss nobody fought, if nobody did. */
export function raidLines(facts: Pick<WeekFacts, 'raid' | 'extraRaid'>, weekBoss: RaidBossId): string[] {
  const t = TEXT.newsletter;
  const raid = summarizeRaid(facts.raid);
  const extra = summarizeRaid(facts.extraRaid);
  const lines = [raid ? raidResult(raid) : facts.raid ? t.raidOngoing(bossName(facts.raid.boss ?? weekBoss)) : t.raidNotFought(bossName(weekBoss))];
  if (extra) lines.push(t.extraRaid(raidResult(extra)));
  if (raid) {
    if (raid.topDamage) lines.push(t.raidTopDamage(mention(raid.topDamage.userId), fmt(raid.topDamage.amount)));
    if (raid.topHealer) lines.push(t.raidTopHealer(mention(raid.topHealer.userId), fmt(raid.topHealer.amount)));
    if (raid.topGuard) lines.push(t.raidTopGuard(mention(raid.topGuard.userId), fmt(raid.topGuard.amount)));
    if (raid.status === 'won' && raid.lastHit) lines.push(t.raidLastHit(mention(raid.lastHit)));
  }
  return lines;
}

/** The robs field: how many, and who stood out. */
export function robLines(facts: Pick<WeekFacts, 'robs'>): string[] {
  const t = TEXT.newsletter;
  const robs = summarizeRobs(facts.robs);
  if (robs.attempts === 0) return [t.robsNone];
  const lines = [t.robsCount(robs.attempts, robs.gotAway, robs.caught, robs.slipped)];
  if (robs.biggest) lines.push(t.robsBiggest(mention(robs.biggest.robber), mention(robs.biggest.victim), fmt(robs.biggest.amount)));
  if (robs.topRobber) lines.push(t.robsTopRobber(mention(robs.topRobber.userId), fmt(robs.topRobber.amount), robs.topRobber.count));
  if (robs.mostRobbed) lines.push(t.robsMostRobbed(mention(robs.mostRobbed.userId), fmt(robs.mostRobbed.amount), robs.mostRobbed.count));
  return lines;
}

/** "October 3": the day a week starts, in the raid's time zone. */
export const weekDate = (week: RaidWeek): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: RAID_TIME_ZONE, month: 'long', day: 'numeric' }).format(week.start);

/**
 * `guildId`'s digest of `covered` (the week that just ended, from `facts`), sent as `upcoming` (the
 * week that follows) starts. A `preview` covers a week still going, and says when the real one goes out.
 */
export function weeklyDigest(guildId: string, facts: WeekFacts, covered: RaidWeek, upcoming: RaidWeek, note: string | null, preview = false): Digest {
  const t = TEXT.newsletter;
  const boss = bossForWeek(guildId, upcoming.key);
  const intro = preview ? t.previewIntro(Math.floor(covered.next.getTime() / 1000)) : t.weeklyIntro;
  const digest = createEmbed()
    .setTitle(t.weeklyTitle(weekDate(upcoming)))
    .setDescription(`${intro}\n\n${t.newBoss(bossName(boss), preview)}`);
  if (note) digest.addFields({ name: t.noteField, value: note });
  digest.addFields(
    { name: t.raidField(preview), value: raidLines(facts, bossForWeek(guildId, covered.key)).join('\n') },
    { name: t.robsField(preview), value: robLines(facts).join('\n') },
  );
  return { embeds: [digest] };
}
