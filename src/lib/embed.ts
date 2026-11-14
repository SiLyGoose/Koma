import { EmbedBuilder } from 'discord.js';
import { CONFIG } from '../config.js';

/** Discord rejects empty field names and values, but a zero-width space is accepted and shows as nothing. */
const BLANK = '\u200b';

/** An EmbedBuilder with the bot's own extras. Get one from createEmbed(). */
export class BotEmbed extends EmbedBuilder {
  /**
   * Adds an empty field, for spacing. It chains like any other embed method:
   *
   *   createEmbed().addFields({ name: 'A', value: '1' }).addBlankField().addFields({ name: 'B', value: '2' })
   *
   * By default it is a full-width gap between two rows. Pass `true` to make it an inline field,
   * which acts as a blank column next to other inline fields.
   */
  addBlankField(inline = false): this {
    return this.addFields({ name: BLANK, value: BLANK, inline });
  }
}

/**
 * Every embed the bot sends should start from here, so they all share CONFIG.embedColor.
 * Change the color in src/config.ts and it updates everywhere.
 */
export function createEmbed(): BotEmbed {
  return new BotEmbed().setColor(Number.parseInt(CONFIG.embedColor.slice(1), 16));
}
