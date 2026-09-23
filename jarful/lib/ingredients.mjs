// Ingredient line parsing, scaling and grocery-list merging. Pure functions, no I/O.

const UNICODE_FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

// Canonical unit -> aliases. Units in the same `dim` merge after conversion to `base`.
const UNITS = {
  tsp:   { dim: 'vol', base: 4.92892, aliases: ['tsp', 'tsps', 'teaspoon', 'teaspoons', 't'] },
  tbsp:  { dim: 'vol', base: 14.7868, aliases: ['tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tbs', 'tbl', 'T'] },
  cup:   { dim: 'vol', base: 236.588, aliases: ['cup', 'cups', 'c'] },
  floz:  { dim: 'vol', base: 29.5735, aliases: ['fl oz', 'fluid ounce', 'fluid ounces'] },
  ml:    { dim: 'vol', base: 1, aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
  l:     { dim: 'vol', base: 1000, aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
  g:     { dim: 'mass', base: 1, aliases: ['g', 'gram', 'grams', 'gr'] },
  kg:    { dim: 'mass', base: 1000, aliases: ['kg', 'kilogram', 'kilograms'] },
  oz:    { dim: 'mass', base: 28.3495, aliases: ['oz', 'ounce', 'ounces'] },
  lb:    { dim: 'mass', base: 453.592, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  clove: { dim: 'clove', base: 1, aliases: ['clove', 'cloves'] },
  can:   { dim: 'can', base: 1, aliases: ['can', 'cans'] },
  pinch: { dim: 'pinch', base: 1, aliases: ['pinch', 'pinches'] },
  slice: { dim: 'slice', base: 1, aliases: ['slice', 'slices'] },
  bunch: { dim: 'bunch', base: 1, aliases: ['bunch', 'bunches'] },
  package: { dim: 'package', base: 1, aliases: ['package', 'packages', 'pkg', 'packet', 'packets'] },
};
const ALIAS = new Map();
for (const [unit, def] of Object.entries(UNITS)) for (const a of def.aliases) ALIAS.set(a, unit);

function parseNumber(token) {
  if (!token) return null;
  let t = token.trim();
  let total = 0;
  for (const [ch, v] of Object.entries(UNICODE_FRACTIONS)) {
    if (t.endsWith(ch)) { total += v; t = t.slice(0, -ch.length).trim(); }
  }
  if (!t) return total || null;
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? total + a / b : null; }
  if (/^\d+(\.\d+)?$/.test(t)) return total + Number(t);
  return null;
}

// "1 1/2 cups (360 ml) whole milk, warmed" -> { qty: 1.5, unit: 'cup', name: 'whole milk', note: 'warmed', raw }
export function parseIngredient(raw) {
  const line = String(raw).replace(/\s+/g, ' ').trim();
  let rest = line.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  let qty = null;

  // quantity: "1 1/2", "1½", "1/2", "2-3" (take upper bound), "1.5"
  const numRx = /^((?:\d+\s+)?\d+\/\d+|\d*[½⅓⅔¼¾⅕⅛⅜⅝⅞]|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*((?:\d+\s+)?\d+\/\d+|\d*[½⅓⅔¼¾⅕⅛⅜⅝⅞]|\d+(?:\.\d+)?))?\s*/;
  const m = rest.match(numRx);
  if (m) {
    const first = m[1].includes(' ') && m[1].includes('/') ? m[1].split(/\s+/).reduce((s, p) => s + (parseNumber(p) ?? 0), 0) : parseNumber(m[1]);
    const second = m[2] ? (m[2].includes(' ') ? m[2].split(/\s+/).reduce((s, p) => s + (parseNumber(p) ?? 0), 0) : parseNumber(m[2])) : null;
    qty = second ?? first;
    rest = rest.slice(m[0].length);
  }

  let unit = null;
  const um = rest.match(/^(fl\.? oz|fluid ounces?|[A-Za-z]+)\.?\s+(?:of\s+)?/);
  if (um) {
    const word = um[1].replace('.', '');
    const key = ALIAS.has(word) ? word : word.toLowerCase();
    // "T" is tablespoon only when capitalized; "t"/"c" only count as units after a number.
    if (ALIAS.has(key) && (qty !== null || key.length > 1)) { unit = ALIAS.get(key); rest = rest.slice(um[0].length); }
  }

  let name = rest;
  let note = '';
  const comma = rest.indexOf(',');
  if (comma > 0) { name = rest.slice(0, comma); note = rest.slice(comma + 1).trim(); }
  name = name.replace(/^(of\s+)/i, '').replace(/[*†‡]+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return { qty, unit, name, note, raw: line };
}

// Things you buy whole: scaled amounts round up (4.5 cloves -> 5), count items to the nearest half.
export const DISCRETE_UNITS = new Set(['clove', 'can', 'slice', 'package', 'bunch', 'pinch']);
export function roundScaled(qty, unit) {
  if (qty === null) return null;
  if (DISCRETE_UNITS.has(unit)) return Math.max(1, Math.ceil(qty - 0.05));
  if (!unit) return Math.max(0.5, Math.round(qty * 2) / 2);
  return qty;
}

export function scaleIngredient(ing, factor) {
  if (ing.qty === null || factor === 1) return { ...ing };
  return { ...ing, qty: roundScaled(ing.qty * factor, ing.unit) };
}

const PLURAL = { cup: 'cups', clove: 'cloves', can: 'cans', slice: 'slices', bunch: 'bunches', package: 'packages', pinch: 'pinches' };
export const unitLabel = (unit, qty) => (unit === 'floz' ? 'fl oz' : qty > 1 && PLURAL[unit] ? PLURAL[unit] : unit ?? '');

const NICE = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞']];
export function formatQty(q) {
  if (q === null || q === undefined) return '';
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  if (frac < 0.04) return String(whole || '');
  if (frac > 0.96) return String(whole + 1);
  if (whole >= 10) return String(Math.round(q));
  const [, sym] = NICE.reduce((best, cur) => (Math.abs(cur[0] - frac) < Math.abs(best[0] - frac) ? cur : best));
  return whole ? `${whole} ${sym}` : sym;
}

export function formatIngredient(ing) {
  const q = formatQty(ing.qty);
  return [q, unitLabel(ing.unit, ing.qty), ing.name].filter(Boolean).join(' ') + (ing.note ? `, ${ing.note}` : '');
}

// Grocery aisles, first match wins. Keeps the list walkable in a real store.
const AISLES = [
  // Shelf-stable versions of produce words must win before Produce does.
  ['Pantry', /\b(salt|powder|dried|flakes|ground (cumin|coriander|cinnamon|ginger|nutmeg|cloves|black pepper)|black pepper|white pepper|cayenne|peppercorn|paprika|seasoning|bouillon|canned|diced tomatoes|crushed tomatoes|tomato (paste|sauce|puree)|sun-dried|broth|stock|salsa)\b/],
  ['Produce', /\b(onion|garlic|shallot|tomato|potato|carrot|celery|pepper(?!corn)|lettuce|spinach|kale|cabbage|broccoli|cauliflower|zucchini|squash|cucumber|mushroom|avocado|lemon|lime|orange|apple|banana|berr|grape|herb|cilantro|parsley|basil|mint|dill|thyme|rosemary|ginger|scallion|green onion|leek|corn|pea(s)?\b|bean sprout|jalape|chile|chili pepper|fruit|arugula|eggplant|sweet potato)/],
  ['Meat & Seafood', /\b(chicken|beef|pork|lamb|turkey|bacon|sausage|ham|steak|ground|shrimp|salmon|tuna|fish|cod|prawn|chorizo|prosciutto|meat)/],
  ['Dairy & Eggs', /\b(milk|butter|cream|cheese|yogurt|yoghurt|egg|parmesan|mozzarella|cheddar|feta|ricotta|sour cream|half-and-half|buttermilk)/],
  ['Bakery', /\b(bread|bun|tortilla|pita|baguette|roll|naan|croissant)/],
  ['Frozen', /\bfrozen\b/],
  ['Pantry', /\b(flour|sugar|salt|pepper|oil|vinegar|rice|pasta|noodle|spaghetti|bean|lentil|chickpea|stock|broth|sauce|paste|honey|syrup|oat|baking|yeast|vanilla|cocoa|chocolate|spice|cumin|paprika|cinnamon|oregano|chili powder|curry|soy|mustard|ketchup|mayo|nut|almond|peanut|seed|can|tomatoes, canned|cornstarch|breadcrumb|coconut)/],
];
const SPOON = new Set(['tsp', 'tbsp', 'pinch']);
const HERB = /^(thyme|oregano|rosemary|basil|parsley|dill|sage|mint|cilantro|tarragon|marjoram)$/;
export function aisleFor(name, unit = null) {
  const n = name.toLowerCase();
  // "1 tsp thyme" is the dried jar; "1 bunch thyme" is fresh.
  if (unit && SPOON.has(unit) && HERB.test(n.trim()) && !/\bfresh\b/.test(n)) return 'Pantry';
  for (const [aisle, rx] of AISLES) if (rx.test(n)) return aisle;
  return 'Other';
}

// Normalise names so "large eggs" and "egg" merge.
export function keyName(name) {
  return name.toLowerCase()
    .replace(/\b(fresh|large|small|medium|chopped|diced|minced|sliced|finely|roughly|boneless|skinless|ripe|to taste|optional|packed|softened|melted|room temperature)\b/g, '')
    .replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/(ies)$/, 'y').replace(/(oes)$/, 'o').replace(/([^s])s$/, '$1');
}

// items: [{ ingredient: parsedIngredient, recipeTitle }] -> [{ aisle, name, qty, unit, sources[] , items }]
export function buildGroceryList(items) {
  const groups = new Map();
  for (const { ingredient, recipeTitle } of items) {
    const k = keyName(ingredient.name);
    if (!k) continue;
    const dim = ingredient.unit ? UNITS[ingredient.unit].dim : 'count';
    const gk = `${k}|${dim}`;
    const g = groups.get(gk) ?? { key: gk, name: ingredient.name, dim, unit: ingredient.unit, total: 0, unknownQty: false, sources: new Set() };
    if (ingredient.qty === null) g.unknownQty = true;
    else if (dim === 'count') g.total += ingredient.qty;
    else if (g.unit === ingredient.unit) g.total += ingredient.qty;
    else {
      // convert both to base, keep the larger unit for display
      const inBase = g.total * UNITS[g.unit].base + ingredient.qty * UNITS[ingredient.unit].base;
      const unit = UNITS[ingredient.unit].base > UNITS[g.unit].base ? ingredient.unit : g.unit;
      g.unit = unit; g.total = inBase / UNITS[unit].base;
    }
    if (recipeTitle) g.sources.add(recipeTitle);
    groups.set(gk, g);
  }
  return [...groups.values()].map((g) => ({
    key: g.key, aisle: aisleFor(g.name, g.unit), name: g.name,
    qty: g.total ? +g.total.toFixed(3) : null, unit: g.dim === 'count' ? null : g.unit,
    plusSome: g.unknownQty && g.total > 0, sources: [...g.sources],
    label: formatIngredient({ qty: g.total || null, unit: g.dim === 'count' ? null : g.unit, name: g.name, note: '' }) + (g.unknownQty && g.total ? ' (+ some)' : ''),
  })).sort((a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name));
}
const AISLE_ORDER = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen', 'Other'];
