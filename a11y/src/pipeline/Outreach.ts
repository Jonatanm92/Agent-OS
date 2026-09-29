import type { Finding, OutreachDraft, Prospect } from '../core/Types.js';
import { pageTypeLabel } from '../reports/Html.js';

export interface OutreachComposition {
  subject: string;
  body: string;
  citedFindingIds: string[];
}

const JOURNEY_LABEL: Record<string, string> = {
  product: 'produktsidan',
  category: 'kategorisidan',
  search: 'produktsöket',
  cart: 'varukorgen',
  checkout_entry: 'kassan',
  account: 'inloggningen',
  homepage: 'startsidan',
};

function journeyPhrase(pageType: string): string {
  return JOURNEY_LABEL[pageType] ?? pageTypeLabel(pageType).toLowerCase();
}

/**
 * SYSTEM 14 — outreach that could only have been written about this one site.
 *
 * Everything in the message comes from a finding we can show evidence for. No
 * claim of non-compliance, no legal pressure, no "we help companies become WCAG
 * compliant" — one concrete barrier, how we found it, and an easy next step.
 */
export function composeOutreach(
  prospect: Prospect,
  findings: Finding[],
  options: { senderName: string; senderCompany: string; reportLink?: string | null } = { senderName: 'Jonatan', senderCompany: 'Tillgänglighetsteamet' },
): OutreachComposition {
  const [lead, second] = findings;
  if (!lead) throw new Error('Outreach needs at least one approved finding to reference.');

  const site = prospect.companyName ?? prospect.domain;
  const where = journeyPhrase(lead.pageType);
  const component = lead.componentLabel ?? 'komponenten';

  const subject = `${site}: ${component} går inte att använda med tangentbord`;

  const secondLine = second
    ? `\nVi såg också att ${journeyPhrase(second.pageType)} har ${second.componentLabel ? `problem med ${second.componentLabel.toLowerCase()}` : 'ett liknande hinder'}: ${firstSentence(second.observedBehaviour)}\n`
    : '';

  const systemicLine = lead.componentLabel && findings.filter((f) => f.rule === lead.rule).length > 1
    ? '\nEftersom komponenten är gemensam för flera sidor räcker det att rätta den på ett ställe.\n'
    : '';

  const body = `Hej,

Vi testade köpresan på ${prospect.domain} — ${where} och några sidor till — som en kund som handlar med tangentbord eller skärmläsare gör det.

Vi hittade ett konkret hinder: ${firstSentence(lead.observedBehaviour)}

Så här återskapar man det:
${lead.reproduction.slice(0, 3).map((step, i) => `${i + 1}. ${step}`).join('\n')}
${secondLine}${systemicLine}
Jag har lagt skärmbild och exakt element i ett kort underlag${options.reportLink ? ` här: ${options.reportLink}` : ' som jag gärna skickar över'}. Det är inget juridiskt utlåtande — bara det vi faktiskt kunde mäta på era sidor.

Om det är intressant tar jag gärna 30 minuter med er utvecklare och visar det live. Vill ni hellre att jag slutar höra av mig svarar ni bara "nej tack", så tar vi bort er direkt.

Vänliga hälsningar
${options.senderName}
${options.senderCompany}`;

  return { subject, body, citedFindingIds: [lead.id, second?.id].filter((id): id is string => Boolean(id)) };
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^.*?[.!?](\s|$)/);
  const sentence = (match ? match[0] : trimmed).trim();
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

/** Opt-out detection on inbound replies. Conservative on purpose. */
const OPT_OUT = /(nej tack|ta bort mig|avregistrera|sluta (h[öo]ra av|kontakta)|inte intresserad|unsubscribe|remove me|do not contact|stop contacting)/i;

export function looksLikeOptOut(replyText: string): boolean {
  return OPT_OUT.test(replyText);
}

export function draftSummary(draft: OutreachDraft): string {
  return `${draft.subject} → ${draft.toValue ?? 'no recipient'} (${draft.status})`;
}
