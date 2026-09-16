/* Min vardag — ikoner som infogad SVG.
 * Enfärgade och i samma stil, så inget ritas som färgemoji på vissa telefoner. */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const P = {
    dag: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    vecka: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    berat: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M9 11h6M9 15h3"/>',
    barn: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1Z"/>',
    kvall: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    vanta: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    kryss: '<path d="M6 6l12 12M18 6 6 18"/>',
    pil: '<path d="m9 5 7 7-7 7"/>',
    ner: '<path d="m5 9 7 7 7-7"/>',
    mick: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    kugg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.8a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.2a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    tom: '<path d="M4 7h16M4 12h10M4 17h13"/>',
  };

  /** icon('dag', 21) -> infogad svg */
  function icon(name, size, cls) {
    const body = P[name] || P.tom;
    const s = size || 20;
    return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="${s}" height="${s}"
      fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  MV.icon = icon;
})(typeof globalThis !== 'undefined' ? globalThis : this);
