// Form recordings: the structure of an insurer's quote flow, captured while the advisor walks
// through it once with a dummy client, so the quote automation can be built from it.
//
// A recording holds structure only: pages, fields (kind, name, label, options), buttons, the order
// of clicks and page changes, the portal's messages, and the requests it sent (address and field
// names, and which of them were sent empty). It never holds what was typed into a text, number, date, email, phone or password box:
// only that something was entered, and its length. Any text kept (labels, headings, messages, the
// text around a premium) passes through redactText, which masks digit runs of 8 or more (phone,
// ID and policy numbers) and email addresses; addresses pass through
// redactUrl, which keeps query parameter names but drops their values.

export const RECORDING_FORMAT = 'fqf-form-recording';
export const RECORDING_VERSION = 1;

/** Masks what could identify a person or an account in captured text, and bounds its length. */
export function redactText(text: string, max = 160): string {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    // Runs of 8 or more digits (with optional separators) are phone, ID, agent or policy numbers.
    // Shorter runs stay: they are amounts (300000), ages, years and pincodes, which the portal's
    // messages and options are about.
    .replace(/\d(?:[\s-]?\d){7,}/g, (run) =>
      '#'.repeat(Math.min(run.replace(/\D/g, '').length, 12)),
    );
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

/**
 * For values the portal itself defines (dropdown options, radio and checkbox values): digits are
 * kept, since they carry meaning such as a sum insured of 1000000; emails are still masked.
 */
export function redactChoice(text: string, max = 120): string {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}\u2026` : cleaned;
}

/** Keeps origin, path and hash route; query and hash parameters keep their names only. */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '<invalid>';
  }
  const params = (search: URLSearchParams): string =>
    [...new Set([...search.keys()])].map((k) => `${redactText(k, 40)}=…`).join('&');
  const query = params(parsed.searchParams);
  let hash = parsed.hash;
  const q = hash.indexOf('?');
  if (q >= 0) {
    const hashQuery = params(new URLSearchParams(hash.slice(q + 1)));
    hash = `${hash.slice(0, q)}${hashQuery ? `?${hashQuery}` : ''}`;
  }
  const path = parsed.pathname.replace(/\d{5,}/g, '#####').replace(/;jsessionid=[^/]*/i, '');
  return `${parsed.origin}${path}${query ? `?${query}` : ''}${hash}`;
}

/**
 * Field names of a request body (form-encoded or JSON), never values; nested JSON keys as dotted
 * paths. Returns null for bodies that are neither.
 */
export function bodyFieldNames(body: string, contentType: string): string[] | null {
  const limit = (names: string[]) =>
    [...new Set(names)].slice(0, 200).map((n) => redactText(n, 80));
  if (/application\/x-www-form-urlencoded/i.test(contentType)) {
    return limit([...new URLSearchParams(body).keys()]);
  }
  if (/json/i.test(contentType) || /^\s*[[{]/.test(body)) {
    try {
      const names: string[] = [];
      const walk = (value: unknown, prefix: string, depth: number): void => {
        if (depth > 6 || names.length > 400) return;
        if (Array.isArray(value)) {
          if (value.length > 0) walk(value[0], `${prefix}[]`, depth + 1);
          return;
        }
        if (value && typeof value === 'object') {
          for (const [k, v] of Object.entries(value)) {
            const path = prefix ? `${prefix}.${k}` : k;
            names.push(path);
            walk(v, path, depth + 1);
          }
        }
      };
      walk(JSON.parse(body), '', 0);
      return limit(names);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The fields of a request body sent empty (""), by name only: what a portal's server may refuse
 * ("Conversion from string "" to type Boolean is not valid.", United India, 11 November 2026).
 * Returns null for bodies that are neither form-encoded nor JSON.
 */
export function bodyEmptyFieldNames(body: string, contentType: string): string[] | null {
  const limit = (names: string[]) =>
    [...new Set(names)].slice(0, 200).map((n) => redactText(n, 80));
  if (/application\/x-www-form-urlencoded/i.test(contentType)) {
    return limit([...new URLSearchParams(body)].filter(([, v]) => v === '').map(([k]) => k));
  }
  if (/json/i.test(contentType) || /^\s*[[{]/.test(body)) {
    try {
      const names: string[] = [];
      const walk = (value: unknown, prefix: string, depth: number): void => {
        if (depth > 6 || names.length > 400) return;
        if (value === '') {
          names.push(prefix);
          return;
        }
        if (Array.isArray(value)) {
          value.slice(0, 20).forEach((v, i) => walk(v, `${prefix}[${i}]`, depth + 1));
          return;
        }
        if (value && typeof value === 'object') {
          for (const [k, v] of Object.entries(value))
            walk(v, prefix ? `${prefix}.${k}` : k, depth + 1);
        }
      };
      walk(JSON.parse(body), '', 0);
      return limit(names);
    } catch {
      return null;
    }
  }
  return null;
}
