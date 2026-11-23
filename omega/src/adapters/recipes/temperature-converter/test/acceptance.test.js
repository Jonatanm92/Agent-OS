import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { celsiusToFahrenheit, fahrenheitToCelsius, convert } from '../src/index.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('AC1: celsius to fahrenheit', () => {
  assert.equal(celsiusToFahrenheit(0), 32);
  assert.equal(celsiusToFahrenheit(100), 212);
});

test('AC2: fahrenheit to celsius', () => {
  assert.equal(fahrenheitToCelsius(98.6), 37);
});

test('AC3: kelvin conversions', () => {
  assert.equal(convert(25, 'C', 'K'), 298.15);
  assert.equal(convert(0, 'K', 'C'), -273.15);
});

test('AC4: non-numeric input throws TypeError', () => {
  assert.throws(() => celsiusToFahrenheit('hot'), TypeError);
  assert.throws(() => convert(Number.NaN, 'C', 'F'), TypeError);
});

test('AC5: below absolute zero throws RangeError', () => {
  assert.throws(() => convert(-300, 'C', 'F'), RangeError);
  assert.throws(() => convert(-1, 'K', 'C'), RangeError);
});

test('AC6: CLI converts and validates arguments', () => {
  const ok = spawnSync(process.execPath, [cli, '100', 'C', 'F'], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), '212 F');
  const bad = spawnSync(process.execPath, [cli, 'abc', 'C'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /usage/);
});
