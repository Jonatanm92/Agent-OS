/**
 * Dricksräknare och notadelare.
 */

const EPSILON = 1e-9;

function assertNonNegativeFinite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} måste vara ett ändligt tal >= 0 (fick ${String(value)})`);
  }
}

/**
 * Avrundar ett icke-negativt tal till närmaste hela krona. Exakt ,5 avrundas
 * uppåt, och små flyttalsfel (t.ex. 2.4999999999 som borde vara 2.5) tolereras.
 * @param {number} value
 * @returns {number}
 */
export function roundKronor(value) {
  assertNonNegativeFinite("value", value);
  const tolerance = EPSILON * Math.max(1, Math.abs(value));
  const result = Math.floor(value + 0.5 + tolerance);
  return result === 0 ? 0 : result;
}

/**
 * Räknar ut dricks i hela kronor.
 * @param {number} amount
 * @param {number} tipPercent
 * @returns {number}
 */
export function calculateTip(amount, tipPercent) {
  assertNonNegativeFinite("amount", amount);
  assertNonNegativeFinite("tipPercent", tipPercent);
  return roundKronor((amount * tipPercent) / 100);
}

/**
 * Räknar ut dricks och total och delar totalen i heltalsandelar.
 * @param {{ amount: number, tipPercent?: number, people?: number }} options
 * @returns {{ tip: number, total: number, shares: number[] }}
 */
export function splitBill({ amount, tipPercent = 10, people = 1 } = {}) {
  assertNonNegativeFinite("amount", amount);
  assertNonNegativeFinite("tipPercent", tipPercent);
  if (typeof people !== "number" || !Number.isInteger(people) || people < 1) {
    throw new RangeError(`people måste vara ett heltal >= 1 (fick ${String(people)})`);
  }

  const tip = calculateTip(amount, tipPercent);
  const total = roundKronor(amount + tip);
  const base = Math.floor(total / people);
  const remainder = total - base * people;
  const shares = [];
  for (let i = 0; i < people; i++) {
    shares.push(i < remainder ? base + 1 : base);
  }
  return { tip, total, shares };
}
