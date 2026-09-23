import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonLdRecipe, isoDurationToMinutes, normalizeRecipe, qualityFlags, assertPublicUrl, metaTag, importRecipe } from '../lib/importer.mjs';

const html = `<html><head><meta property="og:image" content="https://img.example/pasta.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},
{"@type":["Recipe"],"name":"One Pot Cajun Chicken &amp; Pasta","image":[{"url":"https://img.example/a.jpg"}],
"recipeYield":["4","4 servings"],"totalTime":"PT35M","recipeIngredient":["1 Tbsp cooking oil","2 cloves garlic, minced","8 oz penne pasta","1/2 cup heavy cream"],
"recipeInstructions":[{"@type":"HowToSection","name":"Cook","itemListElement":[{"@type":"HowToStep","text":"Heat the oil and garlic."},{"@type":"HowToStep","text":"Add pasta &amp; cream. Season with salt."}]}],
"recipeCategory":"Main Course","recipeCuisine":"Cajun","keywords":"pasta, one pot"}]}</script></head><body></body></html>`;

test('extracts schema.org Recipe from @graph with HowToSections', () => {
  const r = extractJsonLdRecipe(html);
  assert.equal(r.title, 'One Pot Cajun Chicken &amp; Pasta');
  assert.equal(r.servings, 4);
  assert.equal(r.totalMinutes, 35);
  assert.equal(r.ingredients.length, 4);
  assert.deepEqual(r.steps, ['Heat the oil and garlic.', 'Add pasta & cream. Season with salt.']);
  assert.equal(r.image, 'https://img.example/a.jpg');
  const n = normalizeRecipe(r, { method: 'structured' });
  assert.equal(n.title, 'One Pot Cajun Chicken & Pasta');
  assert.equal(n.steps[1], 'Add pasta & cream. Season with salt.');
  assert.ok(n.tags.includes('cajun'));
  assert.equal(n.ingredients[1].unit, 'clove');
});

test('flags ingredients used in steps but missing from the list', () => {
  const n = normalizeRecipe(extractJsonLdRecipe(html), {});
  assert.ok(n.flags.some((f) => f.includes('salt')), n.flags.join('|'));
  assert.deepEqual(qualityFlags({ ingredients: [{ name: 'salt' }, { name: 'flour' }], steps: ['Mix salt and flour.'] }), []);
});

test('iso durations', () => {
  assert.equal(isoDurationToMinutes('PT1H30M'), 90);
  assert.equal(isoDurationToMinutes('P0DT0H20M'), 20);
  assert.equal(isoDurationToMinutes('nonsense'), null);
});

test('reads meta tags', () => { assert.equal(metaTag(html, 'og:image'), 'https://img.example/pasta.jpg'); });

test('blocks private-network URLs (SSRF)', async () => {
  for (const u of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5', 'http://[::1]/', 'file:///etc/passwd', 'http://192.168.1.1']) {
    await assert.rejects(assertPublicUrl(u), undefined, u);
  }
});

test('AI imports are refused once the free allowance is used', async () => {
  await assert.rejects(importRecipe({ text: 'Mix 2 cups flour with 1 cup water and bake for 20 minutes.' }, { allowAi: false }), (e) => e.status === 402);
});
