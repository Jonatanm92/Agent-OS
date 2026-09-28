/* Aura — icons as inline SVG, one stroke style, so nothing renders as colour emoji. */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const P = {
    now: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5" opacity=".45"/><path d="M12 2.5v1.5M12 20v1.5M2.5 12H4M20 12h1.5"/>',
    day: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    aura: '<path d="M12 3c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6Z"/><path d="M18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/>',
    life: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="3.5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="m14.5 5-7 7 7 7"/>',
    chevron: '<path d="m9.5 5 7 7-7 7"/>',
    down: '<path d="m5 9.5 7 7 7-7"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/>',
    cart: '<path d="M3 4h2.2l2.3 11h10.2l2-7.5H6.4"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    admin: '<path d="M7 3.5h7l4.5 4.5v12.5H7Z"/><path d="M14 3.5V8h4.5M10 12h5.5M10 15.5h5.5"/>',
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5v10.5h12V9.5"/><path d="M10 20v-5.5h4V20"/>',
    project: '<path d="M4 20V6.5M4 6.5c3-2 5.5 1.5 8 0s5-2 8 0v8c-3-2-5.5-1.5-8 0s-5 2-8 0"/>',
    routine: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4.5h-4.5"/><path d="m9 12 2 2 4-4"/>',
    review: '<path d="M4 19.5h16"/><path d="M6.5 16V11M10.5 16V7M14.5 16v-6M18.5 16V5"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
    cycle: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16" opacity=".4"/><circle cx="12" cy="4" r="1.6"/>',
    reflect: '<path d="M12 3.5c3 3 4.5 5.8 4.5 8.5a4.5 4.5 0 0 1-9 0c0-2.7 1.5-5.5 4.5-8.5Z"/><path d="M12 21v-4.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z"/><path d="M5 19 13 11"/>',
    wave: '<path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0" opacity=".5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    repeat: '<path d="M17 3.5 20 6.5l-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5 4 17.5l3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>',
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.6-5.5 7-5.5s6.2 1.7 7 5.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    send: '<path d="M4 12 20 4l-6 16-3-7Z"/><path d="m11 13 9-9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-3"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
    spark: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.2" cy="6.5" r="1"/><circle cx="4.2" cy="12" r="1"/><circle cx="4.2" cy="17.5" r="1"/>',
    up: '<path d="m5 14.5 7-7 7 7"/>',
  };

  function icon(name, size, cls) {
    const s = size || 20;
    return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || P.dot}</svg>`;
  }

  A.icon = icon;
  A.icons = Object.keys(P);
})(typeof globalThis !== 'undefined' ? globalThis : this);
