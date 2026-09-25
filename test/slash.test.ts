import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AutocompleteInteraction, ChatInputCommandInteraction, Message } from 'discord.js';
import { interactionContext, isEphemeral, messageContext } from '../src/discord/context.js';
import { handleAutocomplete, handleSlash } from '../src/discord/dispatch.js';
import { commands } from '../src/commands/index.js';
import { MAX_SLASH_DESCRIPTION, SLASH, commandPrefix, hasSlash, slashCommandData } from '../src/discord/slash.js';
import { MAX_GIVE_AMOUNT, SLASH_EXCLUDED, TEXT, validateConstants } from '../src/constants/index.js';
import { getPrefix } from '../src/services/settings.js';
import { ITEMS } from '../src/data/items.js';
import { itemChoices, nameChoices } from '../src/lib/autocomplete.js';
import { parseGiveArgs } from '../src/lib/game/give.js';
import { GAME_EVENTS } from '../src/events/registry.js';
import { parseUserArg } from '../src/lib/parse.js';
import { parseBlackjackArgs } from '../src/lib/game/blackjack.js';
import { parseBetArg } from '../src/lib/game/bet.js';
import { parseSellArgs } from '../src/lib/game/sell.js';
import { createEmbed } from '../src/lib/embed.js';

// ---------------------------------------------------------------------------
// What is registered with Discord
// ---------------------------------------------------------------------------

/** The commands that are registered as slash commands: all of them except the ones in SLASH_EXCLUDED. */
const slashed = commands.filter((command) => !SLASH_EXCLUDED.includes(command.name));

test('slash: every command has a slash version unless it is excluded, and there are none for commands that do not exist', () => {
  const names = commands.map((command) => command.name).sort();
  // An excluded command keeps its definition, so taking it off the list brings it back.
  assert.deepEqual(Object.keys(SLASH).sort(), names);
  for (const command of commands) assert.equal(hasSlash(command.name), !SLASH_EXCLUDED.includes(command.name), command.name);
});

test('commandPrefix: a command with a slash version is named with ctx.prefix, "/" in a slash context', () => {
  const f = fakeInteraction();
  const { ctx, dispose } = interactionContext(f.interaction, guild, []);
  assert.equal(ctx.prefix, '/');
  assert.ok(hasSlash('balance') && hasSlash('claim'));
  assert.equal(commandPrefix(ctx, 'balance'), '/');
  assert.equal(commandPrefix(ctx, 'claim'), '/');
  dispose();
});

test('commandPrefix: an excluded command (like rob) is always named with the real message prefix, never "/"', () => {
  const f = fakeInteraction();
  const { ctx, dispose } = interactionContext(f.interaction, guild, []);
  assert.equal(ctx.prefix, '/', 'balance itself was run as a slash command');
  assert.equal(hasSlash('rob'), false);
  assert.equal(commandPrefix(ctx, 'rob'), getPrefix());
  assert.notEqual(commandPrefix(ctx, 'rob'), '/', 'rob has no /rob slash command to point at');
  dispose();
});

test('commandPrefix: in a message context it is just the real prefix either way', () => {
  const f = fakeMessage();
  const ctx = messageContext(f.message, [], 'k!');
  assert.equal(commandPrefix(ctx, 'balance'), 'k!');
  assert.equal(commandPrefix(ctx, 'rob'), 'k!');
});

test('slash: the excluded commands are real commands, are not registered, and are kept out of the list', () => {
  for (const name of SLASH_EXCLUDED) {
    assert.ok(commands.some((command) => command.name === name), `${name} is not a command`);
    assert.equal(hasSlash(name), false);
  }
  assert.equal(new Set(SLASH_EXCLUDED).size, SLASH_EXCLUDED.length, 'no name twice');
  const registered = slashCommandData(commands).map((d) => d.name);
  for (const name of SLASH_EXCLUDED) assert.ok(!registered.includes(name), `/${name} is registered`);
  assert.deepEqual(registered.sort(), slashed.map((command) => command.name).sort());
  // Nothing is excluded that the startup check would refuse.
  validateConstants();
});

test('slash: the definitions follow Discord rules', () => {
  const data = slashCommandData(commands);
  assert.equal(data.length, slashed.length);
  assert.ok(data.length <= 100, 'Discord allows 100 slash commands');
  assert.equal(new Set(data.map((d) => d.name)).size, data.length, 'no duplicate names');

  const NAME = /^[-_\p{L}\p{N}]{1,32}$/u;
  const check = (what: string, item: { name: string; description?: string; options?: unknown[] }) => {
    assert.match(item.name, NAME, `${what}: name`);
    assert.equal(item.name, item.name.toLowerCase(), `${what}: lowercase`);
    if (item.description !== undefined) {
      assert.ok(item.description.length >= 1 && item.description.length <= MAX_SLASH_DESCRIPTION, `${what}: description is ${item.description.length} characters`);
    }
    assert.ok((item.options?.length ?? 0) <= 25, `${what}: at most 25 options`);
  };
  for (const command of data) {
    check(`/${command.name}`, command);
    const walk = (options: any[] | undefined, path: string) => {
      let sawOptional = false;
      for (const option of options ?? []) {
        check(`${path} ${option.name}`, option);
        if (option.type === 1 /* subcommand */) walk(option.options, `${path} ${option.name}`);
        else {
          // Discord wants the required options first.
          if (!option.required) sawOptional = true;
          else assert.equal(sawOptional, false, `${path}: required option "${option.name}" comes after an optional one`);
          for (const choice of option.choices ?? []) {
            assert.ok(String(choice.name).length <= 100, `${path}: choice name`);
          }
        }
      }
    };
    walk(command.options, `/${command.name}`);
    // The economy is per server, so no command works in DMs.
    assert.deepEqual((command as any).contexts, [0], `/${command.name} is server only`);
  }
});

test('slash: only the admin command is hidden from ordinary members', () => {
  const data = slashCommandData(commands);
  for (const command of slashed) {
    const json = data.find((d) => d.name === command.name) as any;
    if (command.adminOnly) assert.notEqual(json.default_member_permissions ?? null, null, `/${command.name} is hidden`);
    else assert.equal(json.default_member_permissions ?? null, null, `/${command.name} is visible`);
  }
});

test('slash: names match the prefix commands, and slashUsage starts with the command name', () => {
  for (const command of commands) {
    assert.ok((command.slashUsage ?? command.name).startsWith(command.name), command.name);
  }
});

// ---------------------------------------------------------------------------
// Options become the words a prefix command reads
// ---------------------------------------------------------------------------

/** A stand-in for the chosen options of a slash command. */
function fakeOptions(values: { sub?: string; strings?: Record<string, string>; ints?: Record<string, number>; bools?: Record<string, boolean>; users?: Record<string, string>; channels?: Record<string, string> }) {
  return {
    options: {
      getSubcommand: () => values.sub as string,
      getString: (name: string, required?: boolean) => {
        const value = values.strings?.[name] ?? null;
        if (value === null && required) throw new Error(`missing ${name}`);
        return value;
      },
      getInteger: (name: string, required?: boolean) => {
        const value = values.ints?.[name] ?? null;
        if (value === null && required) throw new Error(`missing ${name}`);
        return value;
      },
      getBoolean: (name: string) => values.bools?.[name] ?? null,
      getUser: (name: string, required?: boolean) => {
        const id = values.users?.[name];
        if (id === undefined) {
          if (required) throw new Error(`missing ${name}`);
          return null;
        }
        return { id };
      },
      getChannel: (name: string, required?: boolean) => {
        const id = values.channels?.[name];
        if (id === undefined) {
          if (required) throw new Error(`missing ${name}`);
          return null;
        }
        return { id };
      },
    },
  } as unknown as ChatInputCommandInteraction;
}
const args = (name: string, values: Parameters<typeof fakeOptions>[0]) => (SLASH[name] as any).toArgs(fakeOptions(values)) as string[];
const ID = '123456789012345678';

test('slash options: commands with no options have no words', () => {
  for (const name of ['claim', 'help', 'leaderboard']) assert.deepEqual(args(name, {}), []);
});

test('slash options: a user option becomes a mention that the prefix commands understand', () => {
  for (const name of ['balance', 'gear', 'inventory']) {
    assert.deepEqual(args(name, {}), [], `${name} without a user`);
    const words = args(name, { users: { user: ID } });
    assert.equal(words.length, 1);
    assert.equal(parseUserArg(words[0]), ID);
  }
  assert.equal(parseUserArg(args('rob', { users: { user: ID } })[0]), ID);
});

test('slash options: gear stats', () => {
  assert.deepEqual(args('gear', { bools: { stats: true } }), ['stats']);
  assert.deepEqual(args('gear', { bools: { stats: false } }), []);
  const words = args('gear', { bools: { stats: true }, users: { user: ID } });
  assert.equal(words[0], 'stats');
  assert.equal(parseUserArg(words[1]), ID);
});

test('slash options: gacha multi', () => {
  assert.deepEqual(args('gacha', {}), []);
  assert.deepEqual(args('gacha', { bools: { multi: false } }), []);
  assert.deepEqual(args('gacha', { bools: { multi: true } }), ['multi']);
});

test('slash options: databank with and without an item', () => {
  assert.deepEqual(args('databank', {}), []);
  assert.deepEqual(args('databank', { strings: { item: 'wheelchair' } }), ['wheelchair']);
  // A star tier becomes the number a member would type, which the databank reads as a tier; an item wins if both are given.
  assert.deepEqual(args('databank', { ints: { stars: 3 } }), ['3']);
  assert.deepEqual(args('databank', { strings: { item: 'wheelchair' }, ints: { stars: 3 } }), ['wheelchair']);
  assert.deepEqual(args('equip', { strings: { item: 'Some Item' } }), ['Some Item']);
});

test('slash options: each sell mode reads back as the same request the prefix command would make', () => {
  const one = parseSellArgs(args('sell', { sub: 'one', strings: { item: 'Some Item' } }));
  assert.deepEqual(one, { ok: true, request: { kind: 'one', query: 'Some Item' } });
  const some = parseSellArgs(args('sell', { sub: 'some', strings: { item: 'Some Item' }, ints: { amount: 3 } }));
  assert.deepEqual(some, { ok: true, request: { kind: 'some', amount: 3, query: 'Some Item' } });
  const all = parseSellArgs(args('sell', { sub: 'all', strings: { item: 'Some Item' } }));
  assert.deepEqual(all, { ok: true, request: { kind: 'allOf', query: 'Some Item' } });
  const stars = parseSellArgs(args('sell', { sub: 'stars', ints: { tier: 3 } }));
  assert.deepEqual(stars, { ok: true, request: { kind: 'stars', stars: 3 } });
});

test('slash options: the plinko bet reads back as the same bet the prefix command would read', () => {
  assert.deepEqual(parseBetArg(args('plinko', { strings: { bet: '100' } })), { ok: true, bet: 100 });
  assert.deepEqual(parseBetArg(args('plinko', { strings: { bet: 'all' } })), { ok: true, bet: 'all' });
  assert.deepEqual(args('plinko', { strings: { bet: '1,000' } }), ['1,000']);
  assert.throws(() => args('plinko', {}), /missing bet/, 'the bet is required');
});

test('slash options: blackjack play and party read back as the words the prefix command reads', () => {
  assert.deepEqual(parseBlackjackArgs(args('blackjack', { sub: 'play', strings: { bet: '100' } })), { ok: true, kind: 'solo', bet: 100 });
  assert.deepEqual(parseBlackjackArgs(args('blackjack', { sub: 'play', strings: { bet: 'all' } })), { ok: true, kind: 'solo', bet: 'all' });
  assert.throws(() => args('blackjack', { sub: 'play' }), /missing bet/, 'playing alone needs a bet');
  assert.deepEqual(parseBlackjackArgs(args('blackjack', { sub: 'party' })), { ok: true, kind: 'party', bet: null });
  assert.deepEqual(parseBlackjackArgs(args('blackjack', { sub: 'party', strings: { bet: '250' } })), { ok: true, kind: 'party', bet: 250 });
});

test('slash options: unequip, give and config', () => {
  assert.deepEqual(args('unequip', { strings: { slot: 'armor' } }), ['armor']);
  assert.deepEqual(args('unequip', { strings: { slot: 'all' } }), ['all']);

  assert.deepEqual(parseGiveArgs(args('give', { strings: { item: 'C4' } }), MAX_GIVE_AMOUNT), { ok: true, itemId: 'c4', count: 1 });
  assert.deepEqual(parseGiveArgs(args('give', { strings: { item: 'c4' }, ints: { amount: 5 } }), MAX_GIVE_AMOUNT), { ok: true, itemId: 'c4', count: 5 });

  assert.deepEqual(args('config', { sub: 'list' }), ['list']);
  // The value keeps its spaces as one word; the command joins the words after the setting name.
  assert.deepEqual(args('config', { sub: 'set', strings: { setting: 'claim.min', value: '10' } }), ['set', 'claim.min', '10']);
  assert.deepEqual(args('config', { sub: 'reset', strings: { setting: 'claim.min' } }), ['reset', 'claim.min']);
  // 'channel' isn't a real setting key, but it reads back the same way every other one does --
  // it's the config command itself (commands/config.ts) that treats it specially, not this option.
  assert.deepEqual(args('config', { sub: 'set', strings: { setting: 'channel', value: '<#123456789012345678>' } }), ['set', 'channel', '<#123456789012345678>']);
  assert.deepEqual(args('config', { sub: 'reset', strings: { setting: 'channel' } }), ['reset', 'channel']);
});

test('slash options: event subcommands read back as the words the prefix command reads', () => {
  assert.deepEqual(args('events', { sub: 'status' }), ['status']);
  assert.deepEqual(args('events', { sub: 'start' }), ['start']);
  assert.deepEqual(args('events', { sub: 'start', strings: { event: 'crate' } }), ['start', 'crate']);
});

test('slash definition: /events has just its two subcommands (choosing the channel moved into /config), and a choice for every event', () => {
  const json = slashCommandData(commands).find((d) => d.name === 'events') as any;
  assert.ok(json, '/events is registered');
  assert.deepEqual(json.options.map((o: any) => o.name), ['status', 'start']);
  const start = json.options.find((o: any) => o.name === 'start');
  assert.deepEqual(start.options[0].choices.map((c: any) => c.value), GAME_EVENTS.map((e) => e.id));
  assert.notEqual(start.options[0].required ?? false, true, 'a random event is started when none is chosen');
});

test('slash definition: /blackjack has play and party, and only playing alone needs a bet', () => {
  const json = slashCommandData(commands).find((d) => d.name === 'blackjack') as any;
  assert.ok(json, '/blackjack is registered');
  assert.deepEqual(json.options.map((o: any) => o.name), ['play', 'party']);
  const [play, party] = json.options;
  assert.equal(play.options[0].name, 'bet');
  assert.equal(play.options[0].required, true);
  assert.equal(party.options[0].name, 'bet');
  assert.notEqual(party.options[0].required ?? false, true, 'a host can open a table without sitting down');
});

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

test('autocomplete: items are matched by name or id, ignoring case and punctuation, best matches first', () => {
  const [first] = ITEMS;
  assert.ok(first);
  const byName = itemChoices(first.name.toUpperCase(), ITEMS);
  assert.equal(byName[0]?.value, first.id);
  assert.ok(byName[0]?.name.startsWith(first.name));
  assert.deepEqual(itemChoices(first.id, ITEMS)[0]?.value, first.id);
  assert.equal(itemChoices('zzzz no such item', ITEMS).length, 0);
});

test('autocomplete: nothing typed lists the items, capped, each part within 100 characters', () => {
  const choices = itemChoices('', ITEMS);
  assert.equal(choices.length, Math.min(ITEMS.length, 25));
  assert.equal(itemChoices('', ITEMS, 3).length, Math.min(ITEMS.length, 3));
  for (const choice of choices) assert.ok(choice.name.length <= 100 && choice.value.length <= 100);
  const long = [{ ...(ITEMS[0] as (typeof ITEMS)[number]), id: 'x'.repeat(150), name: 'y'.repeat(150) }];
  const [cut] = itemChoices('', long);
  assert.ok((cut?.name.length ?? 0) <= 100 && (cut?.value.length ?? 0) <= 100);
});

test('autocomplete: a word start ranks above a match in the middle of a word, and names can be searched too', () => {
  const names = ['gacha.pity.start', 'claim.min', 'claim.max', 'rob.claimTax'];
  assert.deepEqual(nameChoices('claim', names).map((c) => c.value), ['claim.min', 'claim.max', 'rob.claimTax']);
  assert.deepEqual(nameChoices('', names, 2).map((c) => c.value), ['gacha.pity.start', 'claim.min']);
  assert.equal(nameChoices('nothing', names).length, 0);
});

/** A stand-in for an autocomplete request. */
function fakeAutocomplete(commandName: string, focused: string, options: { respondFails?: boolean } = {}) {
  const responses: unknown[] = [];
  const interaction = {
    commandName,
    guildId: 'g1',
    user: { id: ID },
    options: { getFocused: () => focused },
    respond: async (choices: unknown) => {
      if (options.respondFails) throw new Error('too late');
      responses.push(choices);
    },
  } as unknown as AutocompleteInteraction;
  return { interaction, responses };
}

test('autocomplete: the databank suggests items, and config suggests setting names', async () => {
  const db = fakeAutocomplete('databank', '');
  await handleAutocomplete(db.interaction);
  assert.deepEqual(db.responses[0], itemChoices('', ITEMS));

  const cfg = fakeAutocomplete('config', 'claim.m');
  await handleAutocomplete(cfg.interaction);
  const values = (cfg.responses[0] as { value: string }[]).map((c) => c.value);
  assert.ok(values.includes('claim.min') && values.includes('claim.max'), values.join());
});

test('autocomplete: a failure answers with no suggestions, and a late answer does not crash', async (t) => {
  t.mock.method(console, 'error', () => {});
  // The equip list needs the database, which is not connected in tests.
  const broken = fakeAutocomplete('equip', 'a');
  await handleAutocomplete(broken.interaction);
  assert.deepEqual(broken.responses[0], []);
  const late = fakeAutocomplete('databank', '', { respondFails: true });
  await handleAutocomplete(late.interaction);
  const unknown = fakeAutocomplete('nonsense', '');
  await handleAutocomplete(unknown.interaction);
  assert.deepEqual(unknown.responses[0], []);
});

// ---------------------------------------------------------------------------
// How a command answers
// ---------------------------------------------------------------------------

test('reply: plain text is private in slash commands, an embed or a picture is public, and it can be chosen', () => {
  assert.equal(isEphemeral({ content: 'x' }), true);
  assert.equal(isEphemeral({ embeds: [createEmbed()] }), false);
  assert.equal(isEphemeral({ files: [{ attachment: Buffer.alloc(1), name: 'a.png' }] }), false);
  assert.equal(isEphemeral({ embeds: [createEmbed()], ephemeral: true }), true);
  assert.equal(isEphemeral({ content: 'x', ephemeral: false }), false);
});

/** A stand-in for a slash command interaction that records every call. */
function fakeInteraction(options: { replyFails?: boolean } = {}) {
  const calls: { kind: string; data?: any }[] = [];
  let nextId = 1;
  const message = () => ({ id: `m${nextId++}` });
  const interaction = {
    user: { id: ID, toString: () => `<@${ID}>`, displayName: 'Alice' },
    reply: async (data: unknown) => {
      calls.push({ kind: 'reply', data });
      if (options.replyFails) throw new Error('Unknown interaction');
    },
    fetchReply: async () => {
      calls.push({ kind: 'fetchReply' });
      return message();
    },
    deferReply: async (data?: unknown) => {
      calls.push({ kind: 'defer', data });
    },
    editReply: async (data: unknown) => {
      calls.push({ kind: 'editReply', data });
      return message();
    },
    followUp: async (data: unknown) => {
      calls.push({ kind: 'followUp', data });
      return message();
    },
    webhook: {
      editMessage: async (target: unknown, data: unknown) => {
        calls.push({ kind: 'webhookEdit', data: { target, data } });
      },
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, calls };
}
const guild = { id: 'g1' } as any;
const kinds = (calls: { kind: string }[]) => calls.map((c) => c.kind);
const EPHEMERAL = 64;

test('slash reply: text is private, an embed is public, and nobody is pinged by default', async () => {
  const f = fakeInteraction();
  const { ctx, dispose } = interactionContext(f.interaction, guild, ['a']);
  assert.equal(ctx.source, 'slash');
  assert.equal(ctx.prefix, '/');
  assert.equal(ctx.guildId, 'g1');
  assert.deepEqual(ctx.args, ['a']);
  await ctx.reply('nope');
  assert.equal(f.calls[0]?.data.content, 'nope');
  assert.equal(f.calls[0]?.data.flags, EPHEMERAL);
  assert.deepEqual(f.calls[0]?.data.allowedMentions.parse, []);

  const embed = createEmbed().setTitle('Hi');
  await ctx.reply({ embeds: [embed], allowedMentions: { users: ['2'] } });
  const second = f.calls.find((c) => c.kind === 'followUp');
  assert.equal(second?.data.flags, undefined, 'public');
  assert.deepEqual(second?.data.allowedMentions.users, ['2']);
  assert.equal(second?.data.ephemeral, undefined, 'the option is turned into a flag, not passed on');
  dispose();
});

test('slash reply: the first reply answers the command and later ones are follow-ups', async () => {
  const f = fakeInteraction();
  const { ctx, dispose } = interactionContext(f.interaction, guild, []);
  await ctx.reply({ embeds: [createEmbed()] });
  await ctx.reply({ embeds: [createEmbed()] });
  await ctx.reply({ embeds: [createEmbed()] });
  assert.deepEqual(kinds(f.calls), ['reply', 'fetchReply', 'followUp', 'followUp']);
  dispose();
});

test('slash reply: editing the first reply edits the interaction, and editing a follow-up edits that message', async () => {
  const f = fakeInteraction();
  const { ctx, dispose } = interactionContext(f.interaction, guild, []);
  const first = await ctx.reply({ embeds: [createEmbed()] });
  const later = await ctx.reply({ embeds: [createEmbed()] });
  await first.edit({ embeds: [], components: [] });
  await later.edit({ content: 'x' });
  const editReply = f.calls.filter((c) => c.kind === 'editReply');
  const webhook = f.calls.filter((c) => c.kind === 'webhookEdit');
  assert.equal(editReply.length, 1);
  assert.deepEqual(editReply[0]?.data, { embeds: [], components: [] });
  assert.equal(webhook.length, 1);
  assert.equal(webhook[0]?.data.target.id, (await later.fetchMessage()).id);
  assert.notEqual((await first.fetchMessage()).id, (await later.fetchMessage()).id);
  dispose();
});

test('slash reply: a command that is slow is acknowledged before Discord gives up, and its reply fills that in', async () => {
  const f = fakeInteraction();
  const { ctx, dispose } = interactionContext(f.interaction, guild, [], 20);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(kinds(f.calls), ['defer']);
  await ctx.reply('late');
  assert.deepEqual(kinds(f.calls), ['defer', 'editReply']);
  assert.equal(f.calls[1]?.data.content, 'late');
  assert.equal(f.calls[1]?.data.flags, undefined, 'it can no longer be private');
  await ctx.reply({ embeds: [createEmbed()] });
  assert.equal(f.calls.at(-1)?.kind, 'followUp');
  dispose();
});

test('slash reply: a quick reply cancels the acknowledgement, and so does finishing', async () => {
  const quick = fakeInteraction();
  const a = interactionContext(quick.interaction, guild, [], 20);
  await a.ctx.reply('fast');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(kinds(quick.calls).includes('defer'), false);
  a.dispose();

  const finished = fakeInteraction();
  const b = interactionContext(finished.interaction, guild, [], 20);
  b.dispose();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(finished.calls, []);
});

// ---------------------------------------------------------------------------
// Running slash commands end to end (help needs no database)
// ---------------------------------------------------------------------------

function fakeSlashCommand(commandName: string, extra: Record<string, unknown> = {}) {
  const f = fakeInteraction();
  Object.assign(f.interaction, {
    commandName,
    guild,
    guildId: 'g1',
    inGuild: () => true,
    options: fakeOptions({}).options,
    ...extra,
  });
  return f;
}

test('slash command: /help lists slash usage, no aliases and no prefix, and only the asker sees it', async () => {
  // Runs help through the real slash context. handleSlash would first ask the database whether
  // the channel is allowed (services/channel.ts), and tests have no database, so that one step is skipped.
  const f = fakeSlashCommand('help');
  const { ctx, dispose } = interactionContext(f.interaction, guild, []);
  try {
    ctx.args = SLASH.help!.toArgs(f.interaction);
    await commands.find((c) => c.name === 'help')!.execute(ctx);
  } finally {
    dispose();
  }
  assert.deepEqual(kinds(f.calls), ['reply', 'fetchReply']);
  const data = f.calls[0]?.data;
  assert.equal(data.flags, EPHEMERAL);
  const text: string = data.embeds[0].data.description;
  assert.ok(text.includes('**/balance [user]**'), text);
  for (const name of SLASH_EXCLUDED) assert.equal(text.includes(`/${name}`), false, `/${name} is excluded, so it is not listed`);
  assert.ok(text.includes('**/sell one | some | all | stars**'), text);
  assert.ok(text.includes('**/gacha [multi]**'), text);
  assert.equal(text.includes('(also'), false, 'no aliases');
  assert.equal(text.includes('k!'), false, 'no prefix');
  assert.equal(text.includes('/give'), false, 'the admin command is not listed for an ordinary member');
});

test('slash command: something that goes wrong answers with the error message, privately', async (t) => {
  t.mock.method(console, 'error', () => {});
  // claim needs the database, which is not connected in tests.
  const f = fakeSlashCommand('claim');
  await handleSlash(f.interaction);
  assert.equal(f.calls[0]?.kind, 'reply');
  assert.equal(f.calls[0]?.data.content, TEXT.common.error);
  assert.equal(f.calls[0]?.data.flags, EPHEMERAL);
});

test('slash command: a command the bot no longer has, or one used outside a server, gets a private explanation', async () => {
  const gone = fakeSlashCommand('removed');
  await handleSlash(gone.interaction);
  assert.equal(gone.calls[0]?.data.content, TEXT.common.unknownSlash);
  assert.equal(gone.calls[0]?.data.flags, EPHEMERAL);

  // A command that is excluded from slash commands is answered the same way, in case Discord still shows it.
  for (const name of SLASH_EXCLUDED) {
    const excluded = fakeSlashCommand(name);
    await handleSlash(excluded.interaction);
    assert.equal(excluded.calls[0]?.data.content, TEXT.common.unknownSlash, name);
    assert.equal(excluded.calls[0]?.data.flags, EPHEMERAL);
  }

  // An alias is not a slash command.
  const alias = fakeSlashCommand('bal');
  await handleSlash(alias.interaction);
  assert.equal(alias.calls[0]?.data.content, TEXT.common.unknownSlash);

  const dm = fakeSlashCommand('help', { inGuild: () => false });
  await handleSlash(dm.interaction);
  assert.equal(dm.calls[0]?.data.content, TEXT.common.serverOnly);
});

test('slash command: the timer is always cleaned up, so a finished command never acknowledges later', async () => {
  const f = fakeSlashCommand('help');
  await handleSlash(f.interaction);
  const before = f.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(f.calls.length, before);
});

// ---------------------------------------------------------------------------
// Prefix commands still answer as they did
// ---------------------------------------------------------------------------

function fakeMessage() {
  const calls: { kind: string; data?: any }[] = [];
  const sent = {
    id: 's1',
    edit: async (data: unknown) => {
      calls.push({ kind: 'edit', data });
    },
  };
  const message = {
    guildId: 'g1',
    guild,
    author: { id: ID },
    reply: async (data: unknown) => {
      calls.push({ kind: 'reply', data });
      return sent;
    },
  } as unknown as Message<true>;
  return { message, calls, sent };
}

test('message context: replies are sent as replies without pings, and the slash-only option is dropped', async () => {
  const f = fakeMessage();
  const ctx = messageContext(f.message, ['x'], 'k!');
  assert.equal(ctx.source, 'message');
  assert.equal(ctx.prefix, 'k!');
  assert.equal(ctx.guildId, 'g1');
  assert.equal(ctx.user.id, ID);
  assert.deepEqual(ctx.args, ['x']);

  const sent = await ctx.reply({ embeds: [createEmbed()], ephemeral: true, allowedMentions: { users: ['2'] } });
  const data = f.calls[0]?.data;
  assert.equal(data.ephemeral, undefined);
  assert.deepEqual(data.allowedMentions.users, ['2']);
  assert.equal(data.allowedMentions.repliedUser, false);

  await ctx.reply('plain');
  assert.equal(f.calls[1]?.data.content, 'plain');

  await sent.edit({ content: 'edited' });
  assert.deepEqual(f.calls[2], { kind: 'edit', data: { content: 'edited' } });
  assert.equal(await sent.fetchMessage(), f.sent);
});
