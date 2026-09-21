import {
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { MAX_GIVE_AMOUNT, SLASH_EXCLUDED, SLOT_LABELS } from '../constants.js';
import { ITEMS, ITEMS_BY_ID } from '../data/items.js';
import { GAME_EVENTS } from '../events/registry.js';
import { itemChoices, nameChoices, type Choice } from '../lib/autocomplete.js';
import { starString } from '../lib/format.js';
import { SPECS } from '../lib/settings-spec.js';
import { getInventory } from '../services/economy.js';
import { SLOTS, STARS, type ItemDef } from '../types.js';
import type { Command } from './types.js';

/*
 * The slash version of each command. A slash command doesn't re-implement anything: its options
 * are turned into the same words a member would have typed after the prefix (`toArgs`), and the
 * command's own code runs on them. So `/sell all item:Wheelchair` runs exactly like
 * `k!sell all Wheelchair`. To add a slash command, add its entry here under the command's name.
 */

export interface SlashSpec {
  /** Used instead of the command's description, which Discord cuts off at 100 characters. */
  description?: string;
  /** Adds the command's options or subcommands. */
  build(builder: SlashCommandBuilder): void;
  /** The chosen options, as the words a prefix command reads. */
  toArgs(interaction: ChatInputCommandInteraction): string[];
  /** Fills the autocomplete list of the option being typed, if it has one. */
  autocomplete?(interaction: AutocompleteInteraction): Promise<Choice[]>;
}

/** The longest text Discord accepts for a command or option description. */
export const MAX_SLASH_DESCRIPTION = 100;

const mention = (id: string) => `<@${id}>`;

/** Every item in the catalog, filtered by what has been typed. */
const anyItem = async (interaction: AutocompleteInteraction): Promise<Choice[]> =>
  itemChoices(interaction.options.getFocused(), ITEMS);

/** Only the items the member owns (for equipping and selling). */
const ownedItem = async (interaction: AutocompleteInteraction): Promise<Choice[]> => {
  if (!interaction.guildId) return [];
  const entries = await getInventory(interaction.guildId, interaction.user.id);
  const owned = entries.map((entry) => ITEMS_BY_ID.get(entry.itemId)).filter((item): item is ItemDef => item !== undefined);
  return itemChoices(interaction.options.getFocused(), owned);
};

/** A user option that is left out to mean "me". */
const userArgs = (interaction: ChatInputCommandInteraction): string[] => {
  const user = interaction.options.getUser('user');
  return user ? [mention(user.id)] : [];
};

export const SLASH: Readonly<Record<string, SlashSpec>> = {
  balance: {
    build: (b) => void b.addUserOption((o) => o.setName('user').setDescription('Whose balance to see (you, if left out)')),
    toArgs: userArgs,
  },

  blackjack: {
    description: 'Play blackjack against the dealer, alone or at a party table of up to 5 players.',
    build: (b) =>
      void b
        .addSubcommand((s) =>
          s
            .setName('play')
            .setDescription('Play alone against the dealer')
            .addStringOption((o) => o.setName('bet').setDescription('Points to bet, or "all" for the most you can').setRequired(true).setMaxLength(20)),
        )
        .addSubcommand((s) =>
          s
            .setName('party')
            .setDescription('Open a table that others can join')
            .addStringOption((o) => o.setName('bet').setDescription('Your bet, to sit down right away (others pick theirs when they join)').setMaxLength(20)),
        ),
    toArgs: (i) => {
      if (i.options.getSubcommand() === 'party') {
        const bet = i.options.getString('bet');
        return ['party', ...(bet === null ? [] : [bet])];
      }
      return [i.options.getString('bet', true)];
    },
  },

  claim: { build: () => {}, toArgs: () => [] },

  config: {
    build: (b) =>
      void b
        .addSubcommand((s) => s.setName('list').setDescription('See every setting'))
        .addSubcommand((s) =>
          s
            .setName('set')
            .setDescription('Change a setting (bot admin only)')
            .addStringOption((o) => o.setName('setting').setDescription('Which setting, like claim.min').setRequired(true).setAutocomplete(true))
            .addStringOption((o) => o.setName('value').setDescription('The new value').setRequired(true).setMaxLength(200)),
        )
        .addSubcommand((s) =>
          s
            .setName('reset')
            .setDescription('Put a setting back to its default (bot admin only)')
            .addStringOption((o) => o.setName('setting').setDescription('Which setting, like claim.min').setRequired(true).setAutocomplete(true)),
        ),
    toArgs: (i) => {
      const action = i.options.getSubcommand();
      if (action === 'set') return ['set', i.options.getString('setting', true), i.options.getString('value', true)];
      if (action === 'reset') return ['reset', i.options.getString('setting', true)];
      return ['list'];
    },
    autocomplete: async (i) =>
      nameChoices(
        i.options.getFocused(),
        SPECS.map((spec) => spec.key),
      ),
  },

  databank: {
    description: 'See every item and what it does, or just one item, or just one star tier.',
    build: (b) =>
      void b
        .addStringOption((o) =>
          o.setName('item').setDescription('An item to see in detail (the whole list, if left out)').setAutocomplete(true).setMaxLength(100),
        )
        .addIntegerOption((o) =>
          o
            .setName('stars')
            .setDescription('Only the items of one star tier')
            .addChoices(...STARS.map((stars) => ({ name: `${stars}-star (${starString(stars)})`, value: stars }))),
        ),
    // An item, if given, wins over the star tier.
    toArgs: (i) => {
      const item = i.options.getString('item');
      if (item) return [item];
      const stars = i.options.getInteger('stars');
      return stars === null ? [] : [String(stars)];
    },
    autocomplete: anyItem,
  },

  equip: {
    build: (b) =>
      void b.addStringOption((o) => o.setName('item').setDescription('The weapon or armor to wear').setRequired(true).setAutocomplete(true).setMaxLength(100)),
    toArgs: (i) => [i.options.getString('item', true)],
    autocomplete: ownedItem,
  },

  events: {
    description: 'Random events: see the channel and events, start one now, or choose the channel (bot admin only).',
    build: (b) =>
      void b
        .addSubcommand((s) => s.setName('status').setDescription('See the events channel and every event that can happen'))
        .addSubcommand((s) =>
          s
            .setName('start')
            .setDescription('Start an event now, in the events channel')
            .addStringOption((o) =>
              o
                .setName('event')
                .setDescription('Which event (a random one, if left out)')
                .addChoices(...GAME_EVENTS.map((event) => ({ name: event.label, value: event.id }))),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('channel')
            .setDescription('Choose the channel events happen in')
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setDescription('A text channel the bot can send messages and embeds in')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        )
        .addSubcommand((s) => s.setName('disable').setDescription('Turn events off in this server')),
    toArgs: (i) => {
      const action = i.options.getSubcommand();
      if (action === 'start') {
        const chosen = i.options.getString('event');
        return chosen === null ? ['start'] : ['start', chosen];
      }
      if (action === 'channel') return ['channel', `<#${i.options.getChannel('channel', true).id}>`];
      if (action === 'disable') return ['channel', 'off'];
      return ['status'];
    },
  },

  gacha: {
    build: (b) => void b.addBooleanOption((o) => o.setName('multi').setDescription('Pull several at once, for the price of that many pulls')),
    toArgs: (i) => (i.options.getBoolean('multi') ? ['multi'] : []),
  },

  gear: {
    build: (b) => void b.addUserOption((o) => o.setName('user').setDescription("Whose gear to see (yours, if left out)")),
    toArgs: userArgs,
  },

  give: {
    build: (b) =>
      void b
        .addStringOption((o) => o.setName('item').setDescription('The item to give').setRequired(true).setAutocomplete(true).setMaxLength(100))
        .addIntegerOption((o) => o.setName('amount').setDescription('How many copies (1 if left out)').setMinValue(1).setMaxValue(MAX_GIVE_AMOUNT)),
    toArgs: (i) => {
      const amount = i.options.getInteger('amount');
      return [i.options.getString('item', true), ...(amount === null ? [] : [String(amount)])];
    },
    autocomplete: anyItem,
  },

  help: { build: () => {}, toArgs: () => [] },

  inventory: {
    build: (b) => void b.addUserOption((o) => o.setName('user').setDescription("Whose items to see (yours, if left out)")),
    toArgs: userArgs,
  },

  leaderboard: { build: () => {}, toArgs: () => [] },

  plinko: {
    description: 'Bet points and drop a ball down the plinko board. The slot it lands in decides the payout.',
    build: (b) =>
      void b.addStringOption((o) =>
        o.setName('bet').setDescription('Points to bet, or "all" for the most you can').setRequired(true).setMaxLength(20),
      ),
    toArgs: (i) => [i.options.getString('bet', true)],
  },

  rob: {
    description: 'Steal points from another member. One rob per hour, and a member can be robbed once an hour.',
    build: (b) => void b.addUserOption((o) => o.setName('user').setDescription('Who to rob').setRequired(true)),
    toArgs: (i) => [mention(i.options.getUser('user', true).id)],
  },

  sell: {
    description: 'Sell items you are not wearing: one copy, some copies, all copies of an item, or a star tier.',
    build: (b) =>
      void b
        .addSubcommand((s) =>
          s
            .setName('one')
            .setDescription('Sell one copy of an item')
            .addStringOption((o) => o.setName('item').setDescription('The item to sell').setRequired(true).setAutocomplete(true).setMaxLength(100)),
        )
        .addSubcommand((s) =>
          s
            .setName('some')
            .setDescription('Sell a number of copies of an item (you are asked to confirm)')
            .addStringOption((o) => o.setName('item').setDescription('The item to sell').setRequired(true).setAutocomplete(true).setMaxLength(100))
            .addIntegerOption((o) => o.setName('amount').setDescription('How many copies').setRequired(true).setMinValue(1)),
        )
        .addSubcommand((s) =>
          s
            .setName('all')
            .setDescription('Sell every copy of an item you are not wearing')
            .addStringOption((o) => o.setName('item').setDescription('The item to sell').setRequired(true).setAutocomplete(true).setMaxLength(100)),
        )
        .addSubcommand((s) =>
          s
            .setName('stars')
            .setDescription('Sell everything of one star tier that you are not wearing')
            .addIntegerOption((o) =>
              o
                .setName('tier')
                .setDescription('The star tier')
                .setRequired(true)
                .addChoices(...STARS.map((stars) => ({ name: `${stars}-star (${starString(stars)})`, value: stars }))),
            ),
        ),
    toArgs: (i) => {
      const mode = i.options.getSubcommand();
      if (mode === 'all') return ['all', i.options.getString('item', true)];
      if (mode === 'some') return [String(i.options.getInteger('amount', true)), i.options.getString('item', true)];
      if (mode === 'stars') return ['stars', String(i.options.getInteger('tier', true))];
      return [i.options.getString('item', true)];
    },
    autocomplete: ownedItem,
  },

  unequip: {
    build: (b) =>
      void b.addStringOption((o) =>
        o
          .setName('slot')
          .setDescription('What to take off')
          .setRequired(true)
          .addChoices(...SLOTS.map((slot) => ({ name: SLOT_LABELS[slot], value: slot })), { name: 'Both', value: 'all' }),
      ),
    toArgs: (i) => [i.options.getString('slot', true)],
  },
};

/** True when the command is available as a slash command: it has an entry in `SLASH` and isn't in `SLASH_EXCLUDED`. */
export const hasSlash = (name: string): boolean => Object.hasOwn(SLASH, name) && !SLASH_EXCLUDED.includes(name);

/** The slash command for `command`, or null if it doesn't have one. Throws if Discord would refuse it. */
export function buildSlashCommand(command: Command, spec: SlashSpec | undefined = SLASH[command.name]): SlashCommandBuilder | null {
  if (!spec) return null;
  const builder = new SlashCommandBuilder()
    .setName(command.name)
    .setDescription(spec.description ?? command.description)
    // Only in servers: the economy is per server.
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
  // An admin command is hidden from everyone but server admins. The command still checks who is
  // the bot admin itself, so this only keeps it out of most members' command list.
  if (command.adminOnly) builder.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  spec.build(builder);
  return builder;
}

/** What to register with Discord: every command that has a slash version (see `hasSlash`). */
export function slashCommandData(commands: readonly Command[]): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return commands.flatMap((command) => {
    if (!hasSlash(command.name)) return [];
    const builder = buildSlashCommand(command);
    return builder ? [builder.toJSON()] : [];
  });
}
