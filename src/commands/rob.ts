import { FAILURE_TITLES, SUCCESS_TITLES, TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatPercent } from '../lib/format.js';
import { pickRandom } from '../lib/random.js';
import { rob as robService } from '../services/economy.js';
import { reply } from './reply.js';
import { memberNotFound, resolveUserArg } from './resolve.js';
import type { Command } from './types.js';
import { getPrefix } from '../services/settings.js';

function caughtText(
  robber: string,
  victim: string,
  result: { fine: number; owed: number; waived: number },
): string {
  if (result.owed === 0 && result.waived > 0) return TEXT.rob.caughtGearSaved(robber, victim);
  if (result.fine === 0) return TEXT.rob.caughtNothingToFine(robber, victim);
  return result.waived > 0
    ? TEXT.rob.caughtFinedWithGear(robber, victim, fmt(result.fine), fmt(result.waived))
    : TEXT.rob.caughtFined(robber, victim, fmt(result.fine));
}

/** Extra lines under a successful rob: a tax paid out of it, and taxes now waiting on the victim. */
function successNotes(
  victim: string,
  result: {
    stolen: number;
    claimTax: number | null;
    robTax: number | null;
    robTaxPaid: { amount: number; toUserId: string } | null;
  },
): string {
  const lines: string[] = [];
  if (result.robTaxPaid !== null) {
    const { amount, toUserId } = result.robTaxPaid;
    lines.push(TEXT.rob.robTaxPaid(`<@${toUserId}>`, fmt(amount), fmt(result.stolen - amount)));
  }
  if (result.claimTax !== null) lines.push(TEXT.rob.claimTaxed(victim, formatPercent(result.claimTax)));
  if (result.robTax !== null) lines.push(TEXT.rob.robTaxed(victim, formatPercent(result.robTax)));
  return lines.map((line) => `\n${line}`).join('');
}

export const rob: Command = {
  name: 'rob',
  description: 'Steal points from another member. You can rob once per hour, and each member can only be robbed once per hour.',
  usage: 'rob @user',

  async execute({ message, args }) {
    if (!args[0]) {
      await reply(message, TEXT.rob.usage(getPrefix()));
      return;
    }

    const target = await resolveUserArg(message, args[0]);
    if (!target) {
      await reply(message, memberNotFound('rob @user'));
      return;
    }
    if (target.bot) {
      await reply(message, TEXT.rob.botTarget);
      return;
    }
    if (target.id === message.author.id) {
      await reply(message, TEXT.rob.selfTarget);
      return;
    }

    const result = await robService(message.guildId, message.author.id, target.id);

    if (!result.ok) {
      if (result.reason === 'cooldown') {
        await reply(message, TEXT.rob.cooldown(result.availableAtUnix));
      } else if (result.reason === 'victim_recently_robbed') {
        await reply(message, TEXT.rob.victimProtected(target.displayName, result.availableAtUnix));
      } else {
        await reply(message, TEXT.rob.victimBroke(target.displayName));
      }
      return;
    }

    const embed = createEmbed().setFooter({ text: TEXT.rob.footer(formatPercent(result.chance)) });

    if (result.success) {
      embed
        .setTitle(pickRandom(SUCCESS_TITLES))
        .setDescription(
          (result.victimBalance === 0 ? TEXT.rob.successEverything : TEXT.rob.success)(
            message.author.toString(),
            target.toString(),
            fmt(result.stolen),
          ) + successNotes(target.toString(), result),
        );
    } else {
      embed
        .setTitle(pickRandom(FAILURE_TITLES))
        .setDescription(caughtText(message.author.toString(), target.toString(), result));
    }

    // Ping only the victim so they know it happened.
    await reply(message, {
      embeds: [embed],
      allowedMentions: { users: [target.id] },
    });
  },
};
