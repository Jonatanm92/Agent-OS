/**
 * Helpers injected into the page under test. Kept as a string so every probe
 * shares one implementation of "what is this element called" and "where is it".
 *
 * The accessible-name computation is a pragmatic subset of accname 1.2: it
 * covers aria-labelledby, aria-label, native labels, alt, title and content.
 * Where it cannot decide, it returns an empty string and the probe downgrades
 * the finding to REVIEW_REQUIRED rather than asserting a defect.
 */
export const HELPERS_JS = `
globalThis.__name = globalThis.__name || function (fn) { return fn; };
(() => {
  if (window.__a11y) return;
  const cssPath = (el) => {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id)) return '#' + el.id;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      if (node.id && /^[A-Za-z][\\w-]*$/.test(node.id)) { parts.unshift('#' + node.id); break; }
      const cls = (node.getAttribute('class') || '').trim().split(/\\s+/).filter((c) => /^[A-Za-z][\\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  const text = (el) => (el && el.textContent ? el.textContent.replace(/\\s+/g, ' ').trim() : '');

  const accessibleName = (el) => {
    if (!el) return '';
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const parts = labelledby.split(/\\s+/).map((id) => { const t = document.getElementById(id); return t ? text(t) : ''; }).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') return (el.getAttribute('alt') || '').trim();
    if (['input', 'select', 'textarea'].includes(tag)) {
      if (el.id) {
        const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (label) return text(label);
      }
      const wrapping = el.closest('label');
      if (wrapping) return text(wrapping);
      if (el.type === 'submit' || el.type === 'button') return (el.value || '').trim();
      const title = el.getAttribute('title');
      if (title) return title.trim();
      return '';
    }
    const own = text(el);
    if (own) return own;
    const img = el.querySelector('img[alt]');
    if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
    const svgTitle = el.querySelector('svg title');
    if (svgTitle) return text(svgTitle);
    const title = el.getAttribute('title');
    return title ? title.trim() : '';
  };

  const isVisible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };

  const inAriaHidden = (el) => Boolean(el && el.closest('[aria-hidden="true"]'));

  const focusStyle = (el) => {
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset, s.boxShadow, s.border, s.backgroundColor, s.color, s.textDecorationLine, s.filter].join('|');
  };

  const describe = (el) => ({
    selector: cssPath(el),
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') || '',
    name: accessibleName(el),
    html: (el.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 600),
    visible: isVisible(el),
    ariaHidden: inAriaHidden(el),
    rect: (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
  });

  window.__a11y = { cssPath, accessibleName, isVisible, inAriaHidden, focusStyle, describe, text };
})();
`;

export interface ElementDescription {
  selector: string;
  tag: string;
  role: string;
  name: string;
  html: string;
  visible: boolean;
  ariaHidden: boolean;
  rect: { x: number; y: number; w: number; h: number };
}
