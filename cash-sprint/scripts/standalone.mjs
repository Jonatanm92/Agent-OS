#!/usr/bin/env node
// Wraps app/index.html in a full HTML document so it can be opened straight from disk.
// The published Kassasprint artifact gets this wrapper from the host; a local copy needs it here.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const body = readFileSync(join(root, 'app', 'index.html'), 'utf8');
const head = '<!doctype html><html lang="sv"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'kassasprint.html');
writeFileSync(out, head + body + '</body></html>\n');
console.log(`Skrev ${out}. Öppna filen i webbläsaren. Data sparas då bara i den webbläsaren.`);
