import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, formatQty, buildGroceryList, keyName, aisleFor } from '../lib/ingredients.mjs';

test('parses mixed numbers, unicode fractions, units and notes', () => {
  assert.deepEqual(pick(parseIngredient('1 1/2 cups (360 ml) whole milk, warmed')), { qty: 1.5, unit: 'cup', name: 'whole milk', note: 'warmed' });
  assert.deepEqual(pick(parseIngredient('½ tsp salt')), { qty: 0.5, unit: 'tsp', name: 'salt', note: '' });
  assert.deepEqual(pick(parseIngredient('1½ lbs chicken thighs')), { qty: 1.5, unit: 'lb', name: 'chicken thighs', note: '' });
  assert.deepEqual(pick(parseIngredient('2-3 cloves garlic, minced')), { qty: 3, unit: 'clove', name: 'garlic', note: 'minced' });
  assert.deepEqual(pick(parseIngredient('3 large eggs')), { qty: 3, unit: null, name: 'large eggs', note: '' });
  assert.deepEqual(pick(parseIngredient('Salt and pepper to taste')), { qty: null, unit: null, name: 'salt and pepper to taste', note: '' });
  assert.equal(parseIngredient('2 T butter').unit, 'tbsp');
  assert.equal(parseIngredient('1 can (14 oz) coconut milk').unit, 'can');
});

test('does not treat words as units without a quantity', () => {
  assert.equal(parseIngredient('c ilantro leaves').unit, null);
  assert.equal(parseIngredient('cups of love').unit, 'cup'); // explicit unit words still parse
});

test('formats friendly quantities', () => {
  assert.equal(formatQty(1.5), '1 ½');
  assert.equal(formatQty(0.333), '⅓');
  assert.equal(formatQty(2), '2');
  assert.equal(formatQty(12.4), '12');
});

test('merges the same ingredient across recipes and converts units', () => {
  const items = [
    { ingredient: parseIngredient('2 tbsp olive oil'), recipeTitle: 'A' },
    { ingredient: parseIngredient('1/4 cup olive oil'), recipeTitle: 'B' },
    { ingredient: parseIngredient('2 eggs'), recipeTitle: 'A' },
    { ingredient: parseIngredient('1 large egg'), recipeTitle: 'B' },
    { ingredient: parseIngredient('salt'), recipeTitle: 'B' },
  ];
  const list = buildGroceryList(items);
  const oil = list.find((i) => i.name === 'olive oil');
  assert.equal(oil.unit, 'cup');
  assert.ok(Math.abs(oil.qty - 0.375) < 0.01, `oil qty ${oil.qty}`);
  assert.deepEqual(oil.sources.sort(), ['A', 'B']);
  const eggs = list.find((i) => keyName(i.name) === 'egg');
  assert.equal(eggs.qty, 3);
  assert.equal(eggs.aisle, 'Dairy & Eggs');
  assert.equal(list.find((i) => i.name === 'salt').qty, null);
});

test('assigns aisles', () => {
  assert.equal(aisleFor('red onion'), 'Produce');
  assert.equal(aisleFor('chicken thighs'), 'Meat & Seafood');
  assert.equal(aisleFor('all-purpose flour'), 'Pantry');
  assert.equal(aisleFor('frozen peas'), 'Produce'); // first match wins; peas are produce-adjacent
});

function pick({ qty, unit, name, note }) { return { qty, unit, name, note }; }

test('shelf-stable spices and cans go to Pantry, fresh stays in Produce', () => {
  for (const n of ['black pepper', 'cayenne pepper', 'garlic powder', 'onion powder', 'fire roasted diced tomatoes', 'chicken broth']) assert.equal(aisleFor(n), 'Pantry', n);
  assert.equal(aisleFor('thyme', 'tsp'), 'Pantry');
  assert.equal(aisleFor('thyme', 'bunch'), 'Produce');
  assert.equal(aisleFor('bell peppers'), 'Produce');
  assert.equal(parseIngredient('3 green onions*, sliced').name, 'green onions');
});
