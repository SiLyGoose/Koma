import type { Client, Guild, SendableChannels } from 'discord.js';

/** What an event is given to run in. */
export interface EventContext {
  guild: Guild;
  /** The server's events channel, checked to be one the bot can send messages and embeds in. */
  channel: SendableChannels;
}

/**
 * One kind of random event. To add a new one, write a GameEvent in its own file in src/events
 * and add it to GAME_EVENTS in registry.ts: the scheduler, the `events` command and the settings
 * list pick it up from there.
 */
export interface GameEvent {
  /** Short lower-case name, used to start it by hand: `events start crate`. Letters, numbers and dashes. */
  id: string;
  /** Its name in lists. */
  label: string;
  /** One line about what happens, shown in the event list. */
  description: string;
  /** How likely it is to be picked at random, compared with the other events' weights. */
  weight: number;
  /**
   * Runs the whole event: posts it in the channel, waits for members to join in, hands out
   * whatever is won and shows the result. It resolves when the event is over. It should never
   * leave the server stuck: if it throws, the runner logs it and the server is free again.
   */
  run(ctx: EventContext): Promise<void>;
  /**
   * Optional. Called once when the bot is ready, so an event that was still open when the bot
   * last stopped can be picked up again (or settled). It resolves once each open event has been
   * taken over, not when they end. Use `claimGuild` (busy.ts) so the server counts as busy meanwhile.
   */
  resume?(client: Client): Promise<void>;
}
