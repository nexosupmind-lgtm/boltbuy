import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { ratio, choose, parse, over } = createRequire(import.meta.url)('../SITE/Salgaditos/buy-contrast.js');
test('Contrast chooses readable text on white cards, dark controls and merchant colors', () => {
  for (const bg of [[255,255,255],[7,19,33],[9,25,44],[237,23,46],[255,156,66],[240,244,250]]) {
    assert.ok(ratio(choose([bg]),bg)>=4.5, `unreadable on ${bg}`);
  }
  assert.deepEqual(choose([[255,255,255]]),[23,37,58]);
  assert.deepEqual(choose([[7,19,33]]),[248,250,252]);
});
test('Transparent layers blend with the parent, and gradient choices check all stops', () => {
  assert.deepEqual(parse('rgba(255, 255, 255, 0.5)'),[255,255,255,.5]);
  assert.deepEqual(over([255,255,255,.5],[0,0,0]),[127.5,127.5,127.5]);
  const stops = [[12,39,68],[9,29,52]];
  assert.ok(stops.every(bg=>ratio(choose(stops),bg)>=4.5));
  assert.equal(parse('transparent'),null);
});
