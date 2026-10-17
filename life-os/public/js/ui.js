// UI helpers: an auto-escaping HTML template tag, icons, small charts,
// a safe Markdown subset, toasts, the bottom sheet and file downloads.

export class Raw {
  constructor(s) { this.s = String(s); }
  toString() { return this.s; }
}

export const raw = (s) => new Raw(s);

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function part(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += part(values[i]) + strings[i + 1];
  return new Raw(out);
}

export const attr = (cond, name, value = '') => (cond ? raw(value === '' ? ` ${name}` : ` ${name}="${esc(value)}"`) : '');

// ── Icons (24×24 stroke icons) ───────────────────────────────────────────────

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.9-2.8 2.1 0 2.9 5.8 1.4 5.8 4.2 0 1.2-1.3 2.1-3 2.1-1.3 0-2.4-.6-2.9-1.5M12 6.2v1.6M12 16.2v1.6"/>',
  focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2.5h4"/>',
  week: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M12 14h2M16 14h.5M8 17h2M12 17h2"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  spark: '<path d="M12 3c.5 4.2 2.3 6.5 6.5 7-4.2.5-6 2.8-6.5 7-.5-4.2-2.3-6.5-6.5-7 4.2-.5 6-2.8 6.5-7z"/><path d="M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  shuffle: '<path d="M4 7h3.5c4.5 0 4.5 10 9 10H20M4 17h3.5c1.8 0 2.8-1.5 3.6-3.3M20 7h-3.5c-1.8 0-2.8 1.5-3.6 3.3M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7"/>',
  star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
};

export function icon(name, size = 22) {
  return raw(`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);
}

// ── Charts ───────────────────────────────────────────────────────────────────

export function ring(pct, { size = 112, stroke = 10, label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return html`<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>
    <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="round"/>
    <text x="50%" y="${sub ? '47%' : '50%'}" text-anchor="middle" dominant-baseline="middle" class="ring-label">${label}</text>
    ${sub ? html`<text x="50%" y="66%" text-anchor="middle" dominant-baseline="middle" class="ring-sub">${sub}</text>` : ''}
  </svg>`;
}

export function meter(pct, { label = '', tone = '' } = {}) {
  const p = Math.round(Math.max(0, Math.min(1, pct)) * 100);
  return html`<div class="meter ${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${label || `${p} procent`}"><span style="width:${p}%"></span></div>`;
}

// Single-series column chart: bars ≤24px, 4px rounded tops, value label on the
// highlighted column, native tooltip + aria-label on every column.
export function columns(items, { format = (v) => String(v), height = 96, empty = 'Ingen data ännu' } = {}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (max <= 0) return html`<p class="chart-empty">${empty}</p>`;
  return html`<div class="cols" style="--h:${height}px" role="list">
    ${items.map((i) => {
      const h = i.value > 0 ? Math.max(3, Math.round((i.value / max) * height)) : 0;
      const tip = `${i.title || i.label}: ${format(i.value)}`;
      return html`<div class="col ${i.highlight ? 'hl' : ''} ${i.muted ? 'muted-col' : ''}" role="listitem" title="${tip}" aria-label="${tip}">
        <span class="col-val">${i.highlight && i.value > 0 ? format(i.value) : ''}</span>
        <span class="col-bar" style="height:${h}px"></span>
        <span class="col-label">${i.label}</span>
      </div>`;
    })}
  </div>`;
}

export function scale(name, label, value, faces = ['😣', '😕', '😐', '🙂', '😄']) {
  return html`<fieldset class="scale">
    <legend>${label}</legend>
    <div class="scale-opts">
      ${faces.map((f, i) => html`<label class="scale-opt">
        <input type="radio" name="${name}" value="${i + 1}"${attr(Number(value) === i + 1, 'checked')} required>
        <span><span class="face" aria-hidden="true">${f}</span><span class="scale-num">${i + 1}</span></span>
      </label>`)}
    </div>
  </fieldset>`;
}

// ── Markdown subset (input is escaped first, then a few safe patterns) ───────

function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
}

export function md(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  for (const lineRaw of lines) {
    const line = lineRaw.trimEnd();
    let m;
    if (!line.trim()) {
      closeList();
    } else if ((m = /^#{1,2}\s+(.*)$/.exec(line))) {
      closeList();
      out.push(`<h3>${inline(m[1])}</h3>`);
    } else if ((m = /^#{3,6}\s+(.*)$/.exec(line))) {
      closeList();
      out.push(`<h4>${inline(m[1])}</h4>`);
    } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return raw(`<div class="md">${out.join('')}</div>`);
}

// ── Toast ────────────────────────────────────────────────────────────────────

let toastTimer = null;
export function toast(message, { action = null, actionLabel = 'Ångra', ms = 4200 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      action();
      el.classList.remove('show');
    });
    el.appendChild(btn);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ── Bottom sheet (native <dialog>) ───────────────────────────────────────────

export function openSheet(content) {
  const dlg = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  body.innerHTML = String(content);
  if (!dlg.open) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  const first = body.querySelector('[autofocus], input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, select');
  if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
}

export function closeSheet() {
  const dlg = document.getElementById('sheet');
  if (!dlg) return;
  if (typeof dlg.close === 'function' && dlg.open) dlg.close();
  else dlg.removeAttribute('open');
}

export function sheetIsOpen() {
  const dlg = document.getElementById('sheet');
  return Boolean(dlg && dlg.open);
}

export function sheetHead(title, sub = '') {
  return html`<div class="sheet-head">
    <div><h2 id="sheet-title">${title}</h2>${sub ? html`<p class="card-sub">${sub}</p>` : ''}</div>
    <button type="button" class="btn-icon" data-action="sheet.close" aria-label="Stäng">${icon('close')}</button>
  </div>`;
}

// ── Files ────────────────────────────────────────────────────────────────────

export function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Kunde inte läsa filen'));
    reader.readAsText(file);
  });
}
