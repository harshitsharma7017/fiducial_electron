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

/**
 * A control drawn by a component library rather than a native input (Ionic and Angular Material:
 * ion-select, ion-radio, ion-checkbox, mat-select, …; or an element with a radio/checkbox/switch
 * role). `text`: what it shows (a dropdown's chosen option, a radio's label), as for buttons.
 */
export interface RecordedControl extends RecordedElement {
  text: string | null;
  checked: boolean | null;
  disabled: boolean;
}

export interface RecordedSnapshot {
  fields: RecordedField[];
  controls: RecordedControl[];
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
    // Ionic puts a box's label in its host's attribute (<ion-input label="Mobile">).
    const host = el.closest('ion-input, ion-select, ion-textarea, ion-checkbox, ion-radio');
    const attr = host?.getAttribute('label');
    if (attr) return clip(attr, 120);
    const box = el.closest('div, td, li, mat-form-field, ion-item');
    const near = box?.querySelector('label, .label, mat-label, ion-label');
    if (near && near !== el && (near as HTMLElement).innerText?.trim()) {
      return clip((near as HTMLElement).innerText, 120);
    }
    // Text written next to the box in its own container (<p>Compare <ion-select>), else a caption
    // just before the box or one of its containers (<p>Adult</p> above a counter): short text with
    // no long numbers (so a value shown elsewhere is not taken for a label), and never past an
    // element holding other controls, buttons or links (their captions are not this box's).
    const usable = (t: string | null): string | null => (t && !/\d{4,}/.test(t) ? t : null);
    const beside = Array.from(el.parentElement?.childNodes ?? [])
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(' ');
    if (usable(clip(beside, 60))) return clip(beside, 60);
    const CONTROLLED = 'input, select, textarea, button, a, ion-select, mat-select';
    for (let node: Element | null = el, up = 0; node && up < 3; node = node.parentElement, up++) {
      const prev = node.previousElementSibling as HTMLElement | null;
      if (!prev) continue;
      if (prev.matches(CONTROLLED) || prev.querySelector(CONTROLLED)) break;
      const t = usable(clip(prev.innerText, 60));
      if (t) return t;
    }
    return null;
  };
  const CONTROLS =
    'ion-select, ion-radio, ion-checkbox, ion-toggle, ion-segment-button, ion-range, mat-select, mat-radio-button, mat-checkbox, mat-slide-toggle, mat-button-toggle, [role="radio"], [role="checkbox"], [role="switch"], [role="combobox"]:not(input), [role="tab"]';
  /** What a control shows: its own text, else what its shadow root draws (ion-select's choice). */
  const controlText = (el: Element): string | null =>
    clip((el as HTMLElement).innerText) ?? clip(el.shadowRoot?.textContent ?? null);
  const controlChecked = (el: Element): boolean | null => {
    const aria = el.getAttribute('aria-checked') ?? el.getAttribute('aria-selected');
    if (aria === 'true' || aria === 'false') return aria === 'true';
    const cls = el.getAttribute('class') ?? '';
    if (
      /\b(radio|checkbox|toggle|segment-button)-checked\b|mdc-[\w-]*-checked|\bmat-[\w-]*-checked\b/.test(
        cls,
      )
    ) {
      return true;
    }
    return /^(ion-(radio|checkbox|toggle|segment-button)|mat-(radio-button|checkbox|slide-toggle|button-toggle))$/i.test(
      el.tagName,
    )
      ? el.hasAttribute('checked')
      : null;
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
    const controls = Array.from(document.querySelectorAll(CONTROLS))
      .filter(visible)
      .slice(0, 200)
      .map((el): RecordedControl => ({
        ...identity(el),
        text: controlText(el),
        checked: controlChecked(el),
        disabled:
          el.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true' ||
          /\b(select|radio|checkbox|toggle)-disabled\b/.test(el.getAttribute('class') ?? ''),
      }));
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
      document.querySelectorAll(
        'h1, h2, h3, h4, legend, .card-title, .modal-title, ion-title, ion-card-title, ion-list-header, mat-card-title, .alert-title, .alert-sub-title',
      ),
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
        '[role="dialog"], [role="alertdialog"], [role="alert"], .modal-body, .modal-content, .alert, .error, .errors, .text-danger, .help-block, .toast, .swal2-popup, ion-toast, mat-error, mat-snack-bar-container, mat-dialog-container',
      ),
    )) {
      if (messages.length >= 20 || !visible(el)) continue;
      const text = clip((el as HTMLElement).innerText, 400);
      if (text && !messages.some((m) => m.includes(text) || text.includes(m))) messages.push(text);
    }
    return {
      fields,
      controls,
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
    // A click on a component's shadow DOM reaches the page as a click on the component itself
    // (ion-select), which the list below names. Anything else drawn to be clicked (a card or tile
    // with a pointer cursor) is noted by its nearest such element.
    const CLICKABLE = `button, a, [role="button"], [role="tab"], [role="option"], [role="menuitem"], input[type="submit"], input[type="button"], input[type="radio"], input[type="checkbox"], label, mat-option, ion-item[button], ion-card[button], ${CONTROLS}`;
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as Element | null;
        let el = target?.closest(CLICKABLE) ?? null;
        for (let n = target, up = 0; !el && n && n !== document.body && up < 5; up++) {
          if (getComputedStyle(n).cursor === 'pointer') el = n;
          n = n.parentElement;
        }
        if (!el) return;
        push({
          at: Date.now(),
          kind: 'click',
          target: identity(el),
          text:
            clip((el as HTMLElement).innerText || (el as HTMLInputElement).value, 80) ??
            controlText(el) ??
            '',
        });
      },
      true,
    );
    // Ionic's controls report a choice with ionChange rather than change. Its detail belongs to the
    // page's world, so what the control shows afterwards is noted instead.
    document.addEventListener(
      'ionChange',
      (event) => {
        const el = event.target as Element | null;
        if (!el || /^ION-(INPUT|TEXTAREA|SEARCHBAR)$/.test(el.tagName)) return;
        setTimeout(() => {
          push({
            at: Date.now(),
            kind: 'change',
            field: identity(el),
            option: { value: '', text: controlText(el) ?? '' },
            checked: controlChecked(el) ?? undefined,
          });
        }, 0);
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
