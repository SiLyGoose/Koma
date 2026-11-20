/*
 * The bot's status in the member list (src/discord/status.ts). `uptime` is how long it has been up,
 * like "3d 4h" or "12m". Discord cuts a status off at 128 characters.
 */
export const statusText = {
  /** For the first minute after a start, before there's an uptime worth showing. */
  justWoke: 'Brand new bed, just woke up.',
  /** Taken in turn, a new one every STATUS.rotateMs. */
  lines: [
    (uptime: string) => `${uptime} without touching grass`,
    (uptime: string) => `Auramaxxing for ${uptime}`,
  ],
};
