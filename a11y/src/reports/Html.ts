import type { EvidencePack } from '../evidence/EvidencePack.js';
import type { ConsentDecision, JourneyStep, Severity } from '../core/Types.js';
import { REPORT_CSS } from './Theme.js';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function documentShell(title: string, body: string, options: { branding?: { primaryColor?: string; footerNote?: string } } = {}): string {
  const brandOverride = options.branding?.primaryColor ? `:root { --brand:${options.branding.primaryColor}; }` : '';
  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${REPORT_CSS}${brandOverride}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Kritisk',
  high: 'Hög',
  medium: 'Medel',
  low: 'Låg',
};

export function severityBadge(severity: Severity): string {
  return `<span class="badge ${severity}">${SEVERITY_LABEL[severity]}</span>`;
}

export function confidenceBadge(confidence: string): string {
  if (confidence === 'REVIEW_REQUIRED') return '<span class="badge review">Kräver manuell kontroll</span>';
  if (confidence === 'CONFIRMED_AUTOMATED') return '<span class="badge">Verifierad automatiskt</span>';
  if (confidence === 'HIGH_CONFIDENCE') return '<span class="badge">Hög tillförlitlighet</span>';
  return `<span class="badge">${escapeHtml(confidence)}</span>`;
}

const PAGE_TYPE_LABEL: Record<string, string> = {
  homepage: 'Startsida',
  search: 'Sökresultat',
  category: 'Kategorisida',
  product: 'Produktsida',
  cart: 'Varukorg',
  account: 'Inloggning',
  checkout_entry: 'Kassaingång',
  content: 'Innehållssida',
  unknown: 'Okänd sidtyp',
};

export function pageTypeLabel(pageType: string): string {
  return PAGE_TYPE_LABEL[pageType] ?? pageType;
}

/**
 * Stated in every report: a store tested behind its own cookie wall is a
 * materially different test, and the reader is entitled to know which one they
 * are holding.
 */
export function consentNote(consent: ConsentDecision | null): string {
  if (!consent || !consent.detected) return '';
  const vendor = consent.vendor ? escapeHtml(consent.vendor) : 'en okänd leverantör';
  if (consent.dismissed) {
    return `<p class="meta">En cookiebanner från ${vendor} fanns på sidan. Den avvisades genom att tacka nej till icke-nödvändiga kakor innan testet påbörjades — inget godkännande gavs för er räkning.</p>`;
  }
  const coverage = consent.coveragePercent ? ` Den täcker ${consent.coveragePercent}% av sidan.` : '';
  return `<div class="callout"><h3>Testet gjordes med cookiebannern kvar</h3>
<p>Cookiebannern från ${vendor} går inte att avvisa utan att samtidigt godkänna icke-nödvändiga kakor, så vi lämnade den på plats.${coverage} Sidorna nedan testades alltså med bannern uppe — vilket också är vad en besökare som väljer att inte godkänna faktiskt möter.</p>
<p>Att banner­n inte går att tacka nej till är i sig värt att ta upp med er leverantör, både för tillgängligheten och för samtyckets giltighet.</p></div>`;
}

export function journeyTable(journey: JourneyStep[]): string {
  const rows = journey
    .map(
      (step) => `<tr>
      <td>${pageTypeLabel(step.pageType)}</td>
      <td>${step.reached ? `<span class="tested-yes">Testad</span>` : `<span class="tested-no">Ej testad</span>`}</td>
      <td>${step.reached ? `<code>${escapeHtml(step.url ?? '')}</code>` : escapeHtml(step.reason ?? '')}</td>
    </tr>`,
    )
    .join('');
  return `<table><thead><tr><th>Steg i köpresan</th><th>Status</th><th>Detalj</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export interface EvidenceCardOptions {
  /** Developer reports show selectors and DOM; sales reports do not. */
  technical?: boolean;
  index?: number;
}

export function evidenceCard(pack: EvidencePack, options: EvidenceCardOptions = {}): string {
  const { technical = false, index } = options;
  const wcag = pack.wcag.map((w) => `<span class="badge">WCAG ${escapeHtml(w.criterion)} ${escapeHtml(w.level)}</span>`).join('');
  const systemic = pack.systemic
    ? `<span class="badge systemic">Samma komponent på ${pack.systemic.affectedPageCount} testade sidor</span>`
    : '';

  const shot = pack.screenshot?.dataUri
    ? `<figure class="shot"><img src="${pack.screenshot.dataUri}" alt="Skärmbild som visar ${escapeHtml(pack.component)} på ${escapeHtml(pageTypeLabel(pack.pageType))}"><figcaption>Skärmbild från ${escapeHtml(pack.url)} — det markerade elementet är det som testades.</figcaption></figure>`
    : '';

  const keyboard = pack.keyboardReproduction.length
    ? `<div class="block"><h4>Så återskapar du det med tangentbord</h4><ol class="steps">${pack.keyboardReproduction.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol></div>`
    : '';

  const repro = pack.reproduction.length
    ? `<div class="block"><h4>Reproduktion</h4><ol class="steps">${pack.reproduction.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol></div>`
    : '';

  const technicalBlock = technical
    ? `<div class="block"><h4>Element</h4><pre>${escapeHtml(pack.selector)}</pre></div>
       <div class="block"><h4>DOM</h4><pre>${escapeHtml(pack.domSnippet)}</pre></div>
       <div class="block"><h4>Källa</h4><p>${escapeHtml(pack.sourceEngine)} · ${escapeHtml(pack.detectedAt)}</p></div>`
    : '';

  // When a finding has no natural component name, buildEvidencePack falls
  // back to the rule title as the component too — printing it a second time
  // ("Textkontrasten … — Textkontrasten …") would look like a copy-paste bug
  // rather than a deliberate heading. Show it once.
  const heading = pack.component && pack.component !== pack.title ? `${pack.title} — ${pack.component}` : pack.title;

  return `<article class="finding ${pack.severity}">
  <div class="badges">${severityBadge(pack.severity)}${confidenceBadge(pack.confidence)}${systemic}${wcag}</div>
  <h3>${index ? `${index}. ` : ''}${escapeHtml(heading)}</h3>
  <p class="meta">${escapeHtml(pageTypeLabel(pack.pageType))} · <code>${escapeHtml(pack.url)}</code></p>
  ${shot}
  <div class="block"><h4>Vad som händer</h4><p>${escapeHtml(pack.observedBehaviour)}</p></div>
  <div class="block"><h4>Förväntat beteende</h4><p>${escapeHtml(pack.expectedBehaviour)}</p></div>
  <div class="block"><h4>Konsekvens för kunden</h4><p>${escapeHtml(pack.userImpact)}</p></div>
  ${keyboard || repro}
  <div class="block"><h4>Föreslagen åtgärd</h4><p>${escapeHtml(pack.remediation)}</p></div>
  ${technicalBlock}
</article>`;
}

/**
 * The same disclaimer on every report. An automated test can show that a
 * specific barrier exists; it cannot establish conformance with WCAG,
 * EN 301 549 or any law, and we never imply otherwise.
 */
export function disclaimer(engines: string[], testedPages: number): string {
  return `<p class="disclaimer">
Underlaget är framtaget med automatiserad testning (${escapeHtml(engines.join(', ') || 'axe-core, Playwright')}) av ${testedPages} sidor, kompletterad med manuell granskning av fynden.
Automatiserad testning kan visa att ett hinder finns, men kan inte fastställa att en webbplats uppfyller WCAG 2.1/2.2, EN 301 549 eller tillämplig lagstiftning.
Det här dokumentet är därför ett tekniskt underlag, inte ett juridiskt utlåtande, en certifiering eller en garanti om regelefterlevnad.
En fullständig bedömning kräver manuell testning med hjälpmedel och en genomgång av hela webbplatsen.
</p>`;
}
