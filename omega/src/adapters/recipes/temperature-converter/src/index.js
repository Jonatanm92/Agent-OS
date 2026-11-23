const ABSOLUTE_ZERO_C = -273.15;

function assertNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('value must be a finite number');
  }
}

function round2(n) {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function toCelsius(value, unit) {
  if (unit === 'C') return value;
  if (unit === 'F') return ((value - 32) * 5) / 9;
  if (unit === 'K') return value + ABSOLUTE_ZERO_C;
  throw new TypeError(`unknown unit: ${unit}`);
}

function fromCelsius(c, unit) {
  if (unit === 'C') return c;
  if (unit === 'F') return (c * 9) / 5 + 32;
  if (unit === 'K') return c - ABSOLUTE_ZERO_C;
  throw new TypeError(`unknown unit: ${unit}`);
}

export function convert(value, from, to) {
  assertNumber(value);
  const c = toCelsius(value, from);
  if (c < ABSOLUTE_ZERO_C - 1e-9) throw new RangeError('temperature below absolute zero');
  return round2(fromCelsius(c, to));
}

export function celsiusToFahrenheit(c) {
  return convert(c, 'C', 'F');
}

export function fahrenheitToCelsius(f) {
  return convert(f, 'F', 'C');
}
