import { readFileSync } from 'node:fs';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, type Client } from 'discord.js';
import { TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import type { Command } from '../discord/types.js';
import { getChannelId } from '../services/channel.js';
import { technomagicRoomLink, webConfig, type WebConfig } from '../web/config.js';

/*
 * `k!technomagic`: the TechnoMagic Raid is played on the games' site (web/games/technomagic/, and the
 * Koma-UI repo), so this says what it is, with Galgoria, and links there. The link is the same for
 * everyone: the site logs them in with Discord and puts them in this server's room (multiplayer). When someone opens the
 * room on the site (not one of their own, single player), the same goes up in the server's channel (announceTechnoMagic), so others can join.
 */

const PICTURE = 'galgoria.png';

/** Galgoria, as the embed shows it. */
const picture = (): AttachmentBuilder => new AttachmentBuilder(readFileSync(new URL(`../../assets/technomagic/${PICTURE}`, import.meta.url)), { name: PICTURE });

/** The raid's embed, with the button to join it (`host`: who has just opened the room). */
export function technomagicMessage(config: WebConfig, guildId: string, host?: string) {
  const embed = createEmbed()
    .setTitle(TEXT.technomagic.title)
    .setDescription(host ? `${TEXT.technomagic.opened(host)}\n\n${TEXT.technomagic.intro}` : TEXT.technomagic.intro)
    .setImage(`attachment://${PICTURE}`)
    .setFooter({ text: TEXT.technomagic.footer });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(technomagicRoomLink(config, guildId)).setLabel(TEXT.technomagic.joinButton).setEmoji('🐲'),
  );
  return { embeds: [embed], components: [row], files: [picture()] };
}

/** Says in the server's channel (the one the bot is confined to) that `host` has opened the raid's room. Without one, nothing. */
export async function announceTechnoMagic(client: Client<true>, guildId: string, host: string): Promise<void> {
  const config = webConfig();
  const channelId = await getChannelId(guildId);
  if (!config || !channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable() || channel.isDMBased()) return;
  await channel.send(technomagicMessage(config, guildId, host));
}

export const technomagic: Command = {
  name: 'technomagic',
  category: 'adventure',
  aliases: ['tm', 'tmraid'],
  description: "The TechnoMagic Raid on the Koma site: bring your heroes against Galgoria together, as in King's Raid. Wins give TechnoMagic gear.",

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.technomagic.off);
      return;
    }
    await ctx.reply(technomagicMessage(config, ctx.guildId));
  },
};
