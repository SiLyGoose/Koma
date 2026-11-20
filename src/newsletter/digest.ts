import { NEWSLETTER, RAID_TIME_ZONE, TEXT } from '../constants/index.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { bossForWeek } from '../lib/events/raid-boss.js';
import type { RaidWeek } from '../lib/events/raid-week.js';
import { fmt, mention } from '../lib/format.js';
import { summarizeRobs } from '../lib/newsletter.js';
import type { WeekFacts } from '../services/newsletter.js';
import type { RaidBossId } from '../constants/index.js';

/*
 * The weekly digest (src/newsletter): which boss the week that just started has (its card is in
 * `raid stats` and `databank bosses`), and how the week that just ended went in robs.
 */

/** A message ready to send. */
export interface Digest {
  embeds: BotEmbed[];
}

const bossName = (boss: RaidBossId): string => {
  const b = TEXT.raid.bosses[boss];
  return `${b.emoji} ${b.name}`;
};

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
export function weeklyDigest(guildId: string, facts: WeekFacts, covered: RaidWeek, upcoming: RaidWeek, preview = false): Digest {
  const t = TEXT.newsletter;
  const boss = bossForWeek(guildId, upcoming.key);
  const intro = !preview ? t.weeklyIntro : NEWSLETTER.weeklyDigest ? t.previewIntro(Math.floor(covered.next.getTime() / 1000)) : t.previewIntroOff;
  const digest = createEmbed()
    .setTitle(t.weeklyTitle(weekDate(upcoming)))
    .setDescription(`${intro}\n\n${t.newBoss(bossName(boss), preview)}`);
  digest.addFields({ name: t.robsField(preview), value: robLines(facts).join('\n') });
  return { embeds: [digest] };
}
