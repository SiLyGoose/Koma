/*
 * The game going on in each server, and how the last one ended, for an event played both by its Discord message and on
 * the site (Hot Potato's and Laser Grid's: web/games/potato/, web/games/laser/). Both play through the one game, so a
 * press on either is the same press. Like the games themselves it is only in memory: a restart forgets it. (Codedle
 * keeps its own, codedle-games.ts, from before this.)
 */
export class SiteGames<Game, End> {
  private readonly going = new Map<string, Game>();
  private readonly ended = new Map<string, End>();
  private readonly listeners = new Set<(guildId: string) => void>();

  constructor(private readonly what: string) {}

  /** The game going on in `guildId` (null: none). */
  in(guildId: string): Game | null {
    return this.going.get(guildId) ?? null;
  }

  /** How the last game in `guildId` ended (null: none has, since the bot started). */
  last(guildId: string): End | null {
    return this.ended.get(guildId) ?? null;
  }

  /** Calls `listener` with the server whenever its game changes. Returns a function that stops it. */
  onChange(listener: (guildId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Tells everyone listening that `guildId`'s game has changed. */
  changed(guildId: string): void {
    for (const listener of this.listeners) {
      try {
        listener(guildId);
      } catch (err) {
        console.error(`A ${this.what} listener failed:`, err);
      }
    }
  }

  /** `game` opens in `guildId`. */
  opened(guildId: string, game: Game): void {
    this.going.set(guildId, game);
    this.changed(guildId);
  }

  /** `guildId`'s game is over: how it ended (null: it is just gone). */
  closed(guildId: string, end: End | null): void {
    this.going.delete(guildId);
    if (end) this.ended.set(guildId, end);
    this.changed(guildId);
  }
}
