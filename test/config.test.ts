import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { Message } from 'discord.js';
import { TEXT } from '../src/constants.js';
import { config, GROUPS } from '../src/commands/config.js';
import { messageContext } from '../src/discord/context.js';

/** How a reply (or a button-flipped edit of one) reads, whichever shape it came in as. */
const pageView = (r: any): { title?: string | null; fields: { name: string; value: string }[]; footer?: string; components?: any[]; content?: string } =>
  r.embeds
    ? { ...r.embeds[0].data, fields: r.embeds[0].data.fields ?? [], footer: r.embeds[0].data.footer?.text, components: r.components }
    : { fields: [], content: String(r.content ?? r) };

/** Lets a test await the microtasks a button press's async handler needs to finish. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};

/**
 * A stand-in for a message and its button collector, in the shape `paginate()` (and the discord.js
 * types it expects) needs: `message.reply(...)` returns something with `.edit` and
 * `.createMessageComponentCollector`, and `click()` fires a fake button press at the collector.
 */
function fakeMessage(userId = '1') {
  const events: { kind: string; data?: any }[] = [];
  const collector = Object.assign(new EventEmitter(), {
    stop(reason: string) {
      setImmediate(() => this.emit('end', new Map(), reason));
    },
  });
  const sent = {
    edit: async (o: unknown) => {
      events.push({ kind: 'edit', data: o });
    },
    createMessageComponentCollector: () => collector,
  };
  const replies: any[] = [];
  const message = {
    author: { id: userId, toString: () => `<@${userId}>` },
    reply: async (o: any) => {
      replies.push(o);
      return sent;
    },
  } as unknown as Message<true>;
  const click = (clickerId: string, customId: string) => {
    const interaction = {
      user: { id: clickerId },
      customId,
      deferUpdate: async () => {
        events.push({ kind: 'defer' });
      },
      editReply: async (o: unknown) => {
        events.push({ kind: 'editReply', data: o });
      },
      reply: async (o: unknown) => {
        events.push({ kind: 'reply', data: o });
      },
    };
    collector.emit('collect', interaction);
  };
  return { message, replies, events, collector, click };
}

/** Runs the config command with a stand-in message and returns every reply it sent, as page views. */
async function ask(...words: string[]): Promise<ReturnType<typeof pageView>[]> {
  const f = fakeMessage();
  await config.execute(messageContext(f.message as Message<true>, words, 'k!'));
  return f.replies.map(pageView);
}

/** Runs "config list" and clicks Next until every page has been seen, in order. */
async function collectAllPages(): Promise<ReturnType<typeof pageView>[]> {
  const f = fakeMessage();
  await config.execute(messageContext(f.message as Message<true>, ['list'], 'k!'));
  assert.equal(f.replies.length, 1, 'always just one message, however many pages it holds');
  const pages = [pageView(f.replies[0])];
  for (;;) {
    const last = pages.at(-1)!;
    if (!last.components || last.components.length === 0) break; // a single page has no buttons at all
    const row = (last.components[0] as any).toJSON();
    if (row.components[1].disabled) break; // Next is disabled on the last page
    f.click('1', 'databank_next');
    await settle();
    const edited = f.events.filter((e) => e.kind === 'editReply').at(-1);
    pages.push(pageView({ embeds: [edited?.data.embeds[0]], components: edited?.data.components }));
  }
  return pages;
}

test('config: with no argument, list, or view, it opens on the first page', async () => {
  for (const words of [[], ['list'], ['view']]) {
    const [reply] = await ask(...words);
    assert.equal(reply?.fields[0]?.name, 'General', `${JSON.stringify(words)} opens on the first group`);
  }
});

test('config: every real settings group has its own page when flipped through from the start', async () => {
  const pages = await collectAllPages();
  const names = pages.map((p) => p.fields[0]?.name);
  // Every plain (non-Equipment) group appears under its own bare name somewhere in the book.
  for (const group of GROUPS) {
    if (group === 'Equipment') {
      assert.ok(names.some((n) => n?.startsWith('Equipment') && n.includes('— page')), 'Equipment got its own numbered page(s)');
    } else {
      assert.ok(names.includes(group), `${group} has its own page`);
    }
  }
});

test('config: "config <group>" jumps straight to that group\'s page instead of opening on page one', async () => {
  const allPages = await collectAllPages();
  const plinkoPage = allPages.find((p) => p.fields[0]?.name === 'Plinko');
  assert.ok(plinkoPage, 'the full list has a Plinko page to compare against');

  for (const words of [['plinko'], ['Plinko'], ['PLINKO']]) {
    const [reply] = await ask(...words);
    assert.equal(reply?.fields.length, 1);
    assert.equal(reply?.fields[0]?.name, 'Plinko');
    assert.deepEqual(reply?.fields, plinkoPage?.fields, `${JSON.stringify(words)} shows exactly the Plinko page`);
    assert.equal(reply?.title, plinkoPage?.title, 'same page title as flipping there manually');
  }
});

test('config: jumping to a group longer than one field lands on its first numbered sub-page', async () => {
  const [reply] = await ask('equipment');
  assert.equal(reply?.fields.length, 1);
  assert.match(reply?.fields[0]?.name ?? '', /^Equipment .* — page 1\/\d+$/);
});

test('config: after jumping to a group, Previous and Next still reach the rest of the book', async () => {
  const allPages = await collectAllPages();
  const plinkoIndex = allPages.findIndex((p) => p.fields[0]?.name === 'Plinko');
  assert.ok(plinkoIndex > 0, 'Plinko is not the very first page, so Previous has somewhere to go');

  const f = fakeMessage();
  await config.execute(messageContext(f.message as Message<true>, ['plinko'], 'k!'));
  f.click('1', 'databank_next');
  await settle();
  const afterNext = pageView({ embeds: [f.events.at(-1)?.data.embeds[0]] });
  assert.deepEqual(afterNext.fields, allPages[plinkoIndex + 1]?.fields, 'Next from the jumped-to page reaches the following page');

  f.click('1', 'databank_prev');
  await settle();
  const afterPrev = pageView({ embeds: [f.events.at(-1)?.data.embeds[0]] });
  assert.deepEqual(afterPrev.fields, allPages[plinkoIndex]?.fields, 'Previous returns to the Plinko page');
});

test('config: a word that matches no group and no action is still an unknown action, not a broken jump', async () => {
  const [reply] = await ask('zzzznotagroup');
  assert.equal(reply?.content, TEXT.config.unknownAction('k!'));
});

test('config: the General page shows the per-server channel setting (services/channel.ts, not a real SettingSpec)', async () => {
  // fakeMessage() has no real guild, so getChannelId's database read fails -- config.ts catches
  // that and shows the channel as unset instead of crashing the whole listing over one field.
  const [reply] = await ask();
  assert.equal(reply?.fields[0]?.name, 'General');
  assert.match(reply?.fields[0]?.value ?? '', /`channel`: \*\*None\*\*$/);
});

test('config: set/reset channel is turned away for a non-admin, the same as every other setting, before touching the database', async () => {
  for (const words of [
    ['set', 'channel', '<#123456789012345678>'],
    ['reset', 'channel'],
  ]) {
    const [reply] = await ask(...words);
    assert.equal(reply?.content, TEXT.config.adminOnly, words.join(' '));
  }
});
