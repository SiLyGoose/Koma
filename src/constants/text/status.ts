/*
 * The bot's status in the member list (src/discord/status.ts). `uptime` is how long it has been up,
 * like "3d 4h" or "12m". Discord cuts a status off at 128 characters.
 */
export const statusText = {
  /** For the first minute after a start, before there's an uptime worth showing. */
  justWoke: 'Brand new bed, just woke up.',
  /** Taken in turn, a new one every STATUS.rotateMs. */
  lines: [
    (uptime: string) => `Alive for ${uptime}. No crashes. Yet.`,
    (uptime: string) => `Awake for ${uptime}. Send coffee.`,
    (uptime: string) => `${uptime} without touching grass`,
    (uptime: string) => `Uptime: ${uptime}. Personal best?`,
    (uptime: string) => `Haven't blinked in ${uptime}`,
    (uptime: string) => `Running on vibes for ${uptime}`,
  ],
};
