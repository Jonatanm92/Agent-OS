import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { roundKronor, calculateTip, splitBill } from "../src/index.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    timeout: 10000,
  });
}

test("AC1: roundKronor rounds to nearest whole krona, .5 rounds up", () => {
  assert.equal(roundKronor(2.5), 3);
  assert.equal(roundKronor(2.49), 2);
  assert.equal(roundKronor(0), 0);
  assert.equal(roundKronor(34.7), 35);
});

test("AC2: calculateTip returns rounded tip in whole kronor", () => {
  assert.equal(calculateTip(347, 10), 35);
  assert.equal(calculateTip(200, 15), 30);
});

test("AC3: splitBill 347 kr, 10 %, 3 people", () => {
  assert.deepStrictEqual(splitBill({ amount: 347, tipPercent: 10, people: 3 }), {
    tip: 35,
    total: 382,
    shares: [128, 127, 127],
  });
});

test("AC4: splitBill uses defaults 10 % and 1 person", () => {
  assert.deepStrictEqual(splitBill({ amount: 100 }), {
    tip: 10,
    total: 110,
    shares: [110],
  });
});

test("AC5: shares have correct length, are integers, sum to total and differ by at most 1", () => {
  for (const amount of [0, 1, 99.9, 347, 1000]) {
    for (const people of [1, 2, 3, 7]) {
      const label = `amount=${amount} people=${people}`;
      const { total, shares } = splitBill({ amount, people });
      assert.ok(Array.isArray(shares), label);
      assert.equal(shares.length, people, label);
      for (const s of shares) assert.ok(Number.isInteger(s), `${label} share ${s}`);
      assert.equal(shares.reduce((a, b) => a + b, 0), total, label);
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, label);
      // Those receiving the extra krona come first
      for (let i = 1; i < shares.length; i++) {
        assert.ok(shares[i - 1] >= shares[i], `${label} order`);
      }
    }
  }
});

test("AC6: splitBill throws RangeError for invalid input", () => {
  assert.throws(() => splitBill({ amount: -1 }), RangeError);
  assert.throws(() => splitBill({ amount: NaN }), RangeError);
  assert.throws(() => splitBill({ amount: 100, tipPercent: -5 }), RangeError);
  assert.throws(() => splitBill({ amount: 100, people: 0 }), RangeError);
  assert.throws(() => splitBill({ amount: 100, people: 2.5 }), RangeError);
});

test("AC7: CLI prints tip, total and shares and exits 0", () => {
  const r = runCli(["347", "--dricks", "10", "--personer", "3"]);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split(/\r?\n/).filter((l) => l.trim() !== "");
  assert.deepStrictEqual(lines, [
    "Dricks: 35 kr",
    "Totalt: 382 kr",
    "Per person: 128, 127, 127 kr",
  ]);
});

test("AC8: CLI exits 1 with stderr message for invalid input", () => {
  for (const args of [["abc"], ["100", "--personer", "0"]]) {
    const r = runCli(args);
    assert.equal(r.status, 1, `args=${args.join(" ")}`);
    assert.ok(r.stderr.trim().length > 0, `args=${args.join(" ")} stderr empty`);
  }
});
