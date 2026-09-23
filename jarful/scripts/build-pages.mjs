#!/usr/bin/env node
// Generates the static SEO and legal pages in public/. Run: node scripts/build-pages.mjs
// Edit the PAGES array, not the generated HTML.
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CTA = `<p><a class="btn" href="/#start">Start free — no card, no trial</a></p>`;
const FOOT = `<footer class="muted small"><a href="/">Jarful</a> · <a href="/save-tiktok-recipes.html">Save TikTok recipes</a> · <a href="/save-instagram-recipes.html">Save Instagram recipes</a> · <a href="/meal-planner-with-grocery-list.html">Meal planner</a> · <a href="/recipe-app-without-subscription.html">No weekly subscription</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></footer>`;

export const PAGES = [
  {
    file: 'save-tiktok-recipes.html',
    title: 'Save TikTok recipes to one list — Jarful',
    description: 'Paste a TikTok link and Jarful pulls the ingredients and steps out of the caption, flags anything missing, and adds it to your weekly grocery list.',
    h1: 'Save TikTok recipes before they disappear into your likes',
    body: `<p>You liked it, you screenshotted it, and now you can't find it. Jarful turns a TikTok recipe into a real recipe card in a few seconds.</p>
<h2>How it works</h2>
<ol><li>On TikTok tap <b>Share → Copy link</b>.</li><li>In Jarful tap <b>+ Add recipe</b> and paste. On Android you can share straight to Jarful.</li><li>Jarful reads the caption, writes the ingredient list and steps, and <b>checks the steps against the ingredients</b> so nothing is missing.</li></ol>
<h2>Why people switch to Jarful</h2>
<ul><li><b>No weekly import cap.</b> 20 AI imports a month free, and recipe websites import free and unlimited.</li><li><b>No ads, no paywall to try.</b></li><li><b>One grocery list for the household.</b> Plan the week and the list builds itself, merged and sorted by aisle.</li></ul>`,
  },
  {
    file: 'save-instagram-recipes.html',
    title: 'Save Instagram recipes (Reels & posts) — Jarful',
    description: 'Copy an Instagram recipe caption, paste it into Jarful and get a clean ingredient list, steps and a shared grocery list.',
    h1: 'Save Instagram recipes as real, cookable recipes',
    body: `<p>Instagram's saved folder is where recipes go to be forgotten. Jarful turns a Reel or post caption into a recipe you can scale, cook from and shop for.</p>
<h2>How it works</h2>
<ol><li>Long-press the caption and copy it, or copy the post link.</li><li>Paste it into Jarful under <b>Text</b>.</li><li>Get ingredients, steps and servings, ready to add to this week's plan.</li></ol>
<p>Recipe in a photo or a cookbook? Use <b>Photo</b>. Handwritten family recipe cards work too.</p>`,
  },
  {
    file: 'meal-planner-with-grocery-list.html',
    title: 'Free meal planner with a shared grocery list — Jarful',
    description: 'Plan the week from recipes you already love. Jarful merges ingredients across recipes, converts units and sorts the list by aisle for the whole household.',
    h1: 'A meal planner that writes your grocery list for you',
    body: `<p>Pick dinners from your own saved recipes, not a random AI menu. Jarful combines every ingredient into one list: <b>2 tbsp + ¼ cup olive oil becomes ⅜ cup</b>, and three recipes' eggs become one line.</p>
<ul><li>Sorted by aisle: produce, meat, dairy, pantry.</li><li>Scale any recipe to the servings you're cooking.</li><li>Share with your household using one invite code, free. Ticks sync live in the store.</li><li>Works offline in the kitchen.</li></ul>`,
  },
  {
    file: 'recipe-app-without-subscription.html',
    title: 'A recipe app without weekly subscriptions or ads — Jarful',
    description: 'Tired of $10-a-week recipe apps, import limits and surprise renewals? Jarful is free to use, $2.99/month or $39 once for Pro. Cancel in one tap.',
    h1: 'The recipe app that doesn’t charge you by the week',
    body: `<p>We read thousands of App Store reviews of the top recipe apps. The same complaints kept coming up: import caps, new ads, paywalls before you can try anything, trial reminders that never came, and no way to share with your partner. So we built the opposite.</p>
<table><thead><tr><th></th><th>Typical recipe app</th><th>Jarful</th></tr></thead><tbody>
<tr><td>Try before paying</td><td>Paywall during onboarding</td><td>Full app, no card</td></tr>
<tr><td>Imports</td><td>~5 per week free</td><td>Websites unlimited; 20 AI imports / month free</td></tr>
<tr><td>Ads</td><td>Increasingly</td><td>None</td></tr>
<tr><td>Household sharing</td><td>Paid or missing</td><td>Free</td></tr>
<tr><td>Price</td><td>$40–$120 / year</td><td>$2.99 / mo, $19.99 / yr, or $39 once</td></tr>
<tr><td>Cancel</td><td>Hunt through settings</td><td>One tap, 14-day refunds</td></tr>
<tr><td>Your data</td><td>Locked in</td><td>One-tap export</td></tr></tbody></table>`,
  },
  {
    file: 'privacy.html',
    title: 'Privacy policy — Jarful',
    description: 'What Jarful stores, why, and how to delete it.',
    h1: 'Privacy policy',
    legal: true,
    body: `<p class="flags"><b>Template.</b> Replace the bracketed parts and have it reviewed for your jurisdiction before launch.</p>
<p>Last updated: [DATE]. Jarful is operated by [COMPANY NAME], [ADDRESS] ("we"). Contact: [EMAIL].</p>
<h2>What we store</h2><ul>
<li><b>Your kitchen:</b> the recipes, notes, meal plans and grocery lists you create, the display names you enter, and the kitchen's invite code.</li>
<li><b>Sign-in:</b> a random device key stored in your browser. We keep only a one-way hash of it. We don't ask for your email or phone number.</li>
<li><b>Usage counts:</b> how many AI imports your kitchen used this month, to apply the free-plan limit.</li>
<li><b>Payments:</b> handled by Stripe. We receive a Stripe customer and subscription ID and never see your card number.</li></ul>
<h2>Service providers</h2><ul>
<li><b>Anthropic</b> processes the text or photo you send for an AI import to extract the recipe.</li>
<li><b>Stripe</b> processes payments.</li>
<li><b>[HOSTING PROVIDER]</b> hosts the service.</li></ul>
<p>When you import a link we fetch that public page from our server. We don't sell personal data and we don't use advertising trackers.</p>
<h2>Your choices</h2><ul><li><b>Export:</b> Kitchen → Export everything.</li><li><b>Delete:</b> Kitchen → Delete my kitchen permanently removes the kitchen and all its data for every member.</li><li>For other requests (access, correction, portability), email [EMAIL].</li></ul>
<h2>Retention</h2><p>Data is kept until you delete your kitchen. Backups are overwritten within [30] days.</p>
<h2>Children</h2><p>Jarful is not directed at children under 13 (or the minimum age in your country).</p>`,
  },
  {
    file: 'terms.html',
    title: 'Terms of service — Jarful',
    description: 'The terms for using Jarful.',
    h1: 'Terms of service',
    legal: true,
    body: `<p class="flags"><b>Template.</b> Replace the bracketed parts and have it reviewed for your jurisdiction before launch.</p>
<p>Last updated: [DATE]. These terms are between you and [COMPANY NAME] ("we").</p>
<h2>The service</h2><p>Jarful lets you save, organize and plan recipes and share them with your household. Imports are provided as-is: always check ingredients, quantities, allergens and cooking temperatures against the source.</p>
<h2>Your content</h2><p>You keep your rights to what you save. Only import recipes for your personal use and respect the original creators; links to the source are kept on every imported recipe.</p>
<h2>Plans and payment</h2><ul><li>Free plan: as described on the site, including a monthly AI-import allowance that may change with notice.</li><li>Pro: monthly or yearly subscriptions renew automatically until cancelled, and you can cancel any time from Kitchen → Manage or cancel. Lifetime Pro is a one-time payment for the life of the service.</li><li>Refunds: any payment within 14 days, on request to [EMAIL].</li></ul>
<h2>Acceptable use</h2><p>Don't abuse the service: no automated bulk importing, attacks, or attempts to access other kitchens.</p>
<h2>Liability</h2><p>To the extent allowed by law, the service is provided "as is" and our liability is limited to the amount you paid in the last 12 months.</p>
<h2>Changes and contact</h2><p>We'll post changes here and notify you in the app for material changes. Contact [EMAIL].</p>`,
  },
];

const html = (p) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="/og.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css">
${p.legal ? '<meta name="robots" content="noindex">' : ''}
</head><body><main class="wrap page">
<a class="brand-link" href="/"><img src="/icon.svg" alt="" width="32" height="32"> Jarful</a>
<h1>${esc(p.h1)}</h1>
${p.body}
${p.legal ? '' : CTA}
${FOOT}
</main></body></html>
`;

for (const p of PAGES) await writeFile(join(PUBLIC, p.file), html(p));
console.log(`wrote ${PAGES.length} pages`);
