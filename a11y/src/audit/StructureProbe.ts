import type { Page } from 'playwright';
import type { RawIssue } from './RawIssue.js';

/** SYSTEM 3 — semantic structure, landmarks, headings and link quality. */
export async function runStructureProbe(page: Page): Promise<RawIssue[]> {
  const found = await page
    .evaluate(() => {
      const helpers = (window as any).__a11y;
      const out: any[] = [];
      const push = (el: Element | null, rule: string, impact: string, params: Record<string, unknown> = {}) =>
        out.push({
          rule,
          impact,
          params,
          selector: el ? helpers.cssPath(el) : 'html',
          html: el ? (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 400) : '<html>',
          name: el ? helpers.accessibleName(el) : '',
        });

      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter((h) => helpers.isVisible(h));
      const h1s = headings.filter((h) => h.tagName === 'H1');
      if (h1s.length === 0 && headings.length > 0) {
        push(headings[0], 'structure.missing-h1', 'moderate');
      }
      let previous = 0;
      for (const heading of headings) {
        const level = Number(heading.tagName.slice(1));
        if (previous && level > previous + 1) {
          push(heading, 'structure.heading-skip', 'moderate', { from: previous, to: level, text: helpers.text(heading).slice(0, 60) });
        }
        previous = level;
      }

      if (!document.querySelector('main, [role="main"]')) {
        push(null, 'structure.missing-main', 'moderate');
      }
      const navs = Array.from(document.querySelectorAll('nav, [role="navigation"]')).filter((n) => helpers.isVisible(n));
      if (navs.length > 1) {
        const unnamed = navs.filter((n) => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby'));
        if (unnamed.length > 1) {
          push(unnamed[0], 'structure.duplicate-unnamed-landmarks', 'minor', { count: unnamed.length });
        }
      }

      const images = Array.from(document.querySelectorAll('img')).filter((img) => helpers.isVisible(img));
      for (const img of images.slice(0, 40)) {
        const alt = img.getAttribute('alt');
        if (alt === null) continue; // axe reports missing alt; we do not duplicate it
        if (alt && /\.(jpe?g|png|gif|webp|svg)$/i.test(alt.trim())) {
          push(img, 'structure.alt-is-filename', 'moderate', { alt: alt.trim() });
        } else if (alt && /^(bild|image|photo|foto|picture|img)[\s_-]*\d*$/i.test(alt.trim())) {
          push(img, 'structure.alt-not-descriptive', 'moderate', { alt: alt.trim() });
        }
      }

      const vagueLinks = Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => helpers.isVisible(a))
        .filter((a) => /^(läs mer|las mer|read more|klicka här|click here|mer|more|här|here|se mer|visa)$/i.test(helpers.accessibleName(a).trim()));
      if (vagueLinks.length >= 2) {
        push(vagueLinks[0], 'structure.ambiguous-link-text', 'moderate', { count: vagueLinks.length, text: helpers.accessibleName(vagueLinks[0]).trim() });
      }

      const firstFocusable = document.querySelector('a[href], button');
      const hasSkipLink = Array.from(document.querySelectorAll('a[href^="#"]'))
        .slice(0, 5)
        .some((a) => /(hoppa|skip|gå till innehåll|to content|main)/i.test(helpers.accessibleName(a) + (a.getAttribute('href') || '')));
      if (!hasSkipLink && document.querySelectorAll('a[href]').length > 25) {
        push(firstFocusable, 'structure.no-skip-link', 'minor', { linkCount: document.querySelectorAll('a[href]').length });
      }

      return out;
    })
    .catch(() => [] as any[]);

  return found.map((item) => ({
    engine: 'structure-probe' as const,
    rule: item.rule,
    selector: item.selector,
    html: item.html,
    params: item.params,
    impactHint: item.impact,
    componentLabel: item.name || null,
    data: item.params,
  }));
}
