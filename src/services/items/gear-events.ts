/*
 * Word that a member's gear changed (equipped, taken off, a loadout switched, a worn copy refined or
 * forged), for whatever keeps their gear while they play: an open Pinecraft page picks the new gear
 * up at once instead of on its next look-up (web/games/pinecraft/server.ts).
 */

type Listener = (guildId: string, userId: string) => void;

const listeners = new Set<Listener>();

/** Calls `listener` whenever a member's gear changes. Returns a function that stops it. */
export function onGearChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A member's gear changed. A listener that fails never stops the change itself. */
export function gearChanged(guildId: string, userId: string): void {
  for (const listener of listeners) {
    try {
      listener(guildId, userId);
    } catch (err) {
      console.error('A gear change listener failed:', err);
    }
  }
}
