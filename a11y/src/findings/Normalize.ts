import { localize, localizeSteps, type Locale } from '../core/Copy.js';
import { newId, nowIso, stableHash } from '../core/Ids.js';
import type { Confidence, Finding, PageType, Severity, SourceEngine } from '../core/Types.js';
import type { RawIssue } from '../audit/RawIssue.js';
import { AXE_RULE_OVERRIDES, RULE_CATALOG, type RuleDefinition } from './RuleCatalog.js';
import { severityFromAxeImpact, weightByPageType } from './Severity.js';
import { detectThirdParty } from './ThirdParty.js';
import { wcagFromAxeTags, wcagRefs } from './WcagMap.js';

export interface NormalizeContext {
  scanId: string;
  prospectId: string;
  url: string;
  pageType: PageType;
  locale?: Locale;
}

const KEYBOARD_ENGINES: SourceEngine[] = ['keyboard-probe', 'focus-probe', 'dialog-probe'];

/**
 * Selector shape shared by every instance of the same component. Positional
 * indices and generated ids are dropped so the same navigation on 200 pages
 * produces one signature instead of 200.
 */
export function componentSignatureFor(selector: string): string {
  return selector
    .replace(/:nth-of-type\(\d+\)/g, '')
    .replace(/#[A-Za-z][\w-]*\d{3,}[\w-]*/g, '#generated')
    .replace(/\.[A-Za-z][\w-]*\d{4,}[\w-]*/g, '.generated')
    .replace(/\s+/g, ' ')
    .trim();
}

function definitionFor(rule: string, issue: RawIssue): RuleDefinition | null {
  const direct = RULE_CATALOG[rule];
  if (direct) return direct;
  if (!rule.startsWith('axe.')) return null;

  const axeId = rule.slice(4);
  const override = AXE_RULE_OVERRIDES[axeId];
  const data = (issue.data ?? {}) as { tags?: string[]; description?: string; helpUrl?: string; incomplete?: boolean };
  const wcag = wcagFromAxeTags(data.tags ?? []).map((r) => r.criterion);
  const helpUrl = data.helpUrl ?? `https://dequeuniversity.com/rules/axe/4.10/${axeId}`;

  // axe rules we have not written copy for still produce usable findings: the
  // rule id and axe's own guidance are shown rather than invented prose.
  const fallbackTitle = axeId.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return {
    wcag: override?.wcag ?? wcag,
    baseSeverity: override?.baseSeverity ?? severityFromAxeImpact(issue.impactHint),
    confidence: override?.confidence ?? 'CONFIRMED_AUTOMATED',
    componentScoped: override?.componentScoped,
    title: override?.title ?? { sv: fallbackTitle, en: fallbackTitle },
    expected: override?.expected ?? {
      sv: data.description ?? 'Elementet ska uppfylla det angivna framgångskriteriet.',
      en: data.description ?? 'The element meets the referenced success criterion.',
    },
    observed: override?.observed,
    userImpact: override?.userImpact ?? {
      sv: `Regeln "${axeId}" från axe-core uppfylls inte på det här elementet. Se ${helpUrl} för vad det innebär för användaren.`,
      en: `The axe-core rule "${axeId}" fails on this element. See ${helpUrl} for what it means for users.`,
    },
    remediation: override?.remediation ?? {
      sv: `Följ vägledningen för regeln i axe-core: ${helpUrl}`,
      en: `Follow the axe-core guidance for this rule: ${helpUrl}`,
    },
    reproduction: override?.reproduction,
  };
}

function confidenceFor(definition: RuleDefinition | null, issue: RawIssue): Confidence {
  const data = (issue.data ?? {}) as { incomplete?: boolean };
  if (data.incomplete) return 'REVIEW_REQUIRED';
  return definition?.confidence ?? 'REVIEW_REQUIRED';
}

/** Convert one probe observation into a normalized, reviewable finding. */
export function normalizeIssue(issue: RawIssue, context: NormalizeContext): Finding {
  const locale: Locale = context.locale ?? 'sv';
  const definition = definitionFor(issue.rule, issue);
  const params: Record<string, string | number> = { ...(issue.params ?? {}) };
  for (const [key, text] of Object.entries(issue.paramsLocalized ?? {})) {
    params[key] = text[locale] || text.en;
  }

  const severity = weightByPageType((definition?.baseSeverity ?? severityFromAxeImpact(issue.impactHint)) as Severity, context.pageType);
  const signature = stableHash(issue.rule, componentSignatureFor(issue.selector));

  const observed = localize(definition?.observed, locale, params, issue.observed ?? '') || issue.observed || '';
  const catalogSteps = localizeSteps(definition?.reproduction, locale, params);
  const reproduction = catalogSteps.length
    ? catalogSteps
    : [
        locale === 'sv' ? `Öppna ${context.url}` : `Open ${context.url}`,
        locale === 'sv' ? `Leta upp elementet som matchar \`${issue.selector}\`` : `Locate the element matching \`${issue.selector}\``,
        locale === 'sv' ? 'Jämför elementet med det förväntade beteendet nedan.' : 'Compare the element against the expected behaviour below.',
      ];

  return {
    id: newId('fnd'),
    scanId: context.scanId,
    prospectId: context.prospectId,
    groupId: null,
    url: context.url,
    pageType: context.pageType,
    detectedAt: nowIso(),
    rule: issue.rule,
    wcag: wcagRefs(definition?.wcag ?? []),
    severity,
    confidence: confidenceFor(definition, issue),
    selector: issue.selector,
    html: issue.html,
    screenshotKey: null,
    reproduction,
    keyboardReproduction: KEYBOARD_ENGINES.includes(issue.engine) && catalogSteps.length ? catalogSteps : [],
    expectedBehaviour: localize(definition?.expected, locale, params),
    observedBehaviour: observed,
    userImpact: localize(definition?.userImpact, locale, params),
    remediation: localize(definition?.remediation, locale, params),
    sourceEngine: issue.engine,
    raw: issue.raw ?? issue.data ?? {},
    reviewStatus: 'unreviewed',
    reviewerNote: null,
    signature,
    componentLabel: issue.componentLabel ?? null,
    thirdParty: detectThirdParty(issue.selector, issue.html)?.id ?? null,
  };
}

export function ruleTitle(rule: string, locale: Locale = 'sv'): string {
  const direct = RULE_CATALOG[rule];
  if (direct) return direct.title[locale] || direct.title.en;
  const axeId = rule.startsWith('axe.') ? rule.slice(4) : rule;
  const override = AXE_RULE_OVERRIDES[axeId]?.title;
  if (override) return override[locale] || override.en;
  return axeId.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
