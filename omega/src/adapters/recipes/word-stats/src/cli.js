#!/usr/bin/env node
import { textStats, topWords } from './index.js';

const text = process.argv.slice(2).join(' ');
if (text.trim() === '') {
  console.error('usage: node src/cli.js <text...>');
  process.exit(1);
}
console.log(JSON.stringify({ ...textStats(text), top: topWords(text, 3) }));
