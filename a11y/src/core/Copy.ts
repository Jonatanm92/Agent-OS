export type Locale = 'sv' | 'en';

export interface LocalizedText {
  sv: string;
  en: string;
}

export interface LocalizedSteps {
  sv: string[];
  en: string[];
}

/** Fill `{name}` style placeholders. Missing params are dropped, never printed. */
export function renderTemplate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  }).replace(/\s{2,}/g, ' ').trim();
}

export function pick(text: LocalizedText | undefined, locale: Locale, fallback = ''): string {
  if (!text) return fallback;
  return text[locale] || text.en || text.sv || fallback;
}

export function pickSteps(steps: LocalizedSteps | undefined, locale: Locale): string[] {
  if (!steps) return [];
  return steps[locale]?.length ? steps[locale] : steps.en;
}

export function localize(text: LocalizedText | undefined, locale: Locale, params: Record<string, string | number> = {}, fallback = ''): string {
  return renderTemplate(pick(text, locale, fallback), params);
}

export function localizeSteps(steps: LocalizedSteps | undefined, locale: Locale, params: Record<string, string | number> = {}): string[] {
  return pickSteps(steps, locale).map((step) => renderTemplate(step, params));
}
