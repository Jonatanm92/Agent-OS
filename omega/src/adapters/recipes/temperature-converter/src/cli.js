#!/usr/bin/env node
import { convert } from './index.js';

const USAGE = 'usage: node src/cli.js <value> <C|F|K> <C|F|K>';
const [raw, from, to] = process.argv.slice(2);
const units = ['C', 'F', 'K'];

if (raw === undefined || !units.includes(from) || !units.includes(to) || raw.trim() === '' || Number.isNaN(Number(raw))) {
  console.error(USAGE);
  process.exit(1);
}

try {
  console.log(`${convert(Number(raw), from, to)} ${to}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
