import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmbed } from '../src/lib/embed.js';

test('addBlankField adds an empty spacer field and chains with the other methods', () => {
  const embed = createEmbed()
    .setTitle('Title')
    .addFields({ name: 'A', value: '1' })
    .addBlankField()
    .addFields({ name: 'B', value: '2' })
    .setFooter({ text: 'footer' });

  const json = embed.toJSON();
  assert.equal(json.title, 'Title');
  assert.equal(json.footer?.text, 'footer');
  assert.equal(json.fields?.length, 3);
  assert.equal(json.fields?.[0]?.name, 'A');
  assert.equal(json.fields?.[1]?.name, '​');
  assert.equal(json.fields?.[1]?.value, '​');
  assert.equal(json.fields?.[1]?.inline, false);
  assert.equal(json.fields?.[2]?.name, 'B');
});

test('addBlankField(true) makes an inline blank field, and it returns the same embed', () => {
  const embed = createEmbed();
  assert.equal(embed.addBlankField(true), embed);
  assert.equal(embed.toJSON().fields?.[0]?.inline, true);
});

test('createEmbed still applies the configured color', () => {
  assert.equal(typeof createEmbed().toJSON().color, 'number');
});
