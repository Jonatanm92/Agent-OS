import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { textStats, topWords } from '../src/index.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('AC1: counts words', () => {
  assert.equal(textStats('Hej hej världen').words, 3);
});

test('AC2: counts characters and lines', () => {
  const s = textStats('ab\ncd');
  assert.equal(s.characters, 5);
  assert.equal(s.lines, 2);
});

test('AC3: most frequent words', () => {
  assert.deepEqual(topWords('Hej hej världen', 1), [{ word: 'hej', count: 2 }]);
});

test('AC4: empty and invalid input', () => {
  assert.deepEqual(textStats(''), { words: 0, characters: 0, lines: 0 });
  assert.throws(() => textStats(42), TypeError);
});

test('AC5: CLI prints JSON stats', () => {
  const ok = spawnSync(process.execPath, [cli, 'hej', 'hej', 'du'], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /"words":3/);
  const bad = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
