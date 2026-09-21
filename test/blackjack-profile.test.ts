import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AVATAR, BLACKJACK, validateConstants } from '../src/constants.js';
import { cleanName, fitName, imagePaint, renderTable, TABLE_WIDTH } from '../src/animations/images/blackjack-image.js';
import { encodePng } from '../src/animations/images/png.js';
import { decodePng, type Avatar } from '../src/animations/images/png-decode.js';
import { clearAvatarCache, fetchAvatar, loadProfile, nameOf } from '../src/discord/profile.js';
import type { Card } from '../src/lib/game/blackjack.js';

/*
 * The profile pictures and names on the blackjack table: reading a PNG, the picture as a circle,
 * simplifying a name to what the built-in font can spell, fetching and remembering pictures, and
 * where the rank and suit of a card sit.
 */

/** Small PNG files made by other programs (ImageMagick, Pillow, OpenCV), with the pixels they must decode to. */
const FIXTURES: Record<string, { width: number; height: number; png: string; rgba: string }> = {
  interlaced: { width: 9, height: 7, png: 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAHCAMAAAGaQqfEAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAADAUExURWF7Dw8jNxrwwOVhQ8Q7ygprX2FRZHrIgyOJ0kcRCa60KyfVD4PVqQ+eLAt1OdxmbYKhddYlZawsn2wAiuKEBDU3E7lG5ib2IviCBefu517zX+SbSBXK5wcgHqfhZJb/AuqO0DeUxQgAbQfRPH4zBe75WjMVSpfFJS5qfLy+6PdFxU6fdPco1/uWWUB09Y9saH8eF5C8Q7efEaNFJee8FgfDwiQpLurh7JpJZ6/i/6fPgHCia0T+syCNVubxjP///56KEhUAAAAZdFJOUwAAAAAAAAAAAAAAAAAAAACAgICAgICAgICHNujCAAAAAWJLR0Q/PmMwdQAAAAd0SU1FB+oJFRUFJT1CFgEAAABUSURBVAjXBcGHAkIAAAXAZ8tKVtlRWVlF2f7/s9zBvsNHY3VwA7RfvGjGyHCbzusOx0MISk9S8J/TFeO8bFCJKCYv2uOJvHizpclVNXpB/P2lQVYOGocHoqTDyaUAAAAASUVORK5CYII=', rgba: '5+7n/17zX//km0j/Fcrn/wcgHv9hew8Ap+Fk/5b/Av/qjtD/gqF1gA8jNwA3lMX/CABt/xrwwADWJWWArCyfgAfRPP9+MwX/7vla/+VhQwDEO8oAbACKgAprXwAzFUr/4oQEgJfFJf8uanz/vL7o//dFxf9On3T/YVFkAPco1/81NxOAesiDAPuWWf9AdPX/j2xo/yOJ0gB/Hhf/kLxD/7lG5oBHEQkAt58R/yb2IoCjRSX/57wW/660KwAn1Q8AB8PC/yQpLv+D1akA6uHs/w+eLAALdTkA+IIFgJpJZ/+v4v//p8+A/9xmbQBwomv/RP6z/yCNVv/m8Yz/' },
  palette: { width: 6, height: 3, png: 'iVBORw0KGgoAAAANSUhEUgAAAAYAAAADBAMAAABCL2PIAAAAMFBMVEXTw/yh56QmEI4Vj7WeCUXP6GEMiHlIGDvkN7wnZWbzg1sF8RJbc4uxUclyLNLGQubv2whjAAAAA3RSTlP//wDXyg1BAAAAFUlEQVR4nGN4xrOO6YD6TsZDN54BAB87BcSS0mEoAAAAAElFTkSuQmCC', rgba: 'cizS/wyIef/Tw/z/W3OL//ODW/9yLNL/84Nb/wyIef8Vj7X/FY+1/wyIef9IGDv/W3OL/yYQjgAnZWb/84Nb/+Q3vP/Tw/z/' },
  sixteen: { width: 5, height: 4, png: 'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAEEAYAAAAWoykDAAAAr0lEQVQIHQGkAFv/Aavuq7jlqM4UijdaFLRNAMErGnM6FMu1F+c9KVFXtsY+II5Zawx3xKQBdoVHJgKPYiQ9rUsTITUGbXSDj1QSCqMGO/DftVXmAeSf3CbWLtzzTwGpfzDkNlWnATPPkCzBGJUH3bqIML5QM1CLKPsj1QKKDO/x6hyehOxqAYZ4zDVV2dgfG1hRayo1jFUg3YMmGEUawsK+CrCiKy8FQdT/P1K2YlWVxEa49Zy/QgAAAABJRU5ErkJggg==', rgba: 'q6vlzjUFmc5geK2DR6EESWf6EA12RwJis5IjaCchNQtiAIoMASa4/6kwNqfcwPc8uUi1b0RDivkzLSjlhsxV2KEdf2TBoJd+g6o5rcSpiw8=' },
  bilevel: { width: 10, height: 3, png: 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAADAQAAAACCRqPYAAAAEUlEQVR4nGOYz8DgdYDRnBMACe0B68Vs9SQAAAAASUVORK5CYII=', rgba: '/////wAAAP8AAAD///////////////////////////8AAAD/AAAA/wAAAP//////AAAA/wAAAP//////AAAA//////8AAAD///////////8AAAD/AAAA////////////AAAA/////////////////wAAAP//////' },
};

const bytes = (base64: string): Uint8Array => new Uint8Array(Buffer.from(base64, 'base64'));

/** A picture of one colour. */
function flat(width: number, height: number, [r, g, b, a]: readonly [number, number, number, number]): Avatar {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([r, g, b, a], i * 4);
  return { width, height, rgba };
}

const pngOf = (img: Avatar): Uint8Array => encodePng(img.width, img.height, img.rgba);

/** The colour at a place of a rendered table, given in the layout's units (640 by 400), whatever size the picture is drawn at. */
function pixelAt(png: Uint8Array, x: number, y: number): [number, number, number] {
  const img = decodePng(png) as Avatar;
  const at = (Math.round(y * BLACKJACK.imageScale) * img.width + Math.round(x * BLACKJACK.imageScale)) * 4;
  return [img.rgba[at] as number, img.rgba[at + 1] as number, img.rgba[at + 2] as number];
}

const close = (a: readonly number[], b: readonly number[], tolerance: number): boolean => a.every((v, i) => Math.abs(v - (b[i] as number)) <= tolerance);

test('png decode: files from other programs decode to the exact pixels (interlaced, palette with transparency, 16-bit, one-bit)', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    const img = decodePng(bytes(fixture.png));
    assert.ok(img, `${name} decodes`);
    assert.equal(img.width, fixture.width, name);
    assert.equal(img.height, fixture.height, name);
    assert.deepEqual([...img.rgba], [...bytes(fixture.rgba)], name);
  }
});

test('png decode: the bot own pictures read back exactly', () => {
  const rgba = new Uint8Array(7 * 5 * 4).map((_, i) => (i * 37 + 11) % 256);
  const img = decodePng(encodePng(7, 5, rgba));
  assert.ok(img);
  assert.deepEqual([...img.rgba], [...rgba]);
});

test('png decode: anything unreadable gives null instead of an error', () => {
  const good = pngOf(flat(4, 4, [10, 20, 30, 255]));
  assert.equal(decodePng(new Uint8Array(0)), null);
  assert.equal(decodePng(new TextEncoder().encode('<html>not a picture</html>')), null);
  assert.equal(decodePng(good.subarray(0, 20)), null, 'cut off in the header');
  assert.equal(decodePng(good.subarray(0, good.length - 30)), null, 'cut off in the data');
  const damaged = Buffer.from(good);
  damaged[damaged.length - 20] = (damaged[damaged.length - 20] as number) ^ 0xff;
  // A damaged data stream is either refused or, if it still inflates, some picture: it must never throw.
  assert.doesNotThrow(() => decodePng(damaged));
  const huge = Buffer.from(good);
  huge.writeUInt32BE(5000, 16); // a width past the limit
  assert.equal(decodePng(huge), null, 'too big');
  const strange = Buffer.from(good);
  strange[25] = 5; // a colour type that does not exist
  assert.equal(decodePng(strange), null, 'unknown colour type');
});

test('image paint: shows the picture over its square, is see-through where the picture is, and averages when shrinking', () => {
  const red = imagePaint(flat(8, 8, [255, 0, 0, 255]), 50, 50, 20);
  assert.deepEqual(red(50, 50).map((v) => Math.round(v * 255)), [255, 0, 0, 255]);
  const clear = imagePaint(flat(8, 8, [255, 0, 0, 0]), 50, 50, 20);
  assert.equal(clear(50, 50)[3], 0);

  // Left half black, right half white: the middle of the square is grey, the two sides are pure.
  const half = flat(8, 8, [0, 0, 0, 255]);
  for (let y = 0; y < 8; y++) for (let x = 4; x < 8; x++) half.rgba.set([255, 255, 255, 255], (y * 8 + x) * 4);
  const paint = imagePaint(half, 50, 50, 20);
  assert.ok((paint(41, 50)[0] as number) < 0.05);
  assert.ok((paint(59, 50)[0] as number) > 0.95);
  const middle = paint(50, 50)[0] as number;
  assert.ok(middle > 0.2 && middle < 0.8, `the edge between them is blended (${middle})`);
});

test('names: simplified to what the font can spell, with a fallback', () => {
  assert.equal(cleanName('Simon', 'PLAYER 1'), 'SIMON');
  assert.equal(cleanName('José Ñandú', 'PLAYER 1'), 'JOSE NANDU');
  assert.equal(cleanName('  a    b  ', 'PLAYER 1'), 'A B');
  assert.equal(cleanName('Ｓｉｍｏｎ', 'PLAYER 1'), 'SIMON', 'wide letters');
  assert.equal(cleanName('sly_goose-9!', 'PLAYER 1'), 'SLY_GOOSE-9!');
  assert.equal(cleanName('😀🎲', 'PLAYER 2'), 'PLAYER 2', 'only emoji');
  assert.equal(cleanName('東京', 'PLAYER 3'), 'PLAYER 3', 'another alphabet');
  assert.equal(cleanName('!!!', 'PLAYER 4'), 'PLAYER 4', 'only marks');
  assert.equal(cleanName('', 'PLAYER 5'), 'PLAYER 5');
  assert.equal(cleanName('Ann 😀 Lee', 'PLAYER 1'), 'ANN LEE');
});

test('names: cut with two dots to fit, keeping at least one letter', () => {
  const wide = (text: string): number => [...text].length; // only used for comparing lengths below
  assert.equal(fitName('SIMON', 200), 'SIMON');
  const cut = fitName('BARTHOLOMEW THE THIRD', 50);
  assert.ok(cut.endsWith('..') && cut.length < 21 && wide(cut) > 3, cut);
  assert.equal(fitName('BARTHOLOMEW', 1)[0], 'B');
  assert.ok(fitName('BARTHOLOMEW', 1).endsWith('..'));
  // Shorter room, shorter name.
  assert.ok(fitName('BARTHOLOMEW THE THIRD', 40).length <= fitName('BARTHOLOMEW THE THIRD', 60).length);
});

test('nameOf: the nickname, then the display name, then the username', () => {
  assert.equal(nameOf({ username: 'user', globalName: 'Global', displayName: 'Display' }, { displayName: 'Nick' }), 'Nick');
  assert.equal(nameOf({ username: 'user', displayName: 'Display' }, { nick: 'Nick' }), 'Nick');
  assert.equal(nameOf({ username: 'user', globalName: 'Global', displayName: 'Display' }, null), 'Display');
  assert.equal(nameOf({ username: 'user', globalName: 'Global' }), 'Global');
  assert.equal(nameOf({ username: 'user' }), 'user');
  assert.equal(nameOf({ username: '   ' }), 'Player');
  assert.equal(nameOf({}), 'Player');
});

test('profiles: a picture is fetched once and remembered, a failure is not remembered, nothing ever throws', async () => {
  clearAvatarCache();
  const file = pngOf(flat(4, 4, [1, 2, 3, 255]));
  let calls = 0;
  const good = async (): Promise<Uint8Array | null> => {
    calls++;
    return file;
  };
  const one = await fetchAvatar('https://cdn.example/a.png', good);
  const two = await fetchAvatar('https://cdn.example/a.png', good);
  assert.ok(one && one === two);
  assert.equal(calls, 1);
  assert.deepEqual([...(one as Avatar).rgba.subarray(0, 4)], [1, 2, 3, 255]);

  let tries = 0;
  const flaky = async (): Promise<Uint8Array | null> => {
    tries++;
    if (tries === 1) throw new Error('network down');
    return file;
  };
  assert.equal(await fetchAvatar('https://cdn.example/b.png', flaky), null, 'the first try fails');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(await fetchAvatar('https://cdn.example/b.png', flaky), 'the next game tries again');

  assert.equal(await fetchAvatar('https://cdn.example/c.png', async () => new TextEncoder().encode('nope')), null, 'not a PNG');
  assert.equal(await fetchAvatar('https://cdn.example/d.png', async () => null), null, 'nothing came');
  clearAvatarCache();
});

test('profiles: the server picture comes before the own one, the size is asked for, and a broken user still gives a name', async () => {
  clearAvatarCache();
  const asked: string[] = [];
  const get = async (url: string): Promise<Uint8Array | null> => {
    asked.push(url);
    return pngOf(flat(4, 4, [9, 9, 9, 255]));
  };
  const options: unknown[] = [];
  const user = { username: 'user', displayAvatarURL: (o: unknown) => (options.push(o), 'https://cdn.example/user.png') };
  const member = { displayName: 'Nick', displayAvatarURL: () => 'https://cdn.example/server.png' };

  const withMember = await loadProfile(user, member, get);
  assert.equal(withMember.name, 'Nick');
  assert.ok(withMember.avatar);
  assert.deepEqual(asked, ['https://cdn.example/server.png']);

  const plain = await loadProfile(user, null, get);
  assert.equal(plain.name, 'user');
  assert.deepEqual(asked[1], 'https://cdn.example/user.png');
  assert.deepEqual(options[0], { extension: 'png', size: AVATAR.size, forceStatic: true });

  const broken = await loadProfile(
    {
      username: 'oops',
      displayAvatarURL: () => {
        throw new Error('no avatar');
      },
    },
    null,
    get,
  );
  assert.deepEqual(broken, { name: 'oops', avatar: null });
  assert.deepEqual(await loadProfile({}, null, get), { name: 'Player', avatar: null }, 'a user with no picture at all');
  clearAvatarCache();
});

test('profiles: the picture settings pass the startup check', () => {
  validateConstants();
  assert.ok((AVATAR.size & (AVATAR.size - 1)) === 0 && AVATAR.size >= 16);
});

const card = (rank: number, suit: Card['suit']): Card => ({ rank, suit });

test('table picture: a player is drawn with their picture where the number used to be, and the name changes the picture', () => {
  const blue = flat(16, 16, [40, 90, 220, 255]);
  const withPicture = renderTable({ seats: [{ name: 'Simon', avatar: blue, cards: [], bet: 10 }], dealer: [] });
  // One seat sits in the middle of the table; the picture is a circle 34 pixels across, centred at y 190.
  assert.ok(close(pixelAt(withPicture, TABLE_WIDTH / 2, 190), [40, 90, 220], 6), 'the picture is at the seat');
  assert.ok(!close(pixelAt(withPicture, TABLE_WIDTH / 2 + 40, 190), [40, 90, 220], 40), 'and only there');

  const without = renderTable({ seats: [{ name: 'Simon', cards: [], bet: 10 }], dealer: [] });
  assert.ok(!close(pixelAt(without, TABLE_WIDTH / 2, 205), [40, 90, 220], 30), 'no picture: a coloured circle with a letter instead');
  assert.notDeepEqual(Buffer.from(withPicture), Buffer.from(without));

  const other = renderTable({ seats: [{ name: 'Anna', avatar: blue, cards: [], bet: 10 }], dealer: [] });
  assert.notDeepEqual(Buffer.from(withPicture), Buffer.from(other), 'the name is drawn');
  const same = renderTable({ seats: [{ name: 'Simon', avatar: blue, cards: [], bet: 10 }], dealer: [] });
  assert.deepEqual(Buffer.from(withPicture), Buffer.from(same));

  // Emoji-only names still draw (as "PLAYER 1"), and an open seat does too.
  assert.ok(renderTable({ seats: [{ name: '😀', cards: [], bet: 10 }, null], dealer: [] }).length > 1000);
});

test('table picture: a card has its rank in the top left corner and its suit big in the middle, and no small suit under the rank', () => {
  const png = renderTable({ seats: [], dealer: [card(13, 'hearts')] });
  // The dealer's card sits centred at the top: its left edge is at 296 and its top at 46 (48 by 68 pixels).
  const left = 296;
  const top = 46;
  const isRed = (p: readonly number[]): boolean => (p[0] as number) > 170 && (p[1] as number) < 90 && (p[2] as number) < 100;
  assert.ok(isRed(pixelAt(png, left + 24, top + 39)), 'a red heart in the middle');

  const redIn = (x0: number, y0: number, x1: number, y1: number): number => {
    let count = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isRed(pixelAt(png, x, y))) count++;
    return count;
  };
  assert.ok(redIn(left + 4, top + 5, left + 16, top + 20) > 15, 'the K is in the top left corner');
  assert.equal(redIn(left + 5, top + 23, left + 10, top + 34), 0, 'nothing under it in the corner (no small suit)');
});
