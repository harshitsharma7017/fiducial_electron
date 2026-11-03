// The in-page form recorder (see src/shared/insurers/recording.ts). Serialised with toString and
// run in an isolated world of the portal window, so it must stay self-contained.
//
// "drain" installs the recorder on first use (listeners for changes, clicks and submits), then
// returns the page's current structure (only when it changed) and the events since the last drain.
// It never reads the value of a text-like box (text, number, date, email, phone, password,
// textarea): only its length. Selected options of dropdowns, radios and checkboxes are kept, since
// they are form choices. Everything returned is redacted again in the main process before it is
// kept.

export interface RecordedElement {
  tag: string;
  type: string | null;
  id: string | null;
  name: string | null;
  formControl: string | null;
  ngModel: string | null;
  ariaLabel: string | null;
  placeholder: string | null;
  label: string | null;
  path: string;
}

export interface RecordedField extends RecordedElement {
  required: boolean;
  readOnly: boolean;
  disabled: boolean;
  visible: boolean;
  maxLength: number | null;
  options: { value: string; text: string }[] | null;
  /** Radios and checkboxes only. */
  value: string | null;
  checked: boolean | null;
}

export interface RecordedSnapshot {
  fields: RecordedField[];
  buttons: (RecordedElement & { text: string; visible: boolean })[];
  headings: string[];
  money: { path: string; text: string; context: string }[];
  /** Visible text of pop-ups, alerts and error messages (what the portal is telling the user). */
  messages: string[];
  frames: number;
  canvases: number;
}

export type RecordedEvent =
  | {
      at: number;
      kind: 'change';
      field: RecordedElement;
      length?: number;
      option?: { value: string; text: string };
      checked?: boolean;
      value?: string;
    }
  | { at: number; kind: 'click'; target: RecordedElement; text: string }
  | { at: number; kind: 'submit'; form: RecordedElement };

export interface RecorderDrain {
  url: string;
  title: string;
  snapshot: RecordedSnapshot | null;
  events: RecordedEvent[];
}

export function formRecorderAgent(): RecorderDrain {
  const TEXT_LIKE = [
    'text',
    'password',
    'email',
    'tel',
    'number',
    'date',
    'datetime-local',
    'month',
    'search',
    'url',
    '',
  ];
  const clip = (s: string | null | undefined, n = 160): string | null =>
    s ? s.replace(/\s+/g, ' ').trim().slice(0, n) || null : null;
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const cssPath = (el: Element): string => {
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${el.id}`;
    const parts: string[] = [];
    let node: Element | null = el;
    for (let depth = 0; node && depth < 5; depth += 1) {
      const tag = node.tagName.toLowerCase();
      const name = node.getAttribute('name') ?? node.getAttribute('formcontrolname');
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
        parts.unshift(`#${node.id}`);
        break;
      }
      let part = tag;
      if (name) part += `[${node.hasAttribute('name') ? 'name' : 'formcontrolname'}="${name}"]`;
      else if (node.parentElement) {
        const same = Array.from(node.parentElement.children).filter(
          (c) => c.tagName === node!.tagName,
        );
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const labelOf = (el: Element): string | null => {
    const input = el as HTMLInputElement;
    const own = input.labels && input.labels.length > 0 ? input.labels[0]?.innerText : null;
    if (own) return clip(own, 120);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText ?? '')
        .join(' ');
      if (text.trim()) return clip(text, 120);
    }
    const wrap = el.closest('label');
    if (wrap) return clip(wrap.innerText, 120);
    const box = el.closest('div, td, li, mat-form-field, ion-item');
    const near = box?.querySelector('label, .label, mat-label, ion-label');
    return near && near !== el ? clip((near as HTMLElement).innerText, 120) : null;
  };
  const identity = (el: Element): RecordedElement => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type'),
    id: el.id || null,
    name: el.getAttribute('name'),
    formControl: el.getAttribute('formcontrolname'),
    ngModel: el.getAttribute('ng-model') ?? el.getAttribute('data-ng-model'),
    ariaLabel: clip(el.getAttribute('aria-label'), 120),
    placeholder: clip(el.getAttribute('placeholder'), 120),
    label: labelOf(el),
    path: cssPath(el),
  });
  const isTextLike = (el: Element): boolean =>
    el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && TEXT_LIKE.includes((el.getAttribute('type') ?? '').toLowerCase()));

  const snapshot = (): RecordedSnapshot => {
    const fields = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((el) => (el.getAttribute('type') ?? '').toLowerCase() !== 'hidden')
      .slice(0, 300)
      .map((el): RecordedField => {
        const input = el as HTMLInputElement;
        const isChoice = el.tagName === 'INPUT' && ['radio', 'checkbox'].includes(input.type);
        return {
          ...identity(el),
          required: input.required || el.getAttribute('aria-required') === 'true',
          readOnly: !!input.readOnly,
          disabled: !!input.disabled,
          visible: visible(el),
          maxLength: input.maxLength > 0 ? input.maxLength : null,
          options:
            el.tagName === 'SELECT'
              ? Array.from((el as HTMLSelectElement).options)
                  .slice(0, 300)
                  .map((o) => ({ value: o.value.slice(0, 80), text: clip(o.text, 80) ?? '' }))
              : null,
          value: isChoice ? input.value.slice(0, 80) : null,
          checked: isChoice ? input.checked : null,
        };
      });
    const buttons = Array.from(
      document.querySelectorAll(
        'button, a[role="button"], [role="button"], input[type="submit"], input[type="button"], a[href]',
      ),
    )
      .filter(visible)
      .slice(0, 150)
      .map((el) => ({
        ...identity(el),
        text: clip((el as HTMLElement).innerText || (el as HTMLInputElement).value, 80) ?? '',
        visible: true,
      }));
    const headings = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, legend, .card-title, .modal-title'),
    )
      .filter(visible)
      .map((h) => clip((h as HTMLElement).innerText, 120) ?? '')
      .filter(Boolean)
      .slice(0, 40);
    // Amounts: text with a currency sign, or a plain number (3 digits or more, optionally with
    // separators and decimals) whose row or label talks about a premium (portals often show
    // "Total Premium | 12,345.00" without a sign). Read-only boxes count too: some portals show
    // the premium in one. Long ID-like numbers are masked later by the redaction.
    const money: RecordedSnapshot['money'] = [];
    const CURRENCY = /(₹|\bRs\.?|\bINR)\s*[\d,]+/i;
    const AMOUNT =
      /^[^\d]{0,6}\d{1,3}(?:[,\s]?\d{2,3})*(?:\.\d{1,2})?[^\d]{0,6}$|^\d{3,}(?:\.\d{1,2})?$/;
    const PREMIUM_WORDS = /premium|total|net|gst|tax|od\b|tp\b|idv|payable|amount|cover/i;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (money.length >= 60) break;
      if (!visible(el)) continue;
      const isBox = el instanceof HTMLInputElement && (el.readOnly || el.disabled);
      if (el.children.length > 0 && !isBox) continue;
      const text = (isBox ? el.value : ((el as HTMLElement).innerText ?? '')).trim();
      if (!text || text.length > 80) continue;
      const row = el.closest('tr, li, .row, .form-group, div') ?? el.parentElement;
      const context = clip(row?.textContent ?? '', 160) ?? '';
      const label = isBox ? (labelOf(el) ?? '') : '';
      const looksLikeAmount =
        CURRENCY.test(text) || (AMOUNT.test(text) && /\d{3}/.test(text.replace(/[,\s]/g, '')));
      if (!looksLikeAmount) continue;
      if (!CURRENCY.test(text) && !PREMIUM_WORDS.test(`${context} ${label}`)) continue;
      money.push({
        path: cssPath(el),
        text: clip(text, 80) ?? '',
        context: clip(`${label} ${context}`, 160) ?? '',
      });
    }
    const messages: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [role="alert"], .modal-body, .modal-content, .alert, .error, .errors, .text-danger, .help-block, .toast, .swal2-popup',
      ),
    )) {
      if (messages.length >= 20 || !visible(el)) continue;
      const text = clip((el as HTMLElement).innerText, 400);
      if (text && !messages.some((m) => m.includes(text) || text.includes(m))) messages.push(text);
    }
    return {
      fields,
      buttons,
      headings,
      money,
      messages,
      frames: document.querySelectorAll('iframe').length,
      canvases: document.querySelectorAll('canvas').length,
    };
  };

  type State = { events: RecordedEvent[]; last: string };
  const g = globalThis as unknown as { __fqfFormRecorder?: State };
  if (!g.__fqfFormRecorder) {
    const state: State = { events: [], last: '' };
    g.__fqfFormRecorder = state;
    const push = (e: RecordedEvent) => {
      if (state.events.length < 2000) state.events.push(e);
    };
    document.addEventListener(
      'change',
      (event) => {
        const el = event.target as Element | null;
        if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
        const base = { at: Date.now(), kind: 'change' as const, field: identity(el) };
        if (el.tagName === 'SELECT') {
          const o = (el as HTMLSelectElement).selectedOptions[0];
          push({
            ...base,
            option: { value: (o?.value ?? '').slice(0, 80), text: clip(o?.text, 80) ?? '' },
          });
        } else if (isTextLike(el)) {
          push({ ...base, length: (el as HTMLInputElement).value.length });
        } else {
          const input = el as HTMLInputElement;
          push({ ...base, checked: input.checked, value: input.value.slice(0, 80) });
        }
      },
      true,
    );
    document.addEventListener(
      'click',
      (event) => {
        const el = (event.target as Element | null)?.closest(
          'button, a, [role="button"], [role="tab"], [role="option"], input[type="submit"], input[type="button"], input[type="radio"], input[type="checkbox"], label',
        );
        if (!el) return;
        push({
          at: Date.now(),
          kind: 'click',
          target: identity(el),
          text: clip((el as HTMLElement).innerText || (el as HTMLInputElement).value, 80) ?? '',
        });
      },
      true,
    );
    document.addEventListener(
      'submit',
      (event) => {
        const form = event.target as Element | null;
        if (form) push({ at: Date.now(), kind: 'submit', form: identity(form) });
      },
      true,
    );
  }
  const state = g.__fqfFormRecorder;
  const current = snapshot();
  const key = JSON.stringify(current);
  const changed = key !== state.last;
  state.last = key;
  return {
    url: location.href,
    title: document.title.slice(0, 120),
    snapshot: changed ? current : null,
    events: state.events.splice(0, state.events.length),
  };
}
