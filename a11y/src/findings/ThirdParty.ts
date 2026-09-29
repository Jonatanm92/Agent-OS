/**
 * Third-party code embedded in a storefront: consent managers, chat widgets,
 * review badges, payment widgets.
 *
 * These fail accessibility checks constantly, and the merchant almost never
 * controls the markup. Leading a mini audit with "your Cookiebot dialog traps
 * focus" makes us look like we did not understand the site — so these findings
 * are attributed to the vendor, kept out of the sales artefact, and reported to
 * a paying customer in their own section with the vendor named.
 */
export interface ThirdPartyVendor {
  id: string;
  label: string;
  /** Matched against the finding's selector and DOM snippet. */
  pattern: RegExp;
  category: 'consent' | 'chat' | 'reviews' | 'payment' | 'marketing' | 'other';
}

export const THIRD_PARTY_VENDORS: ThirdPartyVendor[] = [
  { id: 'cookiebot', label: 'Cookiebot', pattern: /CybotCookiebot|cookiebot/i, category: 'consent' },
  { id: 'onetrust', label: 'OneTrust', pattern: /onetrust|optanon|ot-sdk/i, category: 'consent' },
  { id: 'cookieinformation', label: 'Cookie Information', pattern: /coi-banner|cookie-?information/i, category: 'consent' },
  { id: 'usercentrics', label: 'Usercentrics', pattern: /usercentrics|uc-banner/i, category: 'consent' },
  { id: 'didomi', label: 'Didomi', pattern: /didomi/i, category: 'consent' },
  { id: 'klaro', label: 'Klaro', pattern: /klaro/i, category: 'consent' },
  { id: 'cookieyes', label: 'CookieYes', pattern: /cookieyes|cky-/i, category: 'consent' },
  { id: 'complianz', label: 'Complianz', pattern: /cmplz-/i, category: 'consent' },
  { id: 'trustpilot', label: 'Trustpilot', pattern: /trustpilot|trustbox/i, category: 'reviews' },
  { id: 'lipscore', label: 'Lipscore', pattern: /lipscore/i, category: 'reviews' },
  { id: 'klarna', label: 'Klarna', pattern: /klarna/i, category: 'payment' },
  { id: 'swish', label: 'Swish', pattern: /swish-/i, category: 'payment' },
  { id: 'zendesk', label: 'Zendesk', pattern: /zendesk|zopim|web-?widget/i, category: 'chat' },
  { id: 'intercom', label: 'Intercom', pattern: /intercom/i, category: 'chat' },
  { id: 'drift', label: 'Drift', pattern: /drift-(widget|frame)/i, category: 'chat' },
  { id: 'giosg', label: 'Giosg', pattern: /giosg/i, category: 'chat' },
  { id: 'hubspot', label: 'HubSpot', pattern: /hubspot|hs-(form|chat)/i, category: 'marketing' },
  { id: 'klaviyo', label: 'Klaviyo', pattern: /klaviyo|kl-private/i, category: 'marketing' },
  { id: 'voyado', label: 'Voyado', pattern: /voyado/i, category: 'marketing' },
  { id: 'recaptcha', label: 'Google reCAPTCHA', pattern: /recaptcha|g-recaptcha/i, category: 'other' },
];

/**
 * Identify the vendor owning an element, or null when it is the merchant's own
 * markup. Deliberately conservative: an unrecognised widget is treated as the
 * merchant's, because wrongly excusing a real defect costs us a finding we
 * could have sold.
 */
export function detectThirdParty(selector: string, html: string): ThirdPartyVendor | null {
  const haystack = `${selector} ${html}`;
  return THIRD_PARTY_VENDORS.find((vendor) => vendor.pattern.test(haystack)) ?? null;
}

export function vendorLabel(id: string | null): string | null {
  if (!id) return null;
  return THIRD_PARTY_VENDORS.find((v) => v.id === id)?.label ?? id;
}
