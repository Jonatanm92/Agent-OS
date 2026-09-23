// Jarful client — vanilla JS, hash routing, no build step.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const TOKEN_KEY = 'jarful.token';
// Native (Capacitor) builds bundle these files and call the hosted API; see native/README.md.
const API_BASE = (window.JARFUL_CONFIG?.apiBase ?? '').replace(/\/$/, '');
const NATIVE = Boolean(window.JARFUL_CONFIG?.native);
const WEB_ORIGIN = API_BASE || location.origin;

const state = {
  token: safeGet(TOKEN_KEY), me: null, config: null, recipes: [], query: '', tag: null,
  weekFrom: mondayOf(new Date()), servings: {},
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } }
function mondayOf(d) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); return x.toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const todayIso = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10); };

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }

async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}), ...(opts.headers ?? {}) }, body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) { signOut(); throw new Error('Please sign in again.'); }
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}

function signOut() { state.token = null; state.me = null; safeSet(TOKEN_KEY, null); location.hash = ''; render(); }

// ---------- icons ----------
const ICON = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
};

// Broken recipe photos disappear instead of showing a broken-image icon (CSP forbids inline onerror).
document.addEventListener('error', (e) => { if (e.target?.matches?.('img[data-hide-on-error]')) e.target.remove(); }, true);

// ---------- routing ----------
window.addEventListener('hashchange', render);
function route() { const [, view = 'recipes', id] = location.hash.split('/'); return { view, id }; }
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

async function boot() {
  if (!NATIVE && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  state.config = await api('/api/config').catch(() => ({ aiAvailable: false, freeAiImports: 20, prices: {} }));
  const params = new URLSearchParams(location.search);
  state.pendingJoin = params.get('join');
  if (params.get('ref')) safeSet('jarful.ref', params.get('ref'));
  const shared = params.get('url') || params.get('text') || params.get('title');
  if (shared) state.pendingShare = { url: (params.get('url') || (params.get('text') ?? '').match(/https?:\/\/\S+/)?.[0] || ''), text: [params.get('title'), params.get('text')].filter(Boolean).join('\n') };
  if (params.get('upgraded')) state.justUpgraded = true;
  if (params.toString()) history.replaceState(null, '', location.pathname + location.hash);
  if (state.token) await loadAll().catch(() => {});
  render();
  if (state.token && state.pendingShare) { openAddSheet(state.pendingShare); state.pendingShare = null; }
  if (state.justUpgraded) toast('Thank you! Pro unlocks as soon as payment confirms.');
}

async function loadAll() {
  const [me, r] = await Promise.all([api('/api/me'), api('/api/recipes')]);
  state.me = me; state.recipes = r.recipes;
}

function render() {
  if (!state.token) return renderLanding();
  const { view, id } = route();
  const views = { recipes: renderRecipes, recipe: () => renderRecipe(id), plan: renderPlan, grocery: renderGrocery, kitchen: renderKitchen };
  (views[view] ?? renderRecipes)();
  renderTabs(view === 'recipe' ? 'recipes' : view);
}

function renderTabs(active) {
  const tabs = [['recipes', 'Recipes', ICON.book], ['plan', 'Plan', ICON.cal], ['grocery', 'Groceries', ICON.cart], ['kitchen', 'Kitchen', ICON.home]];
  const nav = document.createElement('nav');
  nav.className = 'tabs';
  nav.innerHTML = tabs.map(([k, label, icon]) => `<button data-go="#/${k}" ${active === k ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('');
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });
  app.append(nav);
}

// ---------- landing ----------
function renderLanding() {
  const p = state.config?.prices ?? {};
  app.innerHTML = `<div class="wrap">
    <section class="hero">
      <div class="brand"><img src="/icon.svg" alt="">Jarful</div>
      <h1>Every recipe you've saved, finally in one place.</h1>
      <p class="muted" style="font-size:1.1rem">Paste a TikTok, Instagram, YouTube or website link — or snap a cookbook page. Jarful pulls out the ingredients and steps, plans your week and builds one grocery list your whole household can shop from.</p>
    </section>
    <div class="card stack" id="start">
      ${state.pendingJoin ? `
        <h2>Join your household's kitchen</h2>
        <div><label for="jname">Your name</label><input id="jname" type="text" placeholder="e.g. Sam" autocomplete="given-name"></div>
        <div><label for="jcode">Invite code</label><input id="jcode" type="text" value="${esc(state.pendingJoin)}" autocapitalize="characters"></div>
        <button class="btn block" id="join">Join kitchen</button>
        <button class="btn ghost block" id="nojoin">Start my own kitchen instead</button>` : `
        <h2>Start your kitchen — free</h2>
        <div><label for="mname">Your name</label><input id="mname" type="text" placeholder="e.g. Alex" autocomplete="given-name"></div>
        <button class="btn block" id="create">Start free — no card, no trial</button>
        <details><summary class="muted small">Have an invite code?</summary><div class="row" style="margin-top:8px"><input id="jcode" type="text" placeholder="ABC123" autocapitalize="characters"><button class="btn secondary" id="join">Join</button></div></details>`}
    </div>
    <div class="promises">
      <div class="promise"><b>No weekly subscriptions. Ever.</b><span class="muted small">Free forever for the basics. Pro is ${esc(p.monthly ?? '$2.99 / month')}, or pay once.</span></div>
      <div class="promise"><b>Unlimited website imports</b><span class="muted small">Recipe blogs import free, no caps. ${state.config?.freeAiImports ?? 20} AI imports a month from social, text and photos on the free plan.</span></div>
      <div class="promise"><b>No ads. No paywall to try.</b><span class="muted small">You're using the full app in 10 seconds — no account wall, no card.</span></div>
      <div class="promise"><b>Share with your household, free</b><span class="muted small">One invite code. Everyone sees the same plan and list, live.</span></div>
      <div class="promise"><b>Missing-ingredient check</b><span class="muted small">We cross-check steps against the ingredient list and flag anything that looks off.</span></div>
      <div class="promise"><b>Your data is yours</b><span class="muted small">One-tap export of everything, any time. Works offline in the kitchen.</span></div>
    </div>
    <h2>Simple pricing</h2>
    <div class="price-grid">
      <div class="price"><div class="muted small">Free</div><div class="amt">$0</div><div class="small muted">Unlimited recipes & website imports, meal plan, shared grocery list, ${state.config?.freeAiImports ?? 20} AI imports / month</div></div>
      <div class="price best"><div class="muted small">Pro</div><div class="amt">${esc((p.monthly ?? '$2.99 / month').split(' ')[0])}<span class="small muted"> /mo</span></div><div class="small muted">Unlimited AI imports from TikTok, Instagram, YouTube, photos & handwritten cards. Or ${esc(p.yearly ?? '$19.99 / year')}.</div></div>
      <div class="price"><div class="muted small">Lifetime</div><div class="amt">${esc((p.lifetime ?? '$39').split(' ')[0])}</div><div class="small muted">Pay once, Pro forever. No renewals to remember.</div></div>
    </div>
    <p class="muted small" style="margin-top:24px">Cancel in one tap from the Kitchen tab. Stripe emails you before any yearly renewal. Refunds within 14 days, no questions asked.</p>
    <p class="muted small"><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="/save-tiktok-recipes.html">Save TikTok recipes</a> · <a href="/recipe-app-without-subscription.html">Recipe app without a weekly subscription</a></p>
  </div>`;
  const nameVal = () => ($('#mname') ?? $('#jname'))?.value.trim();
  $('#create')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const r = await api('/api/household', { method: 'POST', body: { memberName: nameVal(), name: nameVal() ? `${nameVal()}'s kitchen` : undefined, ref: safeGet('jarful.ref') ?? undefined } }); safeSet('jarful.ref', null); await signedIn(r.token); if (r.household.bonusAiImports) toast(`Welcome! Your friend's link gave you ${r.household.bonusAiImports} extra AI imports a month.`); }
    catch (err) { toast(err.message); e.target.disabled = false; }
  });
  $('#join')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const r = await api('/api/join', { method: 'POST', body: { code: $('#jcode').value, memberName: nameVal() } }); await signedIn(r.token); toast(`Welcome to ${r.household.name}!`); }
    catch (err) { toast(err.message); e.target.disabled = false; }
  });
  $('#nojoin')?.addEventListener('click', () => { state.pendingJoin = null; renderLanding(); });
}

async function signedIn(token) {
  state.token = token; safeSet(TOKEN_KEY, token); state.pendingJoin = null;
  await loadAll();
  go('#/recipes');
  if (state.pendingShare) { openAddSheet(state.pendingShare); state.pendingShare = null; }
}

// ---------- recipes ----------
// Placeholder art for recipes without a photo: an emoji guessed from the title/tags and a stable tint.
const FOOD = [[/chicken|turkey|wing/, '🍗'], [/salmon|fish|tuna|cod|shrimp|prawn/, '🐟'], [/pasta|orzo|spaghetti|noodle|lasagna|mac/, '🍝'], [/bread|loaf|flatbread|toast|bun/, '🍞'], [/cake|cookie|brownie|muffin|dessert|pie/, '🍰'], [/potato|fries/, '🥔'], [/salad|bowl|veg/, '🥗'], [/soup|stew|chili|curry/, '🍛'], [/pizza/, '🍕'], [/taco|burrito|quesadilla/, '🌮'], [/egg|omelet|frittata|breakfast/, '🍳'], [/beef|steak|burger/, '🥩'], [/rice/, '🍚']];
const TINTS = ['#f6e3c9', '#e3efe2', '#f7dcd3', '#e6e4f3', '#f3ecc4', '#dcebf0'];
function placeholder(r) {
  const text = `${r.title} ${(r.tags ?? []).join(' ')}`.toLowerCase();
  const emoji = FOOD.find(([rx]) => rx.test(text))?.[1] ?? '🍲';
  let h = 0; for (const c of r.title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { emoji, tint: TINTS[h % TINTS.length] };
}

function allTags() { const c = {}; for (const r of state.recipes) for (const t of r.tags ?? []) c[t] = (c[t] ?? 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t); }

function renderRecipes() {
  const q = state.query.toLowerCase();
  const list = state.recipes.filter((r) => (!state.tag || (state.tag === '★' ? r.favorite : r.tags?.includes(state.tag))) && (!q || r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.includes(q))));
  const left = state.me?.household.aiImportsLeft;
  app.innerHTML = `<div class="wrap">
    <div class="row"><h1>Recipes</h1><span class="spacer"></span>${state.me?.household.pro ? '<span class="pill pro">Pro</span>' : left !== null && left !== undefined ? `<span class="pill">${left} AI imports left</span>` : ''}</div>
    ${state.recipes.length >= 3 && !safeGet('jarful.keySaved') ? `<div class="flags" id="keynudge" style="margin:8px 0">🔑 <b>Save your kitchen code: ${esc(state.me?.household.inviteCode ?? '')}</b><br>It's how you get your recipes back on a new phone. <button class="btn ghost" id="keysaved">I saved it</button></div>` : ''}
    <input class="search" type="text" id="q" placeholder="Search recipes or ingredients…" value="${esc(state.query)}" aria-label="Search">
    <div class="chips">${['★', ...allTags()].map((t) => `<button class="chip" data-tag="${esc(t)}" aria-pressed="${state.tag === t}">${t === '★' ? '★ Favorites' : esc(t)}</button>`).join('')}</div>
    <div style="height:10px"></div>
    ${state.recipes.length === 0 ? `<div class="empty"><div class="big">🫙</div><h2>Your jar is empty</h2><p class="muted">Tap <b>+ Add recipe</b> and paste any recipe link — a TikTok, an Instagram post, a YouTube video or a food blog.</p></div>`
      : list.length === 0 ? '<p class="muted">No recipes match.</p>'
      : `<div class="grid">${list.map((r) => `<button class="tile" data-id="${r.id}"><div class="img" style="background:${placeholder(r).tint}">${placeholder(r).emoji}${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hide-on-error>` : ''}</div><div class="t">${r.favorite ? '★ ' : ''}${esc(r.title)}</div><div class="m">${[r.totalMinutes ? `${r.totalMinutes} min` : '', `${r.ingredients.length} ingredients`, r.sourceName ?? ''].filter(Boolean).map(esc).join(' · ')}</div></button>`).join('')}</div>`}
  </div>
  <button class="btn fab" id="add">+ Add recipe</button>`;
  const qi = $('#q');
  qi.addEventListener('input', () => { state.query = qi.value; const pos = qi.selectionStart; renderRecipes(); renderTabs('recipes'); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); });
  app.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => { state.tag = state.tag === b.dataset.tag ? null : b.dataset.tag; render(); }));
  app.querySelectorAll('.tile').forEach((t) => t.addEventListener('click', () => go(`#/recipe/${t.dataset.id}`)));
  $('#keysaved')?.addEventListener('click', () => { safeSet('jarful.keySaved', '1'); $('#keynudge').remove(); });
  $('#add').addEventListener('click', () => openAddSheet());
}

function sheet(html) {
  const bd = document.createElement('div');
  bd.className = 'sheet-backdrop';
  bd.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  bd.addEventListener('click', (e) => { if (e.target === bd) bd.remove(); });
  document.body.append(bd);
  return { el: bd, close: () => bd.remove() };
}

function openAddSheet(prefill = {}) {
  let mode = prefill.url ? 'link' : prefill.text ? 'text' : 'link';
  const s = sheet('');
  const draw = () => {
    $('.sheet', s.el).innerHTML = `<div class="stack">
      <div class="row"><h2>Add a recipe</h2><span class="spacer"></span><button class="btn ghost" data-close>Close</button></div>
      <div class="seg" role="group">${[['link', 'Link'], ['text', 'Text'], ['photo', 'Photo'], ['manual', 'Type']].map(([k, l]) => `<button data-mode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
      ${mode === 'link' ? `<div><label for="u">Recipe link</label><input id="u" type="url" inputmode="url" placeholder="https://www.tiktok.com/@chef/video/…" value="${esc(prefill.url ?? '')}"></div><p class="muted small">Food blogs import instantly and free. TikTok, YouTube and pages without recipe markup use an AI import.</p>`
      : mode === 'text' ? `<div><label for="tx">Paste the caption or recipe</label><textarea id="tx" placeholder="Copy the caption from Instagram or TikTok and paste it here…">${esc(prefill.text ?? '')}</textarea></div><p class="muted small">Tip: long-press the caption in Instagram or TikTok to copy it.</p>`
      : mode === 'photo' ? `<div><label for="ph">Photo of a cookbook page, recipe card or screenshot</label><input id="ph" type="file" accept="image/*" capture="environment"></div><p class="muted small">Handwritten family recipes work too.</p>`
      : `<div><label for="mt">Title</label><input id="mt" type="text"></div><div><label for="mi">Ingredients (one per line)</label><textarea id="mi" placeholder="2 cups flour\n1 tsp salt"></textarea></div><div><label for="ms">Steps (one per line)</label><textarea id="ms"></textarea></div>`}
      <button class="btn block" id="go">${mode === 'manual' ? 'Save recipe' : 'Import recipe'}</button>
    </div>`;
    $('[data-close]', s.el).addEventListener('click', s.close);
    s.el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    $('#go', s.el).addEventListener('click', submit);
    setTimeout(() => ($('#u', s.el) ?? $('#tx', s.el) ?? $('#mt', s.el))?.focus(), 50);
  };
  const submit = async (e) => {
    const btn = e.target;
    let body;
    if (mode === 'link') body = { url: $('#u', s.el).value.trim() };
    else if (mode === 'text') body = { text: $('#tx', s.el).value };
    else if (mode === 'photo') { const f = $('#ph', s.el).files[0]; if (!f) return toast('Choose a photo first.'); body = { image: await downscale(f) }; }
    else body = { title: $('#mt', s.el).value || 'Untitled recipe', ingredients: $('#mi', s.el).value, steps: $('#ms', s.el).value };
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Reading recipe…';
    try {
      const r = mode === 'manual' ? await api('/api/recipes', { method: 'POST', body }) : await api('/api/recipes/import', { method: 'POST', body });
      state.recipes.unshift(r.recipe);
      if (r.aiImportsLeft !== undefined && state.me) state.me.household.aiImportsLeft = r.aiImportsLeft;
      s.close();
      go(`#/recipe/${r.recipe.id}`);
      toast(r.recipe.flags?.length ? 'Saved — please check the highlighted notes.' : 'Saved to your jar!');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Try again';
      if (err.status === 402) return upsell(err.message);
      toast(err.message);
      if (mode === 'link' && [422, 424].includes(err.status)) { mode = 'text'; draw(); }
    }
  };
  draw();
}

// Resize photos client-side: faster uploads, cheaper AI calls.
function downscale(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85)); URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = URL.createObjectURL(file);
  });
}

function upsell(message) {
  const s = sheet(`<div class="stack"><h2>Keep importing with Pro</h2><p>${esc(message)}</p><p class="muted small">Website imports never count. Your allowance resets on the 1st.</p><button class="btn block" id="seeplans">See Pro options</button><button class="btn ghost block" data-close>Not now</button></div>`);
  $('[data-close]', s.el).addEventListener('click', s.close);
  $('#seeplans', s.el).addEventListener('click', () => { s.close(); go('#/kitchen'); });
}

// ---------- recipe detail ----------
const NICE = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];
function fmtQty(q) {
  if (q == null) return '';
  const w = Math.floor(q + 1e-9); const f = q - w;
  if (f < 0.06) return String(w || ''); if (f > 0.94) return String(w + 1);
  if (w >= 10) return String(Math.round(q));
  const [, s] = NICE.reduce((b, c) => (Math.abs(c[0] - f) < Math.abs(b[0] - f) ? c : b));
  return w ? `${w} ${s}` : s;
}
// Mirrors lib/ingredients.mjs roundScaled/unitLabel so the recipe card matches the grocery list.
const DISCRETE = new Set(['clove', 'can', 'slice', 'package', 'bunch', 'pinch']);
const PLURAL = { cup: 'cups', clove: 'cloves', can: 'cans', slice: 'slices', bunch: 'bunches', package: 'packages', pinch: 'pinches' };
function fmtIng(i, factor) {
  if (i.qty == null || factor === 1) return esc(i.raw);
  let q = i.qty * factor;
  if (DISCRETE.has(i.unit)) q = Math.max(1, Math.ceil(q - 0.05));
  else if (!i.unit) q = Math.max(0.5, Math.round(q * 2) / 2);
  const unit = i.unit === 'floz' ? 'fl oz' : q > 1 && PLURAL[i.unit] ? PLURAL[i.unit] : i.unit ?? '';
  return `<b>${fmtQty(q)}</b> ${esc(unit)} ${esc(i.name)}${i.note ? `, ${esc(i.note)}` : ''}`;
}

function renderRecipe(id) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) { app.innerHTML = '<div class="wrap"><p>Recipe not found.</p><a href="#/recipes">Back</a></div>'; return; }
  const base = r.servings || null;
  const want = state.servings[id] ?? base;
  const factor = base && want ? want / base : 1;
  app.innerHTML = `<div class="wrap stack">
    <div class="row"><button class="btn ghost" data-go="#/recipes">← Recipes</button><span class="spacer"></span><button class="btn ghost" id="fav" aria-label="Favorite">${r.favorite ? '★' : '☆'}</button><button class="btn ghost" id="edit">Edit</button></div>
    ${r.image ? `<img class="detail-img" src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" data-hide-on-error>` : ''}
    <div><h1>${esc(r.title)}</h1><div class="muted small">${[r.totalMinutes ? `${r.totalMinutes} min` : '', r.sourceName, r.method?.startsWith('ai') ? 'AI import' : ''].filter(Boolean).map(esc).join(' · ')}${r.sourceUrl ? ` · <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Original</a>` : ''}</div></div>
    ${r.flags?.length ? `<div class="flags"><b>Worth a quick check</b><ul>${r.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
    <div class="row wrap-row"><button class="btn" id="cook">Start cooking</button><button class="btn secondary" id="plan">Add to plan</button></div>
    <div class="card">
      <div class="row" style="margin-bottom:8px"><h2 style="margin:0">Ingredients</h2><span class="spacer"></span>${base ? `<div class="stepper"><button id="minus" aria-label="Fewer servings">−</button><span>${want} serving${want === 1 ? '' : 's'}</span><button id="plus" aria-label="More servings">+</button></div>` : ''}</div>
      <ul class="ing-list">${r.ingredients.map((i) => `<li><span>${fmtIng(i, factor)}</span></li>`).join('') || '<li class="muted">No ingredients yet — tap Edit to add them.</li>'}</ul>
    </div>
    <div class="card"><h2>Steps</h2><ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">No steps yet.</li>'}</ol></div>
    ${r.notes ? `<div class="card"><h2>Notes</h2><p style="white-space:pre-wrap">${esc(r.notes)}</p></div>` : ''}
  </div>`;
  app.querySelector('[data-go]').addEventListener('click', () => go('#/recipes'));
  $('#minus')?.addEventListener('click', () => { state.servings[id] = Math.max(1, want - 1); render(); });
  $('#plus')?.addEventListener('click', () => { state.servings[id] = want + 1; render(); });
  $('#fav').addEventListener('click', async () => { const u = await api(`/api/recipes/${id}`, { method: 'PUT', body: { favorite: !r.favorite } }); Object.assign(r, u.recipe); render(); });
  $('#edit').addEventListener('click', () => openEditSheet(r));
  $('#cook').addEventListener('click', () => cookMode(r));
  $('#plan').addEventListener('click', () => pickDay(r, want));
}

function openEditSheet(r) {
  const s = sheet(`<div class="stack">
    <div class="row"><h2>Edit recipe</h2><span class="spacer"></span><button class="btn ghost" data-close>Cancel</button></div>
    <div><label for="et">Title</label><input id="et" type="text" value="${esc(r.title)}"></div>
    <div class="row"><div style="flex:1"><label for="es">Servings</label><input id="es" type="number" min="1" value="${esc(r.servings ?? '')}"></div><div style="flex:1"><label for="em">Minutes</label><input id="em" type="number" min="1" value="${esc(r.totalMinutes ?? '')}"></div></div>
    <div><label for="ei">Ingredients (one per line)</label><textarea id="ei" rows="8">${esc(r.ingredients.map((i) => i.raw).join('\n'))}</textarea></div>
    <div><label for="ep">Steps (one per line)</label><textarea id="ep" rows="8">${esc(r.steps.join('\n'))}</textarea></div>
    <div><label for="eg">Tags (comma separated)</label><input id="eg" type="text" value="${esc((r.tags ?? []).join(', '))}"></div>
    <div><label for="en">Notes</label><textarea id="en" rows="3">${esc(r.notes ?? '')}</textarea></div>
    <button class="btn block" id="save">Save</button>
    <button class="btn danger block" id="del">Delete recipe</button>
  </div>`);
  $('[data-close]', s.el).addEventListener('click', s.close);
  $('#save', s.el).addEventListener('click', async () => {
    const u = await api(`/api/recipes/${r.id}`, { method: 'PUT', body: { title: $('#et', s.el).value, servings: $('#es', s.el).value, totalMinutes: $('#em', s.el).value, ingredients: $('#ei', s.el).value, steps: $('#ep', s.el).value, tags: $('#eg', s.el).value, notes: $('#en', s.el).value } });
    Object.assign(r, u.recipe); delete state.servings[r.id]; s.close(); render(); toast('Saved');
  });
  $('#del', s.el).addEventListener('click', async () => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    await api(`/api/recipes/${r.id}`, { method: 'DELETE' });
    state.recipes = state.recipes.filter((x) => x.id !== r.id); s.close(); go('#/recipes');
  });
}

async function cookMode(r) {
  let i = 0; let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
  const el = document.createElement('div'); el.className = 'cook';
  const draw = () => {
    el.innerHTML = `<div class="row"><b>${esc(r.title)}</b><span class="spacer"></span><button class="btn ghost" id="x">Done</button></div>
      <div class="muted small">Step ${i + 1} of ${r.steps.length || 1} · screen stays on</div>
      <div class="step-text">${esc(r.steps[i] ?? 'No steps saved for this recipe.')}</div>
      <div class="row"><button class="btn secondary" id="prev" ${i === 0 ? 'disabled' : ''} style="flex:1">Back</button><button class="btn" id="next" style="flex:2">${i >= r.steps.length - 1 ? 'Finish' : 'Next step'}</button></div>`;
    $('#x', el).onclick = close; $('#prev', el).onclick = () => { i--; draw(); };
    $('#next', el).onclick = () => { if (i >= r.steps.length - 1) close(); else { i++; draw(); } };
  };
  const close = () => { lock?.release?.(); el.remove(); };
  draw(); document.body.append(el);
}

function pickDay(r, servings) {
  const days = Array.from({ length: 14 }, (_, n) => addDays(todayIso(), n));
  const s = sheet(`<div class="stack"><div class="row"><h2>Add to which day?</h2><span class="spacer"></span><button class="btn ghost" data-close>Cancel</button></div>
    ${days.map((d) => `<button class="btn secondary block" data-day="${d}">${new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</button>`).join('')}</div>`);
  $('[data-close]', s.el).addEventListener('click', s.close);
  s.el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', async () => {
    const date = b.dataset.day;
    const plan = await api(`/api/plan?from=${date}`);
    const entries = [...plan.days[0].entries, { recipeId: r.id, servings }];
    await api('/api/plan', { method: 'PUT', body: { date, entries } });
    s.close(); toast('Added to your plan');
  }));
}

// ---------- plan ----------
async function renderPlan() {
  app.innerHTML = '<div class="wrap"><h1>This week</h1><p class="muted">Loading…</p></div>'; renderTabs('plan');
  const { days } = await api(`/api/plan?from=${state.weekFrom}`);
  const byId = Object.fromEntries(state.recipes.map((r) => [r.id, r]));
  const today = todayIso();
  app.innerHTML = `<div class="wrap stack">
    <div class="row"><button class="btn ghost" id="prevw" aria-label="Previous week">‹</button><h1 style="margin:0;flex:1;text-align:center">${new Date(`${state.weekFrom}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${new Date(`${addDays(state.weekFrom, 6)}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</h1><button class="btn ghost" id="nextw" aria-label="Next week">›</button></div>
    ${days.map((d) => `<div class="day ${d.date === today ? 'today' : ''}"><h3>${new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })}<button class="btn ghost" data-add="${d.date}">+ Add</button></h3>
      ${d.entries.map((e, idx) => byId[e.recipeId] ? `<div class="plan-entry"><span class="name" data-open="${e.recipeId}">${esc(byId[e.recipeId].title)}</span><span class="muted small">${e.servings ? `${e.servings} serv.` : ''}</span><button class="btn ghost" data-rm="${d.date}|${idx}" aria-label="Remove">✕</button></div>` : '').join('') || '<div class="muted small">Nothing planned</div>'}</div>`).join('')}
    <button class="btn block" data-go="#/grocery">Build grocery list for this week</button>
  </div>`;
  renderTabs('plan');
  $('#prevw').onclick = () => { state.weekFrom = addDays(state.weekFrom, -7); renderPlan(); };
  $('#nextw').onclick = () => { state.weekFrom = addDays(state.weekFrom, 7); renderPlan(); };
  app.querySelector('[data-go="#/grocery"]').onclick = () => go('#/grocery');
  app.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => go(`#/recipe/${b.dataset.open}`));
  app.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
    const [date, idx] = b.dataset.rm.split('|'); const day = days.find((d) => d.date === date);
    await api('/api/plan', { method: 'PUT', body: { date, entries: day.entries.filter((_, i) => i !== Number(idx)) } }); renderPlan();
  });
  app.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
    if (!state.recipes.length) return toast('Save a recipe first.');
    const s = sheet(`<div class="stack"><div class="row"><h2>Pick a recipe</h2><span class="spacer"></span><button class="btn ghost" data-close>Cancel</button></div>${state.recipes.map((r) => `<button class="btn secondary block" data-pick="${r.id}" style="text-align:left">${esc(r.title)}</button>`).join('')}</div>`);
    $('[data-close]', s.el).onclick = s.close;
    s.el.querySelectorAll('[data-pick]').forEach((p) => p.onclick = async () => {
      const day = days.find((d) => d.date === b.dataset.add); const r = byId[p.dataset.pick];
      await api('/api/plan', { method: 'PUT', body: { date: day.date, entries: [...day.entries, { recipeId: r.id, servings: r.servings }] } });
      s.close(); renderPlan();
    });
  });
}

// ---------- grocery ----------
let groceryTimer = null;
async function renderGrocery(silent = false) {
  if (!silent) { app.innerHTML = '<div class="wrap"><h1>Groceries</h1><p class="muted">Loading…</p></div>'; renderTabs('grocery'); }
  const g = await api(`/api/grocery?from=${state.weekFrom}`);
  if (route().view !== 'grocery') return;
  const aisles = {};
  for (const i of g.items) (aisles[i.aisle] ??= []).push(i);
  const scroll = window.scrollY;
  app.innerHTML = `<div class="wrap">
    <div class="row"><h1>Groceries</h1><span class="spacer"></span><button class="btn ghost" id="clear">Clear checked</button></div>
    <p class="muted small">For ${new Date(`${g.from}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}–${new Date(`${g.to}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}. Everyone in your kitchen sees ticks live.</p>
    <div class="row"><input type="text" id="extra" placeholder="Add anything else (paper towels, coffee…)"><button class="btn" id="addx">Add</button></div>
    ${g.extras.length ? `<div class="aisle"><h3>Extras</h3>${g.extras.map((x) => `<label class="check ${x.checked ? 'done' : ''}"><input type="checkbox" data-x="${x.id}" ${x.checked ? 'checked' : ''}><span class="label">${esc(x.text)}</span></label>`).join('')}</div>` : ''}
    ${Object.entries(aisles).map(([a, items]) => `<div class="aisle"><h3>${esc(a)}</h3>${items.map((i) => `<label class="check ${i.checked ? 'done' : ''}"><input type="checkbox" data-k="${esc(i.key)}" ${i.checked ? 'checked' : ''}><span><span class="label">${esc(i.label)}</span><br><span class="src">${esc(i.sources.join(', '))}</span></span></label>`).join('')}</div>`).join('')}
    ${!g.items.length && !g.extras.length ? '<div class="empty"><div class="big">🛒</div><p class="muted">Plan a few meals and your list builds itself — merged, by aisle.</p></div>' : ''}
  </div>`;
  renderTabs('grocery');
  if (silent) window.scrollTo(0, scroll);
  app.querySelectorAll('input[data-k], input[data-x]').forEach((c) => c.onchange = async () => {
    c.closest('.check').classList.toggle('done', c.checked);
    await api('/api/grocery/check', { method: 'POST', body: c.dataset.k ? { key: c.dataset.k, checked: c.checked } : { extraId: c.dataset.x, checked: c.checked } }).catch((e) => toast(e.message));
  });
  const addx = async () => { const v = $('#extra').value.trim(); if (!v) return; await api('/api/grocery/extra', { method: 'POST', body: { text: v } }); renderGrocery(true); };
  $('#addx').onclick = addx; $('#extra').onkeydown = (e) => { if (e.key === 'Enter') addx(); };
  $('#clear').onclick = async () => { await api('/api/grocery/clear', { method: 'POST' }); renderGrocery(true); };
  clearInterval(groceryTimer);
  groceryTimer = setInterval(() => { if (route().view === 'grocery' && document.visibilityState === 'visible' && document.activeElement?.id !== 'extra') renderGrocery(true).catch(() => {}); else if (route().view !== 'grocery') clearInterval(groceryTimer); }, 10000);
}

// ---------- kitchen (settings, sharing, billing) ----------
async function renderKitchen() {
  const me = (state.me = await api('/api/me')).household;
  const billing = await api('/api/billing');
  const invite = `${WEB_ORIGIN}/?join=${me.inviteCode}`;
  app.innerHTML = `<div class="wrap stack">
    <h1>${esc(me.name)}</h1>
    <div class="card stack"><h2>Share with your household</h2>
      <p class="muted small">Anyone with this code shares your recipes, plan and grocery list. Free on every plan.</p>
      <div class="row"><input type="text" readonly value="${esc(me.inviteCode)}" style="font-weight:800;letter-spacing:.15em;text-align:center"><button class="btn" id="share">Share invite</button></div>
      <div class="muted small">Members: ${me.members.map((m) => esc(m.name)).join(', ')}</div>
    </div>
    <div class="card stack"><div class="row"><h2 style="margin:0">Your plan</h2><span class="spacer"></span><span class="pill ${me.pro ? 'pro' : ''}">${me.pro ? `Pro${me.interval === 'lifetime' ? ' · lifetime' : ''}` : 'Free'}</span></div>
      ${me.pro ? `<p>Unlimited AI imports. Thank you for supporting an honest app.</p>${billing.portalUrl && me.interval !== 'lifetime' ? `<a class="btn secondary block" href="${esc(billing.portalUrl)}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Manage or cancel subscription</a>` : ''}`
      : `<p class="muted small">${me.aiImportsUsed} of ${me.freeAiLimit} AI imports used this month. Website imports are always unlimited.</p>
        ${NATIVE ? '<p class="muted small">Pro is available on our website. Your purchase applies to every device in your kitchen.</p>' : ''}
        ${NATIVE ? '' : Object.entries(billing.links).map(([k, l]) => l.url ? `<a class="btn ${k === 'yearly' ? '' : 'secondary'} block" style="text-align:center;text-decoration:none;display:block" href="${esc(l.url)}">${k === 'lifetime' ? 'Lifetime' : k === 'yearly' ? 'Yearly' : 'Monthly'} — ${esc(l.label)}</a>` : '').join('') || '<p class="muted small">Payments are not configured on this server yet.</p>'}
        <p class="muted small">No weekly plans. Cancel in one tap. 14-day refunds.</p>`}
    </div>
    <div class="card stack"><h2>Give friends 10 extra AI imports</h2>
      <p class="muted small">When a friend starts their own kitchen from your link, you both get +10 AI imports every month${me.referredCount ? ` — ${me.referredCount} friend${me.referredCount === 1 ? '' : 's'} so far, +${me.bonusAiImports} for you` : ''}.</p>
      <button class="btn secondary" id="refer">Share my link</button>
    </div>
    <div class="card stack"><h2>Your data</h2><p class="muted small">Download every recipe and your meal plan as a file, any time.</p><button class="btn secondary" id="export">Export everything</button></div>
    <button class="btn ghost" id="signout">Sign out on this device</button>
    <button class="btn danger" id="delete">Delete my kitchen and all its data</button>
    <p class="muted small"><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>
    <p class="muted small">Signing out forgets this device. To get back in, ask a household member for the invite code — keep it somewhere safe.</p>
  </div>`;
  renderTabs('kitchen');
  $('#share').onclick = async () => {
    const text = `Join our kitchen on Jarful: ${invite}`;
    if (navigator.share) navigator.share({ title: 'Jarful', text, url: invite }).catch(() => {});
    else { await navigator.clipboard?.writeText(invite).catch(() => {}); toast('Invite link copied'); }
  };
  $('#refer').onclick = async () => {
    const link = `${WEB_ORIGIN}/?ref=${me.refCode}`;
    const text = `I save all my recipes in Jarful — no ads, no weekly subscription. Start with 10 extra AI imports: ${link}`;
    if (navigator.share) navigator.share({ title: 'Jarful', text, url: link }).catch(() => {});
    else { await navigator.clipboard?.writeText(link).catch(() => {}); toast('Link copied'); }
  };
  $('#export').onclick = async () => {
    const res = await fetch(API_BASE + '/api/export', { headers: { authorization: `Bearer ${state.token}` } });
    const blob = await res.blob(); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `jarful-export-${todayIso()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#delete').onclick = async () => {
    const typed = prompt('This permanently deletes every recipe, plan and list in this kitchen for all members. Type DELETE to confirm.');
    if (typed === null) return;
    try { await api('/api/me', { method: 'DELETE', body: { confirm: typed } }); safeSet(TOKEN_KEY, null); state.token = null; state.me = null; location.hash = ''; render(); toast('Your kitchen was deleted.'); }
    catch (err) { toast(err.message); }
  };
  $('#signout').onclick = () => { if (confirm('Sign out on this device? You will need your invite code to get back in.')) signOut(); };
}

boot();
