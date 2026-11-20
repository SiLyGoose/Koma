import { ComponentType, type ActionRowBuilder, type ButtonBuilder, type ButtonInteraction, type Message, type MessageEditOptions, type SendableChannels } from 'discord.js';
import { replyPrivately } from '../../discord/reply.js';
import type { BotEmbed } from '../../lib/embed.js';

/*
 * What the vault games (greedy-heist.ts, split-or-steal.ts) share: a live message that is edited
 * at a safe pace, a join window, and showing the result. Neither game saves itself to the
 * database: each lasts a couple of minutes and only moves points when it ends, so a restart in the
 * middle just loses that one game, never anyone's points.
 */

/**
 * Keeps one message showing the latest state without editing it faster than `refreshMs` (Discord
 * limits message edits). `show` replaces what should be on screen; it goes out on the next tick.
 * `stop` stops the ticking and waits for an edit that is still going, so a result edited in after
 * it can't be overwritten by an older state.
 */
export class LiveMessage {
  private latest: MessageEditOptions | null = null;
  private inFlight: Promise<void> | null = null;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly message: Message,
    refreshMs: number,
  ) {
    this.timer = setInterval(() => this.flush(), refreshMs);
  }

  show(options: MessageEditOptions): void {
    this.latest = options;
  }

  private flush(): void {
    if (this.inFlight || !this.latest) return;
    const options = this.latest;
    this.latest = null;
    this.inFlight = this.message
      .edit(options)
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        this.inFlight = null;
      });
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.latest = null;
    await this.inFlight;
  }
}

export interface JoinWindow {
  message: Message;
  endsAtMs: number;
  joinId: string;
  refreshMs: number;
  /** What the message shows with this many joined. */
  render: (joined: number) => { embeds: BotEmbed[]; components: ActionRowBuilder<ButtonBuilder>[] };
  joinedText: string;
  alreadyText: string;
  /**
   * For a game the site can join too: who has joined so far (shared with the site's joins; a new set when left out),
   * their names as the server has them (filled in for those who join here), and `listen`, given a function that shows
   * the message again (for a join on the site) and called after each join here.
   */
  joiners?: Set<string>;
  names?: Map<string, string>;
  listen?: (refresh: () => void) => void;
  joined?: (userId: string) => void;
}

/** Who pressed a button, as the server names them. */
export const pressedBy = (interaction: ButtonInteraction): string =>
  interaction.member && 'displayName' in interaction.member ? interaction.member.displayName : interaction.user.displayName;

/**
 * Listens for the Join button until the window closes. Returns who joined, in the order they
 * joined, each once (a member is added the moment their press arrives, so pressing many times
 * counts once).
 */
export async function collectJoiners(window: JoinWindow): Promise<string[]> {
  const joiners = window.joiners ?? new Set<string>();
  const remaining = window.endsAtMs - Date.now();
  if (remaining <= 0) return [...joiners];

  const live = new LiveMessage(window.message, window.refreshMs);
  window.listen?.(() => live.show(window.render(joiners.size)));
  const collector = window.message.createMessageComponentCollector({ componentType: ComponentType.Button, time: remaining });
  collector.on('collect', (interaction) => {
    if (interaction.customId !== window.joinId) return;
    const already = joiners.has(interaction.user.id);
    joiners.add(interaction.user.id);
    if (!already) {
      window.names?.set(interaction.user.id, pressedBy(interaction));
      live.show(window.render(joiners.size));
      window.joined?.(interaction.user.id);
    }
    void replyPrivately(interaction, already ? window.alreadyText : window.joinedText);
  });

  await new Promise<void>((resolve) => collector.once('end', () => resolve()));
  await live.stop();
  return [...joiners];
}

/** Shows a game's last state on its own message, or as a new message if that can't be edited (it was deleted). */
export async function showResult(message: Message, channel: SendableChannels, embed: BotEmbed, what: string): Promise<void> {
  try {
    await message.edit({ embeds: [embed], components: [], attachments: [], files: [] });
  } catch {
    await channel.send({ embeds: [embed] }).catch((err) => console.error(`Could not show the result of ${what}:`, err));
  }
}

/** Lines for an embed field: the first `max`, then "...and N more". `nobody` when the list is empty. */
export function limitedLines(lines: readonly string[], max: number, more: (count: number) => string, nobody: string): string {
  if (lines.length === 0) return nobody;
  const shown = lines.slice(0, max);
  if (lines.length > max) shown.push(more(lines.length - max));
  return shown.join('\n');
}
