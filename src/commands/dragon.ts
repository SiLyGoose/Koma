import { readFileSync } from 'node:fs';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, type Client } from 'discord.js';
import { TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { DRAGONS } from '../lib/game/dragon.js';
import type { Command } from '../discord/types.js';
import { getChannelId } from '../services/channel.js';
import { dragonRoomLink, webConfig, type WebConfig } from '../web/config.js';

/*
 * `k!dragon`: the Dragon Raid is played on the games' site (web/games/technomagic/, its dragons' rooms, and the Koma-UI repo),
 * so this says what it is and links to each dragon there. The links are the same for everyone: the site logs them in
 * with Discord and opens its Find Raid against that dragon. When someone creates a raid (not a room of their own, single
 * player), it goes up in the server's channel with that dragon and the raid's link (announceDragon), so others can join it.
 */

/** A dragon's picture (assets/dragon/<id>.png: it in its lair, as the site draws it), as the embed shows it. */
const picture = (dragon: string): AttachmentBuilder =>
  new AttachmentBuilder(readFileSync(new URL(`../../assets/dragon/${dragon}.png`, import.meta.url)), { name: `${dragon}.png` });

/** The raid's embed, with a button to each dragon's; once `host` has created raid `room` against `dragon`, that raid's alone. */
export function dragonMessage(config: WebConfig, guildId: string, opened?: { host: string; dragon: string; room: string }) {
  const t = TEXT.dragon;
  const shown = DRAGONS.find((dragon) => dragon.id === opened?.dragon) ?? DRAGONS[0];
  if (!shown) throw new Error('There are no dragons');
  const embed = createEmbed()
    .setTitle(opened ? t.openedTitle(shown.name) : t.title)
    .setDescription(opened ? `${t.opened(opened.host, shown.name)}\n\n${t.intro}` : t.intro)
    .setImage(`attachment://${shown.id}.png`)
    .setFooter({ text: t.footer });
  const buttons = (opened ? [shown] : DRAGONS).map((dragon) =>
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(dragonRoomLink(config, guildId, dragon.id, opened?.room))
      .setLabel(opened ? t.joinOne : t.joinButton(dragon.name))
      .setEmoji('🐉'),
  );
  return { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)], files: [picture(shown.id)] };
}

/** Says in the server's channel (the one the bot is confined to) that `host` has created raid `room` against `dragon`. Without one, nothing. */
export async function announceDragon(client: Client<true>, guildId: string, host: string, dragon: string, room: string): Promise<void> {
  const config = webConfig();
  const channelId = await getChannelId(guildId);
  if (!config || !channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable() || channel.isDMBased()) return;
  await channel.send(dragonMessage(config, guildId, { host, dragon, room }));
}

export const dragon: Command = {
  name: 'dragon',
  category: 'adventure',
  aliases: ['dragons', 'dragonraid', 'dr'],
  description: "The Dragon Raid on the Koma site: bring your heroes against King's Raid's dragons, together or alone. Wins give hero gear, points and hero essences.",

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.dragon.off);
      return;
    }
    await ctx.reply(dragonMessage(config, ctx.guildId));
  },
};
