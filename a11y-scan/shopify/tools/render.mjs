/*
 * render.mjs — renders the ars-* Liquid sections into standalone HTML.
 *
 * WHY THIS EXISTS
 * There is no Shopify store connected to this environment, so the sections
 * cannot be previewed on a real storefront. This renders the *actual* .liquid
 * files (not a hand-written mock of them) against a fixture that stands in for
 * Shopify's product/settings objects, so mobile layout, no-JS behaviour and
 * accessibility can be checked against what will really ship.
 *
 * WHAT IT IS NOT
 * Not a Shopify emulator. Shopify-specific tags are implemented only as far as
 * these sections use them. Differences are listed in docs/08-known-limitations.md.
 *
 * Usage: node render-preview.mjs        (writes ../preview/*.html)
 */
import { Liquid } from 'liquidjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const themeDir = path.join(here, '..', 'theme');
const outDir = path.join(here, '..', 'preview');

const engine = new Liquid({
  root: [path.join(themeDir, 'snippets'), path.join(themeDir, 'sections')],
  extname: '.liquid',
  jsTruthy: true,
  // Shopify treats a missing variable as blank rather than throwing.
  strictVariables: false,
  strictFilters: false,
});

/* ---------------- Shopify tags these sections use ---------------- */

// {% schema %} ... {% endschema %} — configuration, renders nothing.
engine.registerTag('schema', {
  parse(token, remaining) {
    this.tokens = [];
    while (remaining.length) {
      const t = remaining.shift();
      if (t.name === 'endschema') return;
      this.tokens.push(t);
    }
  },
  render() { return ''; },
});

// {% form 'product', product, key: value %} ... {% endform %}
// Emits the same <form> Shopify emits for a product form.
engine.registerTag('form', {
  parse(token, remaining) {
    this.args = token.args;
    this.templates = [];
    const stream = this.liquid.parser.parseStream(remaining)
      .on('tag:endform', function () { this.stop(); })
      .on('template', (tpl) => this.templates.push(tpl))
      .on('end', () => { throw new Error('{% form %} not closed'); });
    stream.start();
  },
  *render(ctx, emitter) {
    // Pull the `key: value` attribute pairs out of the raw argument string.
    const attrs = {};
    const re = /([A-Za-z_][\w-]*)\s*:\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(this.args)) !== null) attrs[m[1]] = m[2];

    const parts = [
      'method="post"',
      'action="/cart/add"',
      'accept-charset="UTF-8"',
      `enctype="${attrs.enctype || 'application/x-www-form-urlencoded'}"`,
    ];
    if (attrs.id) parts.push(`id="${attrs.id}"`);
    if (attrs.class) parts.push(`class="${attrs.class}"`);

    emitter.write(`<form ${parts.join(' ')}>`);
    // Shopify injects this on every form; included so the preview markup matches.
    emitter.write('<input type="hidden" name="form_type" value="product">');
    emitter.write('<input type="hidden" name="utf8" value="✓">');
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    emitter.write('</form>');
  },
});

/* ---------------- Shopify filters these sections use ---------------- */

const filters = {
  money: (v) => `${(Number(v) / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr`,
  handle: (v) => String(v ?? '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  handleize: (v) => filters.handle(v),
  newline_to_br: (v) => String(v ?? '').replace(/\r?\n/g, '<br />'),
  asset_url: (v) => `/assets/${v}`,
  image_url: (v) => (v && v.src) ? v.src : '',
  stylesheet_tag: (v) => `<link rel="stylesheet" href="${v}">`,
  script_tag: (v) => `<script src="${v}"><\/script>`,
  // Shopify's `escape` is HTML-entity escaping.
  escape: (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
};
for (const [name, fn] of Object.entries(filters)) engine.registerFilter(name, fn);

/* ---------------- fixtures standing in for Shopify globals ---------------- */

function makeProduct({ handle, title, price, tags }) {
  return {
    id: 111, handle, title, price, tags,
    available: true,
    url: `/products/${handle}`,
    variants: [{ id: 4242, title: 'Default', price, available: true }],
    selected_or_first_available_variant: { id: 4242, title: 'Default', price, available: true },
  };
}

const SCAN = makeProduct({
  handle: 'accessibility-risk-scan',
  title: 'E-commerce Accessibility Risk Scan',
  // 2 490 SEK excluding VAT. Shopify stores minor units.
  price: 249000,
  tags: ['service', 'accessibility'],
});

const allProducts = { [SCAN.handle]: SCAN };

/* ---------------- render one JSON template ---------------- */

async function renderTemplate(templateFile, { product = null, title }) {
  const tpl = JSON.parse(fs.readFileSync(path.join(themeDir, 'templates', templateFile), 'utf8'));
  const chunks = [];

  for (const key of tpl.order) {
    const def = tpl.sections[key];
    const src = fs.readFileSync(path.join(themeDir, 'sections', `${def.type}.liquid`), 'utf8');

    const blocks = (def.block_order || []).map((id) => ({
      id,
      type: def.blocks[id].type,
      settings: def.blocks[id].settings || {},
      shopify_attributes: '',
    }));

    const section = {
      id: key,
      settings: def.settings || {},
      blocks,
      // liquidjs has no Shopify "drop", so expose .size the way Liquid does.
      block_size: blocks.length,
    };
    // `section.blocks.size` in Liquid maps to array length; attach it explicitly.
    Object.defineProperty(section.blocks, 'size', { value: blocks.length, enumerable: false });

    chunks.push(await engine.parseAndRender(src, {
      section,
      product,
      all_products: allProducts,
      settings: {},
    }));
  }

  // Rendered as a complete, valid document: our own scanner is pointed at these
  // files as part of the acceptance evidence, so the wrapper must not introduce
  // defects the real theme would not have.
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{margin:0;padding:0;background:#ffffff;}</style>
</head>
<body>
<main>
${chunks.join('\n')}
</main>
</body>
</html>`;
}

/* ---------------- rewrite Shopify asset paths to local files ---------------- */

function localizeAssets(html) {
  return html.replace(/\/assets\//g, '../theme/assets/');
}

fs.mkdirSync(outDir, { recursive: true });

const jobs = [
  ['product.accessibility-scan.json', 'service-page.html',
   { product: SCAN, title: 'E-commerce Accessibility Risk Scan' }],
  ['index.json', 'home.html', { product: null, title: 'Accessibility Risk Scan' }],
];

for (const [tplFile, outFile, opts] of jobs) {
  const html = localizeAssets(await renderTemplate(tplFile, opts));
  fs.writeFileSync(path.join(outDir, outFile), html);
  console.log(`  wrote preview/${outFile}  (${(html.length / 1024).toFixed(1)} KB)`);
}
console.log('done');
