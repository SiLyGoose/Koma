import { RAID_CLASS_IDS, TEXT, type RaidClassId } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { classTraits } from '../lib/game/raid-classes.js';
import { getRaidClass, setRaidClass } from '../services/raid-class.js';
import type { Command } from '../discord/types.js';

/** The words that clear a class (`class none`). */
const NONE_WORDS = ['none', 'clear', 'reset', 'off'];

/**
 * What `class <word>` asks for: a raid class (by its id or its name, whatever the case), `none` to
 * clear it, or undefined when the word is neither.
 */
export function classPick(word: string): RaidClassId | 'none' | undefined {
  const wanted = word.trim().toLowerCase();
  if (NONE_WORDS.includes(wanted)) return 'none';
  return RAID_CLASS_IDS.find((id) => id === wanted || TEXT.raid.classes[id].name.toLowerCase() === wanted);
}

/** A class's card: its badge and name, `note` over what it does in a fight. */
function classCard(id: RaidClassId, note: string) {
  return createEmbed()
    .setTitle(TEXT.raid.classLabel(id))
    .setDescription([note, '', ...classTraits(id)].join('\n'));
}

const classList = (): string => TEXT.raid.andList(RAID_CLASS_IDS.map((id) => `${TEXT.raid.classes[id].emoji} **${TEXT.raid.classes[id].name}**`));

/**
 * Shows or picks their raid class (services/raid-class.ts): the same one the site's gear page picks by
 * its class ribbon. It counts from their next raid's fight.
 */
export const raidClass: Command = {
  name: 'class',
  category: 'adventure',
  description: 'See your raid class, or pick one: it changes what your actions do in a raid.',
  usage: 'class [knight | warrior | priest | mechanic | wizard | assassin | archer | none]',
  slashUsage: 'class [class]',
  details: 'A class counts from the next raid you fight, so changing it during a raid does nothing until the one after. `databank classes` shows what each does and its class items.',

  async execute(ctx) {
    const p = ctx.prefix;
    const t = TEXT.raid.classCommand;
    const word = ctx.args.join(' ').trim();

    // By itself: the class they have, and what it does (or how to pick one).
    if (word === '') {
      const current = await getRaidClass(ctx.guildId, ctx.user.id);
      if (current === null) await ctx.reply(t.none(p, classList()));
      else await ctx.reply({ embeds: [classCard(current, t.yours(p))] });
      return;
    }

    const pick = classPick(word);
    if (pick === undefined) {
      await ctx.reply(t.noSuchClass(p, word, classList()));
      return;
    }
    if (pick === 'none') {
      await setRaidClass(ctx.guildId, ctx.user.id, null);
      await ctx.reply(t.cleared(p));
      return;
    }
    await setRaidClass(ctx.guildId, ctx.user.id, pick);
    await ctx.reply({ embeds: [classCard(pick, t.picked(TEXT.raid.classes[pick].name))] });
  },
};
