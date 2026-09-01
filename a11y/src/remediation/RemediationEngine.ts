import type { Cms, EcommercePlatform, Finding } from '../core/Types.js';
import { adapterFor } from './Adapters.js';
import type { CodeSuggestion, RemediationGuidance } from './Types.js';

/**
 * Turn the failing markup into proposed markup. Only rules where the fix is
 * mechanically derivable from the DOM get a suggestion; everything else gets
 * guidance and an explicit note that a developer must decide.
 */
function suggestCode(finding: Finding): CodeSuggestion | null {
  const html = finding.html;

  if (['keyboard.mouse-only-control', 'component.trigger-not-focusable', 'component.enter-does-not-activate'].includes(finding.rule)) {
    const tag = /^<(\w+)/.exec(html)?.[1];
    if (!tag || ['button', 'a'].includes(tag)) return null;
    const after = html
      .replace(new RegExp(`^<${tag}`), '<button type="button"')
      .replace(new RegExp(`</${tag}>$`), '</button>')
      .replace(/\s+role="(button|link)"/g, '')
      .replace(/\s+tabindex="0"/g, '')
      .replace(/\s+onclick="[^"]*"/g, '');
    return {
      before: html,
      after,
      language: 'html',
      note: 'Byt ut elementet mot ett riktigt <button>. Flytta klickhanteraren till knappens click-händelse — den utlöses även av Enter och mellanslag, så ingen egen tangentbordskod behövs.',
    };
  }

  if (finding.rule === 'focus.no-visible-indicator') {
    return {
      before: '/* någonstans i temats CSS */\n*:focus { outline: none; }',
      after: `/* Ta bort den globala outline-nollställningen och lägg till en synlig fokusmarkering */
:focus-visible {
  outline: 3px solid #b45309;  /* byt till en varumärkesfärg med minst 3:1 kontrast */
  outline-offset: 2px;
  border-radius: 2px;
}`,
      language: 'css',
      note: 'Sök efter "outline: none" och "outline: 0" i temats CSS. Ersätt med en :focus-visible-regel så att musanvändare inte får en ram medan tangentbordsanvändare får det.',
    };
  }

  if (['form.missing-label', 'form.placeholder-as-label', 'form.required-unnamed'].includes(finding.rule)) {
    const id = /id="([^"]+)"/.exec(html)?.[1] ?? 'field-id';
    const placeholder = /placeholder="([^"]+)"/.exec(html)?.[1] ?? 'Etikett';
    const withId = html.includes('id=') ? html : html.replace(/^<(\w+)/, `<$1 id="${id}"`);
    return {
      before: html,
      after: `<label for="${id}">${placeholder}</label>\n${withId}`,
      language: 'html',
      note: 'Behöver etiketten vara visuellt dold, använd en visually-hidden-klass i stället för att ta bort den — aria-label fungerar också, men en synlig etikett hjälper fler användare.',
    };
  }

  if (finding.rule === 'component.dialog-missing-name') {
    const after = html.replace(/^<(\w+)/, '<$1 aria-labelledby="dialog-rubrik"');
    return {
      before: html,
      after: `${after}\n<!-- ge dialogens rubrik id="dialog-rubrik" -->`,
      language: 'html',
      note: 'Peka aria-labelledby mot dialogens synliga rubrik, hellre än att duplicera texten i ett aria-label.',
    };
  }

  if (['structure.alt-is-filename', 'structure.alt-not-descriptive', 'axe.image-alt'].includes(finding.rule)) {
    const after = html.replace(/alt="[^"]*"/, 'alt="<beskriv produkten, t.ex. Ullmatta Lofoten i beige, 170x240 cm>"');
    return {
      before: html,
      after: html.includes('alt=') ? after : html.replace(/^<img/, '<img alt="<beskriv produkten>"'),
      language: 'html',
      note: 'Alt-texten hämtas oftast bäst från produktnamnet i mallen. Rent dekorativa bilder ska ha alt="".',
    };
  }

  if (finding.rule === 'component.focus-not-moved') {
    return {
      before: 'openPanel();',
      after: `openPanel();
panelRef.setAttribute('tabindex', '-1');
panelRef.focus();
// när panelen stängs:
triggerRef.focus();`,
      language: 'html',
      note: 'Flytta fokus in i panelen när den öppnas och tillbaka till knappen när den stängs. Utan det vet varken skärmläsare eller tangentbordsanvändare att något hänt.',
    };
  }

  return null;
}

/**
 * SYSTEM 8 — remediation guidance.
 *
 * Produces a proposal, never a change: nothing here touches a customer system.
 */
export function buildRemediation(finding: Finding, context: { platform: EcommercePlatform; cms: Cms }): RemediationGuidance {
  const adapter = adapterFor(context);
  const suggestion = suggestCode(finding);
  const limitations: string[] = [];
  if (!suggestion) {
    limitations.push('Den här regeln har ingen mekanisk kodändring — en utvecklare behöver bedöma komponentens beteende.');
  }
  if (adapter.id === 'generic') {
    limitations.push('Plattformen kunde inte fastställas, så filplatserna är generiska.');
  }
  limitations.push('Förslaget bygger på det renderade DOM-utdraget, inte på källkoden. Verifiera mot mallen innan det tillämpas.');

  return {
    findingId: finding.id,
    stack: adapter.label,
    likelyLocations: adapter.locate(finding),
    steps: [finding.remediation, ...adapter.steps(finding)],
    suggestion: suggestion ? { ...suggestion, language: suggestion.language } : null,
    verification: [
      ...finding.reproduction,
      'Kör om samma steg efter ändringen — hindret ska inte gå att återskapa.',
      'Kör en omtest i plattformen så att före- och efterläget dokumenteras.',
    ],
    limitations,
  };
}
