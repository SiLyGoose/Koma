import { PITY_STARS, TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { canUseItem } from '../lib/equipment.js';
import { fmt, mentionList, starString } from '../lib/format.js';
import { pullGacha } from '../services/economy.js';
import { reply } from './reply.js';
import type { Command } from './types.js';
import { getPrefix } from '../services/settings.js';

export const gacha: Command = {
  name: 'gacha',
  aliases: ['pull'],
  description: 'Spend points to pull a random item.',
  usage: 'gacha [amount]',

  async execute({ message }) {
    const result = await pullGacha(message.guildId, message.author.id);

    if (!result.ok) {
      await reply(message, TEXT.gacha.cantAfford(getPrefix(), fmt(result.cost), fmt(result.balance)));
      return;
    }

    const { item } = result;
    const embed = createEmbed()
      .setTitle(TEXT.gacha.title(starString(item.stars), item.name))
      .setDescription(
        TEXT.gacha.description(item.description) +
          (item.usableBy && !canUseItem(item, message.author.id) ? `\n${TEXT.gacha.exclusive(mentionList(item.usableBy))}` : ''),
      )
      .addFields(
        {
          name: TEXT.gacha.spentField,
          value:
            result.cost < result.baseCost
              ? TEXT.gacha.spentWithGear(fmt(result.cost), fmt(result.baseCost - result.cost))
              : TEXT.gacha.spent(fmt(result.cost)),
          inline: true,
        },
        { name: TEXT.gacha.balanceField, value: fmt(result.balance), inline: true },
      )
      .setFooter({ text: result.isNew ? TEXT.gacha.footerNew : TEXT.gacha.footerOwned(result.count) })
      .setAuthor({ name: TEXT.gacha.author(message.author.displayName), iconURL: message.author.displayAvatarURL() });
    // if (result.pity) {
    //   embed.addFields({
    //     name: TEXT.gacha.pityField(starString(PITY_STARS)),
    //     value: TEXT.gacha.pityProgress(fmt(result.pity.count), fmt(result.pity.hardPity)),
    //     inline: true,
    //   });
    // }
    await reply(message, { embeds: [embed] });
  },
};
