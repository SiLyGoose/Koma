import type { Client } from 'discord.js';
import { BIO } from '../constants/index.js';

/*
 * Keeps the bot's bio (its About Me) pointing at the games' site, so a new WEB_URL shows up in
 * Discord without editing the Developer Portal (see BIO).
 */

/** `bio` with its site line (the one starting with BIO.siteLabel) pointing at `siteUrl`, added at the end if missing. */
export function withSiteLine(bio: string, siteUrl: string): string {
  const line = `${BIO.siteLabel} ${siteUrl}`;
  const lines = bio.split('\n');
  const at = lines.findIndex((l) => l.trimStart().startsWith(BIO.siteLabel));
  if (at >= 0) lines[at] = line;
  else return bio.trim() ? `${bio.trimEnd()}\n\n${line}` : line;
  return lines.join('\n');
}

/** Points the bio's site line at `siteUrl`, if it doesn't already. Never throws: the bio is decoration. */
export async function syncBio(client: Client<true>, siteUrl: string): Promise<void> {
  try {
    const app = await client.application.fetch();
    const before = app.description ?? '';
    const after = withSiteLine(before, siteUrl);
    if (after === before) return;
    if (after.length > BIO.maxLength) {
      console.error(`The bot's bio would be ${after.length} characters with the site's address (Discord allows ${BIO.maxLength}): shorten it in the Developer Portal.`);
      return;
    }
    await app.edit({ description: after });
    console.log(`Pointed the bot's bio at ${siteUrl}.`);
  } catch (err) {
    console.error("Could not update the bot's bio:", err);
  }
}
