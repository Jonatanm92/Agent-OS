#!/usr/bin/env node
import { splitBill } from "./index.js";

const USAGE = "Användning: node src/cli.js <belopp> [--dricks <procent>] [--personer <antal>]";

function parseNumber(raw, name) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new RangeError(`Saknat värde för ${name}`);
  }
  const normalized = raw.trim().replace(",", ".");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(normalized)) {
    throw new RangeError(`Ogiltigt tal för ${name}: ${raw}`);
  }
  return Number(normalized);
}

function parseArgs(argv) {
  let amount;
  let tipPercent = 10;
  let people = 1;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dricks") {
      tipPercent = parseNumber(argv[++i], "--dricks");
    } else if (arg === "--personer") {
      people = parseNumber(argv[++i], "--personer");
    } else if (arg.startsWith("--dricks=")) {
      tipPercent = parseNumber(arg.slice("--dricks=".length), "--dricks");
    } else if (arg.startsWith("--personer=")) {
      people = parseNumber(arg.slice("--personer=".length), "--personer");
    } else if (amount === undefined && !arg.startsWith("--")) {
      amount = parseNumber(arg, "belopp");
    } else {
      throw new RangeError(`Okänt argument: ${arg}`);
    }
  }
  if (amount === undefined) {
    throw new RangeError("Belopp saknas");
  }
  return { amount, tipPercent, people };
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    const { tip, total, shares } = splitBill(options);
    process.stdout.write(
      `Dricks: ${tip} kr\nTotalt: ${total} kr\nPer person: ${shares.join(", ")} kr\n`
    );
    return 0;
  } catch (err) {
    process.stderr.write(`Fel: ${err && err.message ? err.message : String(err)}\n${USAGE}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
