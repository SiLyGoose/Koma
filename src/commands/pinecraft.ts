import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, MINE_WEB, PINECRAFT_WEB, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt } from '../lib/format.js';
import { gearEffects } from '../lib/game/equipment.js';
import { energyNow, pinecraftGear, pinecraftWeek, withGear } from '../lib/game/pinecraft.js';
import { replyPrivately } from '../discord/reply.js';
import type { Command } from '../discord/types.js';
import { getEquipment } from '../services/equipment.js';
import { loadWorld } from '../services/pinecraft.js';
import { gameLink, webConfig } from '../web/config.js';
import { signToken } from '../web/token.js';

/*
 * `k!pinecraft`: the member's energy and what their mine has paid, and the button that gives them
 * their own link to play it in the browser (web/pinecraft-server.ts). There is no bet: every block
 * dug takes energy, and ores pay as they are dug.
 */

const OPEN_ID = 'pinecraft_open';

export const pinecraft: Command = {
  name: 'pinecraft',
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
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(OPEN_ID).setLabel(TEXT.pinecraft.openButton).setEmoji('⛏️').setStyle(ButtonStyle.Primary),
    );
    const sent = await ctx.reply({ embeds: [embed], components: [row] });
    const message = await sent.fetchMessage();

    // Only the member it is for gets a link; it lets them play as themselves in this server.
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, filter: (b) => b.customId === OPEN_ID, time: PINECRAFT_WEB.lobbyButtonMs });
    collector.on('collect', (press) => {
      if (press.user.id !== ctx.user.id) {
        void replyPrivately(press, TEXT.pinecraft.notYours);
        return;
      }
      const link = gameLink(config, 'pinecraft', signToken({ guildId: ctx.guildId, userId: ctx.user.id, name: ctx.user.displayName }, MINE_WEB.linkTtlMs));
      void press
        .reply({
          content: TEXT.pinecraft.link,
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel(TEXT.pinecraft.linkButton))],
          flags: MessageFlags.Ephemeral,
        })
        .catch((err) => console.error('Could not send a Pinecraft link:', err));
    });
    collector.on('end', () => void message.edit({ components: [] }).catch(() => {}));
  },
};
