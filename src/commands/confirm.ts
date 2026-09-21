import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type Message,
} from 'discord.js';
import type { BotEmbed } from '../lib/embed.js';
import { reply } from './reply.js';

/** How long a member has to answer a confirmation, in milliseconds. */
export const CONFIRM_TIMEOUT_MS = 30_000;

export const CONFIRM_ID = 'confirm';
export const CANCEL_ID = 'cancel';

/** How a confirmation ended, and how to replace the question with the outcome. */
export interface ConfirmOutcome {
  decision: 'confirm' | 'cancel' | 'timeout';
  /** Replaces the question (and removes its buttons) with `embeds`. */
  finish(embeds: BotEmbed[]): Promise<void>;
}

/**
 * Shows `embed` with a confirm and a cancel button and waits (up to `timeoutMs`) for the member
 * who asked to press one. Anyone else who presses a button is told it isn't theirs. The buttons
 * only work for this one message, and the answer is acknowledged straight away so a slow follow-up
 * (like a sale) never makes Discord say the button failed.
 */
export async function askToConfirm(
  message: Message,
  embed: BotEmbed,
  userId: string,
  labels: { confirm: string; cancel: string; notYours: string },
  timeoutMs = CONFIRM_TIMEOUT_MS,
): Promise<ConfirmOutcome> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CONFIRM_ID).setLabel(labels.confirm).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CANCEL_ID).setLabel(labels.cancel).setStyle(ButtonStyle.Secondary),
  );
  const sent = await reply(message, { embeds: [embed], components: [row] });

  return new Promise<ConfirmOutcome>((resolve) => {
    let decided = false;
    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: timeoutMs });

    collector.on('collect', (interaction) => {
      void (async () => {
        if (interaction.user.id !== userId) {
          await interaction.reply({ content: labels.notYours, flags: MessageFlags.Ephemeral }).catch(() => {});
          return;
        }
        if (decided) return;
        decided = true;
        // Acknowledge now; the real answer replaces the message once we have it.
        await interaction.deferUpdate().catch(() => {});
        collector.stop('answered');
        resolve({
          decision: interaction.customId === CONFIRM_ID ? 'confirm' : 'cancel',
          finish: async (embeds) => {
            await interaction.editReply({ embeds, components: [] });
          },
        });
      })();
    });

    collector.on('end', () => {
      if (decided) return;
      decided = true;
      resolve({
        decision: 'timeout',
        finish: async (embeds) => {
          await sent.edit({ embeds, components: [] });
        },
      });
    });
  });
}
