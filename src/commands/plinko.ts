import { ComponentType, MessageFlags } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, PLINKO_ANIMATION, PLINKO_BUTTONS, PLINKO_IMAGE_NAME, TEXT } from '../constants/index.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, formatPercent, money, signed } from '../lib/format.js';
import { betForButton, parseBetArg, type BetButtonIds } from '../lib/game/bet.js';
import { expectedReturn, slotMultipliers } from '../lib/game/plinko.js';
import { betButtonRow, refusalText, resolveBet } from '../discord/bet.js';
import { renderPlinko } from '../animations/images/plinko-image.js';
import { playPlinko, type PlinkoResult } from '../services/economy/index.js';
import { playFrames, type AnimationPlan, type FrameSurface } from '../animations/play.js';
import type { Command, CommandContext, SentReply } from '../discord/types.js';

export const PLINKO_BET_IDS: BetButtonIds = { again: 'plinko_again', double: 'plinko_double', half: 'plinko_half' };

type Played = Extract<PlinkoResult, { ok: true }>;

/** The result of a game, shown when the ball has landed. */
function resultEmbed(ctx: CommandContext, played: Played): BotEmbed {
  const { bet, payout, net, multiplier } = played;
  const ending =
    payout > bet ? TEXT.plinko.paidMore(fmt(payout)) : payout === bet ? TEXT.plinko.paidSame : payout > 0 ? TEXT.plinko.paidLess(fmt(payout)) : TEXT.plinko.paidNothing;
  return createEmbed()
    .setTitle(TEXT.plinko.resultTitle(formatMultiplier(multiplier)))
    .setDescription(`${TEXT.plinko.landed(ctx.user.toString(), fmt(bet), formatMultiplier(multiplier))} ${ending}`)
    .addFields(
      { name: TEXT.plinko.betField, value: money(bet), inline: true },
      { name: TEXT.plinko.payoutField, value: TEXT.plinko.payout(fmt(payout), signed(net)), inline: true },
      { name: TEXT.plinko.balanceField, value: money(played.balance), inline: true },
    )
    .setFooter({ text: TEXT.plinko.footer(formatPercent(expectedReturn(CONFIG.plinko.payout))) })
    .setAuthor({ name: TEXT.plinko.author(ctx.user.displayName), iconURL: ctx.user.displayAvatarURL() });
}

/** The ball falling, one picture per row of pegs, ending on the picture of it in its slot. */
function dropPlan(ctx: CommandContext, played: Played): AnimationPlan {
  const rows = played.path.length;
  // The board shows what the slots paid when this game was played, whatever the settings are now.
  const multipliers = slotMultipliers(CONFIG.plinko.payout, rows);
  multipliers[played.slot] = played.multiplier;
  return {
    steps: rows,
    frameMs: PLINKO_ANIMATION.frameMs,
    title: TEXT.plinko.dropTitle,
    text: TEXT.plinko.dropping(ctx.user.toString(), fmt(played.bet)),
    imageName: PLINKO_IMAGE_NAME,
    frame: (step) => renderPlinko(multipliers, played.path, step, false),
    finish: () => renderPlinko(multipliers, played.path, rows, true),
  };
}

/**
 * Where a game is shown: a new reply (the first game), or the message a button was pressed on
 * (the games after it, which replace the one before).
 */
type Target = { kind: 'new'; ctx: CommandContext } | { kind: 'edit'; ctx: CommandContext; surface: FrameSurface; followUp: (embed: BotEmbed) => Promise<void> };

/**
 * Shows one finished game: the ball falling, then the result with the buttons. Returns the reply
 * the buttons are on when this was a new reply (null if they could not be put anywhere), so they
 * can be listened to. The points have already moved: the picture is only for show, so if it can't
 * be drawn or sent the result still appears.
 */
async function showGame(target: Target, played: Played): Promise<SentReply | null> {
  const { ctx } = target;
  const embed = resultEmbed(ctx, played);
  const components = [betButtonRow(PLINKO_BET_IDS, played.bet, played.balance, CONFIG.plinko)];

  let plan: AnimationPlan;
  let spinning: BotEmbed;
  let surface: FrameSurface;
  let sent: SentReply | null = null;
  try {
    plan = dropPlan(ctx, played);
    spinning = createEmbed().setTitle(plan.title).setDescription(plan.text).setImage(`attachment://${plan.imageName}`);
    const first = { attachment: plan.frame(0), name: plan.imageName };
    if (target.kind === 'new') {
      sent = await ctx.reply({ embeds: [spinning], files: [first] });
      surface = sent;
    } else {
      await target.surface.edit({ embeds: [spinning], files: [first], attachments: [], components: [] });
      surface = target.surface;
    }
  } catch (err) {
    // No picture: show the result at once.
    console.error('Could not start the plinko animation:', err);
    if (target.kind === 'new') return ctx.reply({ embeds: [embed], components });
    await target.surface.edit({ embeds: [embed], files: [], attachments: [], components });
    return null;
  }

  await playFrames(surface, plan, embed, spinning, {
    components,
    onEditFailed: async (files) => {
      // The message can't be edited any more. A new message takes the result, with the buttons when it is a new reply.
      if (target.kind === 'new') sent = await ctx.reply({ embeds: [embed], files, components });
      else {
        await target.followUp(embed);
        sent = null;
      }
    },
  });
  return target.kind === 'new' ? sent : null;
}

/**
 * Listens to the buttons under a finished game. Only the member who played can use them. Each
 * press places a new bet and plays it on the same message: the buttons go away while the ball
 * falls and come back under the result. They stop working after PLINKO_BUTTONS.idleMs of not
 * being used, and are taken off then.
 */
async function watchButtons(ctx: CommandContext, sent: SentReply, firstBet: number): Promise<void> {
  const message = await sent.fetchMessage();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: PLINKO_BUTTONS.idleMs });
  let bet = firstBet;
  let running: Promise<void> = Promise.resolve();
  let busy = false;

  collector.on('collect', (interaction) => {
    void (async () => {
      if (interaction.user.id !== ctx.user.id) {
        await interaction.reply({ content: TEXT.plinko.notYours, flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      // Acknowledge at once: a game takes longer than the three seconds Discord allows.
      await interaction.deferUpdate().catch(() => {});
      if (busy) return;
      const wanted = betForButton(PLINKO_BET_IDS, interaction.customId, bet);
      if (wanted === null) return;

      busy = true;
      running = (async () => {
        try {
          const result = await playPlinko(ctx.guildId, ctx.user.id, wanted);
          if (!result.ok) {
            await interaction.followUp({ content: refusalText(ctx.prefix, wanted, result), flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
          }
          bet = result.bet;
          await showGame(
            {
              kind: 'edit',
              ctx,
              surface: { edit: async (options) => void (await interaction.editReply(options)) },
              followUp: async (embed) => void (await interaction.followUp({ embeds: [embed] })),
            },
            result,
          );
        } catch (err) {
          console.error('A plinko button failed:', err);
        } finally {
          busy = false;
        }
      })();
      await running;
    })();
  });

  collector.on('end', () => {
    void (async () => {
      await running;
      await message.edit({ components: [] }).catch(() => {});
    })();
  });
}

export const plinko: Command = {
  name: 'plinko',
  description: `Bet ${CURRENCY_NAME} and drop a ball down the board. What you win depends on the slot it lands in. Buttons let you play again, double or halve the bet.`,
  usage: 'plinko <bet | all>',
  slashUsage: 'plinko <bet>',

  async execute(ctx) {
    const parsed = parseBetArg(ctx.args);
    if (!parsed.ok) {
      await ctx.reply(parsed.error === 'usage' ? TEXT.plinko.usage(ctx.prefix) : TEXT.plinko.badBet(ctx.prefix));
      return;
    }

    const bet = await resolveBet(ctx.guildId, ctx.user.id, parsed.bet, CONFIG.plinko);

    const result = await playPlinko(ctx.guildId, ctx.user.id, bet);
    if (!result.ok) {
      await ctx.reply(refusalText(ctx.prefix, bet, result));
      return;
    }

    const sent = await showGame({ kind: 'new', ctx }, result);
    if (sent) {
      try {
        await watchButtons(ctx, sent, result.bet);
      } catch (err) {
        console.error('Could not listen to the plinko buttons:', err);
      }
    }
  },
};
