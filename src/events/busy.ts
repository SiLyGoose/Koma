/*
 * Which servers have an event going on right now. An event is never started while another one
 * is still going in the same server, whoever asks (the scheduler, `events start`, or an event
 * picking itself up again after a restart).
 */

const running = new Set<string>();

export const isEventRunning = (guildId: string): boolean => running.has(guildId);

/**
 * Marks the server busy and returns the function that frees it, or null if it already is busy.
 * The check and the marking happen in the same step, before anything is awaited, so two callers
 * at the same moment cannot both get in.
 */
export function claimGuild(guildId: string): (() => void) | null {
  if (running.has(guildId)) return null;
  running.add(guildId);
  return () => void running.delete(guildId);
}
