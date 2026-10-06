import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt } from '../lib/format.js';
import { gearEffects } from '../lib/game/items/equipment.js';
import { energyNow, pinecraftGear, pinecraftWeek, withGear } from '../lib/game/pinecraft.js';
import type { Command } from '../discord/types.js';
import { getEquipment } from '../services/items/equipment.js';
import { loadWorld } from '../services/pinecraft.js';
import { siteGameLink, webConfig } from '../web/config.js';

/*
 * `k!pinecraft`: the member's energy, what their mine has paid and when it next starts over, and a
 * button to the games' site (the same link for everyone; the site logs them in with Discord). It is
 * played there (web/games/pinecraft/server.ts). There is no bet: every block dug takes energy, and ores
 * pay as they are dug.
 */

export const pinecraft: Command = {
  name: 'pinecraft',
  category: 'adventure',
  aliases: ['pc'],
  description: `Dig down through your own mine in the browser. Every block takes energy (it comes back over time), and the ores you find pay ${CURRENCY_NAME}.`,

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.pinecraft.off);
      return;
    }
    // Energy comes back faster with some gear (Canary in a Cage).
    const gear = pinecraftGear(gearEffects(await getEquipment(ctx.guildId, ctx.user.id), ctx.user.id));
    const rules = withGear(CONFIG.pinecraft, gear);
    const now = Date.now();
    const { world, earned } = await loadWorld(ctx.guildId, ctx.user.id, rules, now);
    const { energy, energyAt } = energyNow(world, rules, now);
    const fullAt = energy >= rules.maxEnergy ? null : energyAt + (rules.maxEnergy - energy) * rules.energyMinutes * 60_000;

    const embed = createEmbed()
      .setTitle(TEXT.pinecraft.title)
      .setDescription(TEXT.pinecraft.lobby(ctx.user.toString()))
      .addFields(
        { name: TEXT.pinecraft.energyField, value: TEXT.pinecraft.energyValue(energy, rules.maxEnergy, fullAt === null ? null : `<t:${Math.ceil(fullAt / 1000)}:R>`), inline: true },
        { name: TEXT.pinecraft.earnedField, value: TEXT.pinecraft.earnedValue(fmt(earned)), inline: true },
        { name: TEXT.pinecraft.resetField, value: TEXT.pinecraft.resetValue(`<t:${Math.floor(pinecraftWeek(now).next.getTime() / 1000)}:R>`) },
      )
      .setAuthor({ name: ctx.user.displayName, iconURL: ctx.user.displayAvatarURL() });
    // The same link for everyone: the site logs them in with Discord and opens Pinecraft in this server.
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteGameLink(config, 'pinecraft', ctx.guildId)).setLabel(TEXT.pinecraft.playButton).setEmoji('⛏️'),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
