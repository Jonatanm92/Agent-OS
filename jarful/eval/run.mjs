#!/usr/bin/env node
// Measures AI-import quality and cost per model on realistic captions.
//   ANTHROPIC_API_KEY=... node eval/run.mjs claude-opus-5 claude-haiku-4-5
// Score = share of expected ingredients present in the extracted list (substring match),
// plus whether non-recipes are correctly rejected. Each run costs a few cents.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRecipeWithClaude } from '../lib/ai.mjs';

// $ per million tokens (input, output), from the Claude API pricing table.
const PRICE = { 'claude-opus-5': [5, 25], 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5': [1, 5], 'claude-opus-5-5': [4, 20] };
const cases = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'cases.json'), 'utf8'));
const models = process.argv.slice(2).length ? process.argv.slice(2) : ['claude-opus-5', 'claude-haiku-4-5'];
const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ');

for (const model of models) {
  process.env.JARFUL_MODEL = model;
  let recallSum = 0, recipeCases = 0, rejectOk = 0, rejectCases = 0, cost = 0, calls = 0;
  const misses = [];
  for (const c of cases) {
    try {
      const { data, usage } = await extractRecipeWithClaude({ text: c.text });
      calls++;
      const [pin, pout] = PRICE[model] ?? [0, 0];
      cost += (usage.input_tokens * pin + usage.output_tokens * pout) / 1e6;
      if (c.notRecipe) { rejectCases++; if (!data.is_recipe) rejectOk++; continue; }
      recipeCases++;
      const got = norm(data.ingredients.join(' | '));
      const found = c.expect.filter((e) => got.includes(norm(e)));
      recallSum += found.length / c.expect.length;
      for (const e of c.expect) if (!found.includes(e)) misses.push(`${c.id}: ${e}`);
    } catch (err) { misses.push(`${c.id}: ERROR ${err.message}`); }
  }
  console.log(`\n${model}`);
  console.log(`  ingredient recall: ${(100 * recallSum / Math.max(recipeCases, 1)).toFixed(1)}%   non-recipe rejected: ${rejectOk}/${rejectCases}`);
  console.log(`  cost: $${cost.toFixed(4)} for ${calls} calls → ~$${(cost / Math.max(calls, 1)).toFixed(4)} per import`);
  if (misses.length) console.log(`  missed: ${misses.join('; ')}`);
}
