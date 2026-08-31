import type { Finding, FindingGroup, JourneyStep, Prospect, Scan } from '../core/Types.js';
import type { ObjectStorage } from '../evidence/Storage.js';
import { buildEvidencePack } from '../evidence/EvidencePack.js';
import { documentShell, escapeHtml, evidenceCard, journeyTable, disclaimer, pageTypeLabel, severityBadge } from './Html.js';
import { categorizeForProfessional, countBySeverity, isReportable, needsManualValidation, selectMiniFindings } from './Selection.js';

export interface ReportContext {
  prospect: Prospect;
  scan: Scan;
  findings: Finding[];
  groups: FindingGroup[];
  storage: ObjectStorage;
  branding?: { agencyName?: string; primaryColor?: string; footerNote?: string };
  /** Names of the engines that produced the findings, for the disclaimer. */
  engines?: string[];
}

const dateSv = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');

function siteName(prospect: Prospect): string {
  return prospect.companyName ?? prospect.domain;
}

function packsFor(findings: Finding[], context: ReportContext) {
  const groupById = new Map(context.groups.map((g) => [g.id, g]));
  return findings.map((f) => buildEvidencePack(f, { group: groupById.get(f.groupId ?? '') ?? null, storage: context.storage }));
}

/**
 * MINI AUDIT — the prospecting artefact.
 *
 * Three to five findings, each with a screenshot and a reproduction a developer
 * can follow. No legal language, no claim of non-compliance, one clear next
 * step. If this document would embarrass us in the recipient's inbox, the
 * pipeline should not have produced it.
 */
export function renderMiniAudit(context: ReportContext): { html: string; findings: Finding[] } {
  const selected = selectMiniFindings(context.findings, context.groups, 5);
  const packs = packsFor(selected, context);
  const tested = context.scan.journey.filter((s) => s.reached);
  const name = siteName(context.prospect);

  const body = `
<header class="masthead">
  <p class="eyebrow">${escapeHtml(context.branding?.agencyName ?? 'Tillgänglighetsgranskning')} · Mini-audit</p>
  <h1>${escapeHtml(name)}</h1>
  <p class="lede">Vi testade köpresan på ${escapeHtml(context.prospect.domain)} och hittade ${selected.length} hinder som påverkar kunder som handlar med tangentbord, skärmläsare eller förstoring.</p>
  <div class="meta"><span>Testdatum: ${dateSv(context.scan.startedAt)}</span><span>Testade sidor: ${tested.length}</span><span>Metod: automatiserad testning + manuell granskning</span></div>
</header>

<h2>Vad vi testade</h2>
<p>Vi gick igenom butikens köpresa som en kund gör det — utan att lägga en order, logga in eller kringgå några spärrar.</p>
${journeyTable(context.scan.journey)}

<h2>Vad vi hittade</h2>
${packs.length === 0 ? '<p>Inga hinder av tillräcklig styrka hittades för att lyftas i en mini-audit.</p>' : packs.map((p, i) => evidenceCard(p, { index: i + 1 })).join('')}

<div class="next-step">
  <h2>Nästa steg</h2>
  <p>Vi går gärna igenom fynden med er utvecklare på ett 30-minutersmöte och visar hur de återskapas live i butiken.</p>
  <p>Vill ni ha hela bilden gör vi en fullständig granskning av köpresan med prioriterad åtgärdslista och en teknisk rapport som utvecklaren kan arbeta direkt ur.</p>
</div>

${disclaimer(context.engines ?? ['axe-core', 'Playwright'], tested.length)}
${context.branding?.footerNote ? `<p class="disclaimer">${escapeHtml(context.branding.footerNote)}</p>` : ''}`;

  return { html: documentShell(`Mini-audit — ${name}`, body, { branding: context.branding }), findings: selected };
}

/** PROFESSIONAL AUDIT — reviewed findings and a prioritized remediation roadmap. */
export function renderProfessionalAudit(context: ReportContext): { html: string; findings: Finding[] } {
  const sections = categorizeForProfessional(context.findings);
  const included = [...sections.criticalBarriers, ...sections.highPriority, ...sections.mediumPriority, ...sections.improvements];
  const counts = countBySeverity(included);
  const tested = context.scan.journey.filter((s) => s.reached);
  const name = siteName(context.prospect);

  const section = (title: string, intro: string, findings: Finding[], technical = false) =>
    findings.length
      ? `<h2>${escapeHtml(title)} <span class="badge">${findings.length}</span></h2><p>${escapeHtml(intro)}</p>${packsFor(findings, context)
          .map((p) => evidenceCard(p, { technical }))
          .join('')}`
      : '';

  const systemic = context.groups
    .filter((g) => g.systemic)
    .sort((a, b) => b.affectedPageCount - a.affectedPageCount)
    .slice(0, 8);

  const body = `
<header class="masthead">
  <p class="eyebrow">${escapeHtml(context.branding?.agencyName ?? 'Tillgänglighetsgranskning')} · Fullständig granskning</p>
  <h1>${escapeHtml(name)}</h1>
  <p class="lede">Granskning av köpresan på ${escapeHtml(context.prospect.domain)} med prioriterad åtgärdsplan.</p>
  <div class="meta"><span>Testdatum: ${dateSv(context.scan.startedAt)}</span><span>Testade sidor: ${tested.length}</span><span>Plattform: ${escapeHtml(context.prospect.ecommercePlatform)}</span></div>
</header>

<div class="summary">
  <div class="stat"><span class="n">${counts.critical}</span><span class="l">Kritiska</span></div>
  <div class="stat"><span class="n">${counts.high}</span><span class="l">Hög prioritet</span></div>
  <div class="stat"><span class="n">${counts.medium}</span><span class="l">Medel</span></div>
  <div class="stat"><span class="n">${counts.low}</span><span class="l">Förbättringar</span></div>
  <div class="stat"><span class="n">${sections.manualValidation.length}</span><span class="l">Manuell kontroll</span></div>
</div>

<h2>Testomfattning</h2>
${journeyTable(context.scan.journey)}

${systemic.length
      ? `<h2>Systemiska komponenter</h2>
<p>Följande komponenter återkommer på flera sidor. Rättas de på ett ställe försvinner felet överallt där komponenten används.</p>
<table><thead><tr><th>Komponent</th><th>Allvarlighet</th><th>Testade sidor</th><th>Sidtyper</th></tr></thead><tbody>
${systemic
          .map(
            (g) => `<tr><td>${escapeHtml(g.componentLabel)}</td><td>${severityBadge(g.severity)}</td><td>${g.affectedPageCount}</td><td>${g.affectedPageTypes.map(pageTypeLabel).map(escapeHtml).join(', ')}</td></tr>`,
          )
          .join('')}
</tbody></table>`
      : ''}

${section('Kritiska hinder i köpresan', 'Dessa hinder gör att kunder med hjälpmedel inte kan slutföra ett köp. De bör åtgärdas först.', sections.criticalBarriers)}
${section('Hög prioritet', 'Allvarliga hinder som gör butiken svår att använda men inte alltid omöjlig.', sections.highPriority)}
${section('Medelprioritet', 'Problem som försämrar upplevelsen och bör planeras in i ordinarie utvecklingsarbete.', sections.mediumPriority)}
${section('Förbättringar', 'Mindre brister som höjer kvaliteten när de åtgärdas.', sections.improvements)}

${sections.manualValidation.length
      ? `<h2>Kräver manuell validering <span class="badge review">${sections.manualValidation.length}</span></h2>
<p>Automatiserad testning kunde inte avgöra dessa. De redovisas som öppna punkter, inte som konstaterade fel.</p>
${packsFor(sections.manualValidation.slice(0, 20), context).map((p) => evidenceCard(p)).join('')}`
      : ''}

${disclaimer(context.engines ?? ['axe-core', 'Playwright'], tested.length)}`;

  return { html: documentShell(`Tillgänglighetsgranskning — ${name}`, body, { branding: context.branding }), findings: included };
}

/** DEVELOPER REPORT — selectors, DOM, reproduction and remediation. */
export function renderDeveloperReport(context: ReportContext): { html: string; findings: Finding[] } {
  const included = context.findings.filter((f) => isReportable(f) || needsManualValidation(f));
  const ordered = [...included].sort((a, b) => a.pageType.localeCompare(b.pageType) || a.rule.localeCompare(b.rule));
  const byPage = new Map<string, Finding[]>();
  for (const finding of ordered) byPage.set(finding.url, [...(byPage.get(finding.url) ?? []), finding]);
  const name = siteName(context.prospect);

  const body = `
<header class="masthead">
  <p class="eyebrow">Teknisk rapport</p>
  <h1>${escapeHtml(name)} — utvecklarunderlag</h1>
  <p class="lede">Varje post innehåller selektor, DOM-utdrag, reproduktion och föreslagen åtgärd. Skärmbilder visar det testade elementet markerat.</p>
  <div class="meta"><span>Scan-id: <code>${escapeHtml(context.scan.id)}</code></span><span>Plattform: ${escapeHtml(context.prospect.ecommercePlatform)}</span><span>Ramverk: ${escapeHtml(context.prospect.cms)}</span></div>
</header>

<h2>Testade sidor</h2>
${journeyTable(context.scan.journey)}

${[...byPage.entries()]
      .map(
        ([url, findings]) => `<h2>${escapeHtml(pageTypeLabel(findings[0].pageType))}</h2>
<p><code>${escapeHtml(url)}</code> — ${findings.length} fynd</p>
${packsFor(findings, context).map((p) => evidenceCard(p, { technical: true })).join('')}`,
      )
      .join('')}

${disclaimer(context.engines ?? ['axe-core', 'Playwright'], context.scan.journey.filter((s) => s.reached).length)}`;

  return { html: documentShell(`Utvecklarrapport — ${name}`, body, { branding: context.branding }), findings: ordered };
}
