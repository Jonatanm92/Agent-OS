/*
 * Levande sagor – connects the app to its own server instead of a Claude account.
 * Provides the same small interface the app uses inside Claude (claude.use("sample"),
 * claude.use("downloads")), so the app code is identical in both places.
 */
(() => {
  'use strict';
  const KEY = 'levande:kod';
  try {
    const params = new URLSearchParams(location.search);
    const code = params.get('kod');
    if (code) {
      localStorage.setItem(KEY, code.trim());
      params.delete('kod');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    }
  } catch (e) { /* storage unavailable: the code must then be in the link every time */ }
  const familyCode = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const fail = (code, message, text) => ({ code, message: message || code, text });

  async function sample(input, options) {
    const opts = options || {};
    const prompt = Array.isArray(input) ? input.map((t) => t.content).join('\n\n') : String(input || '');
    if (!prompt.trim()) throw fail('invalid_request', 'Empty prompt');
    if (opts.signal && opts.signal.aborted) throw fail('cancelled');
    if (!familyCode()) throw fail('not_granted', 'No family code saved');
    let image = null;
    const imgs = opts.images ? Array.from(opts.images instanceof Blob ? [opts.images] : opts.images) : [];
    if (imgs.length) image = { media_type: imgs[0].type || 'image/jpeg', data: await toBase64(imgs[0]) };
    let res;
    try {
      res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-app-code': familyCode() },
        body: JSON.stringify({ prompt, image }),
        signal: opts.signal
      });
    } catch (e) {
      throw fail(e && e.name === 'AbortError' ? 'cancelled' : 'upstream_error', 'Network error');
    }
    let body = {};
    try { body = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) throw fail(body.code || 'upstream_error', body.message);
    const text = String(body.text || '');
    if (typeof opts.onText === 'function') { try { opts.onText({ text, delta: text }); } catch (e) { /* page bug */ } }
    return { text, truncated: !!body.truncated, modelTierApplied: 'default' };
  }
  sample.json = async (input, options) => JSON.parse((await sample(input, options)).text);
  sample.limits = async () => ({ maxPromptBytes: 60000, images: { maxCount: 1, maxInputBytes: 5000000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp'] } });

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.html?$/i.test(filename) ? 'text/html' : 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { status: 'saved' };
    }
  };

  window.claude = { use: (name) => Promise.resolve(name === 'sample' ? sample : name === 'downloads' ? downloads : null) };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
})();
