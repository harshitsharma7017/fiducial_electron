// The in-page operations a quote automation is made of, and the agent that performs them in the
// insurer's window (isolated world). The agent is serialised with toString, so it must stay
// self-contained: no imports, no outer variables.
//
// Every operation waits (bounded) for what it needs, acts like a person would (choosing an option,
// typing, clicking a radio or a button) and checks the result. It never reads back what a box
// holds except to compare it with the expected value inside the page, returning only whether they
// match. A "within" text scopes an operation to the visible pop-up (dialog) that contains it.
// `row: 'current'` scopes it to the table row marked by the last ensureEmptyRow (a table with one
// row per member, such as United India's Add Children). Portals redraw rows (AngularJS replaces a
// row after its date of birth is chosen), losing the mark; `rowKey` then finds the row again by
// what was entered in it (the date of birth) and marks it again.

/** Finds a row again by a box in it and the value entered there. */
export interface RowKey {
  within: string;
  input: string;
  value: string;
}

export type PageOp =
  | { op: 'waitFor'; selector: string; within?: string; timeoutMs: number }
  | { op: 'waitForDialog'; text: string; timeoutMs: number }
  | { op: 'waitForDialogGone'; text: string; timeoutMs: number }
  /**
   * Makes sure the pop-up has an empty row (a select matching `selector` with no value yet),
   * pressing `addButton` only if there is none, waits for it, and marks it as the current row.
   */
  | {
      op: 'ensureEmptyRow';
      selector: string;
      within: string;
      addButton: string;
      timeoutMs: number;
    }
  | {
      op: 'select';
      selector: string;
      value: string;
      within?: string;
      row?: 'current';
      rowKey?: RowKey;
    }
  | { op: 'type'; selector: string; value: string }
  /**
   * Waits until the box holds a value other than `rejectValues` (for example an age box that shows
   * "0" until the portal has worked the age out from the date of birth).
   */
  | {
      op: 'waitForValue';
      selector: string;
      timeoutMs: number;
      rejectValues?: string[];
      within?: string;
      row?: 'current';
      rowKey?: RowKey;
      /** Carry on when the wait times out (the wait only helps; it is not a check). */
      soft?: boolean;
    }
  | { op: 'pause'; ms: number }
  | {
      op: 'radio';
      name: string;
      value: string;
      within?: string;
      row?: 'current';
      rowKey?: RowKey;
    }
  | { op: 'clickButton'; text: string; within?: string; timeoutMs: number }
  | { op: 'clickLink'; text: string }
  /** Chooses an option (by value or visible text) or fills a box; re-checked like select. */
  | { op: 'setField'; selector: string; value: string; within?: string }
  /** Ticks or unticks a checkbox (or picks a radio) by selector; re-checked like select. */
  | { op: 'check'; selector: string; checked: boolean; within?: string }
  /** Reads the first data row of the pop-up's table: its label and the cell under `column`. */
  | { op: 'readTable'; within: string; column: string; timeoutMs: number }
  | {
      op: 'pickDate';
      /** What opens the calendar; if absent, a button or icon next to the date box. */
      trigger?: string;
      /** The box the chosen date appears in, as dd/mm/yyyy. */
      input: string;
      /** YYYY-MM-DD. */
      date: string;
      within?: string;
      row?: 'current';
    }
  | { op: 'errors' };

export interface PageOpResult {
  ok: boolean;
  /** Why it failed: a short code, never a value. */
  detail?: string;
  /** For "errors": the text of a visible ERRORS pop-up. */
  errors?: string;
  /** For "readTable": the cell read, and the row's label. */
  value?: string;
  label?: string;
}

export async function quotePageAgent(command: PageOp): Promise<PageOpResult> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const text = (el: Element): string =>
    ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
  const DIALOGS = '.modal-content, .modal, [role="dialog"], [role="alertdialog"]';
  /** The visible pop-up containing `within`, or the document when no scope is given. */
  const scope = (within?: string): ParentNode | null => {
    if (!within) return document;
    const roots = Array.from(document.querySelectorAll(DIALOGS)).filter(
      (el) => visible(el) && text(el).includes(within),
    );
    // The innermost matching pop-up (a modal-content inside a modal, for example).
    return roots.sort((a, b) => text(a).length - text(b).length)[0] ?? null;
  };
  const mark = (row: Element): Element => {
    for (const marked of Array.from(document.querySelectorAll('[data-fqf-row]'))) {
      if (marked !== row) marked.removeAttribute('data-fqf-row');
    }
    row.setAttribute('data-fqf-row', 'current');
    return row;
  };
  /**
   * The row marked by the last ensureEmptyRow, if still shown; else the row found again by
   * `rowKey` (preferring, for twins, one where `pending` says this step is still to do).
   */
  const currentRow = (key?: RowKey, pending?: (row: Element) => boolean): Element | null => {
    const row = document.querySelector('[data-fqf-row="current"]');
    if (row && visible(row)) return row;
    if (!key) return null;
    const root = scope(key.within);
    const rows = root
      ? Array.from(root.querySelectorAll('tr')).filter(
          (tr) =>
            visible(tr) &&
            Array.from(tr.querySelectorAll(key.input)).some(
              (i) => (i as HTMLInputElement).value === key.value,
            ),
        )
      : [];
    const found = rows.find((tr) => pending?.(tr) ?? true) ?? rows[0];
    return found ? mark(found) : null;
  };
  const rootFor = (
    c: { within?: string; row?: 'current'; rowKey?: RowKey },
    pending?: (row: Element) => boolean,
  ): ParentNode | null => (c.row === 'current' ? currentRow(c.rowKey, pending) : scope(c.within));
  const until = async <T>(
    find: () => T | null | undefined,
    timeoutMs: number,
  ): Promise<T | null> => {
    const deadline = Date.now() + Math.min(timeoutMs, 60_000);
    for (;;) {
      const found = find();
      if (found) return found;
      if (Date.now() >= deadline) return null;
      await sleep(200);
    }
  };
  const first = (root: ParentNode, selector: string): HTMLElement | null =>
    (Array.from(root.querySelectorAll(selector)).find(visible) as HTMLElement | undefined) ?? null;
  const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }));
  /** A select (or box) with no chosen value yet: '' or AngularJS's "? …" placeholder. */
  const isEmptyChoice = (el: Element): boolean => {
    const value = (el as HTMLSelectElement).value ?? '';
    return value === '' || /^\?.*\?$/.test(value);
  };
  const buttonWithText = (root: ParentNode, label: string): HTMLElement | null =>
    (Array.from(
      root.querySelectorAll('button, input[type="button"], input[type="submit"], a'),
    ).find((b) => visible(b) && (text(b) || (b as HTMLInputElement).value) === label) as
      HTMLElement | undefined) ?? null;

  switch (command.op) {
    case 'waitFor': {
      const found = await until(() => {
        const root = scope(command.within);
        return root ? first(root, command.selector) : null;
      }, command.timeoutMs);
      return found ? { ok: true } : { ok: false, detail: 'not-found' };
    }
    case 'waitForDialog': {
      const found = await until(() => scope(command.text), command.timeoutMs);
      return found ? { ok: true } : { ok: false, detail: 'dialog-not-shown' };
    }
    case 'waitForDialogGone': {
      const gone = await until(() => (scope(command.text) ? null : true), command.timeoutMs);
      return gone ? { ok: true } : { ok: false, detail: 'dialog-still-open' };
    }
    case 'ensureEmptyRow': {
      const emptyBox = (): Element | null => {
        const root = scope(command.within);
        return root
          ? (Array.from(root.querySelectorAll(command.selector)).find(
              (el) => visible(el) && isEmptyChoice(el),
            ) ?? null)
          : null;
      };
      let box = emptyBox();
      if (!box) {
        const root = scope(command.within);
        const add = root ? buttonWithText(root, command.addButton) : null;
        if (!add) return { ok: false, detail: 'add-button-not-found' };
        add.click();
        box = await until(emptyBox, command.timeoutMs);
        if (!box) return { ok: false, detail: 'no-new-row' };
      }
      const row = box.closest('tr') ?? box.parentElement;
      if (!row) return { ok: false, detail: 'row-not-found' };
      mark(row);
      return { ok: true };
    }
    case 'select': {
      const pending = (tr: Element): boolean =>
        Array.from(tr.querySelectorAll(command.selector)).some((e) => isEmptyChoice(e));
      // Looked up afresh each time: the portal may redraw the row or the field meanwhile.
      const find = (): HTMLSelectElement | null => {
        const root = rootFor(command, pending);
        const el = root ? first(root, command.selector) : null;
        return el instanceof HTMLSelectElement ? el : null;
      };
      // Set it, then check again shortly after: a portal may reset fields when an earlier answer
      // comes back from its server. Set it once more if so; a second reset stops the run.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const el = find();
        if (!el) {
          if (attempt > 0) break;
          const root = rootFor(command, pending);
          const all = (root ?? document).querySelectorAll(command.selector).length;
          return {
            ok: false,
            detail: root ? `not-found (${all} matching, none shown)` : 'scope-not-shown',
          };
        }
        if (!Array.from(el.options).some((o) => o.value === command.value)) {
          return { ok: false, detail: 'option-missing' };
        }
        el.focus();
        el.value = command.value;
        fire(el, 'change');
        el.blur();
        await sleep(700);
        if (find()?.value === command.value) return { ok: true };
      }
      return { ok: false, detail: 'reset-by-page' };
    }
    case 'type': {
      const el = first(document, command.selector);
      if (!(el instanceof HTMLInputElement)) return { ok: false, detail: 'not-found' };
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (setter?.set) setter.set.call(el, command.value);
      else el.value = command.value;
      fire(el, 'input');
      fire(el, 'keyup');
      fire(el, 'change');
      el.blur();
      return el.value === command.value ? { ok: true } : { ok: false, detail: 'not-kept' };
    }
    case 'waitForValue': {
      const rejected = command.rejectValues ?? [];
      const box = (): HTMLInputElement | null => {
        const root = rootFor(command);
        return root ? (first(root, command.selector) as HTMLInputElement | null) : null;
      };
      const found = await until(() => {
        const value = box()?.value.trim() ?? '';
        return value !== '' && !rejected.includes(value) ? true : null;
      }, command.timeoutMs);
      if (found) return { ok: true };
      if (command.soft) return { ok: true, detail: 'wait-timed-out' };
      // What the box showed, without its value: missing, empty, or one of the rejected values.
      const last = box();
      const seen = !last
        ? 'box not found'
        : last.value.trim() === ''
          ? 'box empty'
          : `box shows ${last.value.trim()}`;
      return { ok: false, detail: `still-empty: ${seen}` };
    }
    case 'pause': {
      await sleep(Math.min(command.ms, 10_000));
      return { ok: true };
    }
    case 'radio': {
      const pending = (tr: Element): boolean =>
        !Array.from(tr.querySelectorAll('input[type="radio"]')).some(
          (r) => r.getAttribute('name') === command.name && (r as HTMLInputElement).checked,
        );
      const find = (): HTMLInputElement | null => {
        const root = rootFor(command, pending);
        return root
          ? ((Array.from(root.querySelectorAll('input[type="radio"]')).find(
              (r) =>
                visible(r) &&
                r.getAttribute('name') === command.name &&
                (r as HTMLInputElement).value === command.value,
            ) as HTMLInputElement | undefined) ?? null)
          : null;
      };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const el = find();
        if (!el) return { ok: false, detail: attempt === 0 ? 'not-found' : 'reset-by-page' };
        if (!el.checked) el.click();
        await sleep(700);
        // Reset by the page meanwhile (see select): answer once more.
        if (find()?.checked) return { ok: true };
      }
      return { ok: false, detail: 'reset-by-page' };
    }
    case 'clickButton': {
      const button = await until(() => {
        const root = scope(command.within);
        return root ? buttonWithText(root, command.text) : null;
      }, command.timeoutMs);
      if (!button) return { ok: false, detail: 'not-found' };
      if ((button as HTMLButtonElement).disabled) return { ok: false, detail: 'disabled' };
      button.click();
      return { ok: true };
    }
    case 'clickLink': {
      const link = Array.from(document.querySelectorAll('a')).find(
        (a) => visible(a) && text(a) === command.text,
      );
      if (!link) return { ok: false, detail: 'not-found' };
      link.click();
      return { ok: true };
    }
    case 'pickDate': {
      const [y, m, d] = command.date.split('-').map(Number) as [number, number, number];
      const MONTHS = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      // The date as the box may show it: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, dd-Mon-yyyy, or (as
      // some calendars set it by default) mm/dd/yyyy: we chose the day ourselves, so those numbers
      // in that order can only be our date.
      const sameDate = (value: string): boolean => {
        const v = value.trim().toLowerCase();
        const dd = String(d).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const digits = v.replace(/[^0-9]+/g, '-');
        if ([`${dd}-${mm}-${y}`, `${y}-${mm}-${dd}`, `${mm}-${dd}-${y}`].includes(digits))
          return true;
        const mon = MONTHS[m - 1]!.toLowerCase().slice(0, 3);
        return (
          v.includes(String(y)) && v.includes(mon) && new RegExp(`(^|\\D)0?${d}(\\D|$)`).test(v)
        );
      };
      const root = rootFor(command);
      if (!root) return { ok: false, detail: 'scope-not-shown' };
      const box = () => first(root, command.input) as HTMLInputElement | null;
      // Already showing that date (United India fills the risk start date with today itself).
      if (sameDate(box()?.value ?? '')) return { ok: true, detail: 'already-set' };
      // A full press: some calendars act on mousedown, others on click.
      const press = (el: Element): void => {
        const at = { bubbles: true, cancelable: true, view: window, button: 0 };
        el.dispatchEvent(new PointerEvent('pointerdown', at));
        el.dispatchEvent(new MouseEvent('mousedown', at));
        el.dispatchEvent(new PointerEvent('pointerup', at));
        el.dispatchEvent(new MouseEvent('mouseup', at));
        (el as HTMLElement).click();
      };
      // For support: an element in a few words (tag, class, text).
      const describe = (el: Element | null | undefined): string =>
        el
          ? `${el.tagName.toLowerCase()}${el.getAttribute('class') ? '.' + el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}"${text(el).slice(0, 20)}"`
          : 'none';
      // What opens the calendar: the given trigger, else something right next to the date box
      // (in its own group) that looks like a calendar opener: a calendar/date icon, an input-group
      // add-on, or a button without text. Never a button with text (that could be anything, such
      // as the form's own submit). Else the box itself.
      let trigger: HTMLElement | null = command.trigger ? first(root, command.trigger) : null;
      if (!trigger) {
        const input = first(root, command.input);
        if (!input) return { ok: false, detail: 'trigger-not-found' };
        const looksLikeOpener = (el: Element): boolean => {
          const marks = [
            el.getAttribute('class'),
            ...Array.from(el.querySelectorAll('[class]')).map((c) => c.getAttribute('class')),
          ].join(' ');
          return (
            /calendar|date|input-group-addon|input-group-btn/i.test(marks) ||
            (el.tagName === 'BUTTON' && text(el) === '')
          );
        };
        for (
          let near = input.parentElement, level = 0;
          near && !trigger && level < 2;
          level += 1, near = near.parentElement
        ) {
          trigger =
            (Array.from(
              near.querySelectorAll(
                'button, [ng-click], .input-group-addon, .input-group-btn, i, span',
              ),
            ).find(
              (el) => el !== input && !el.contains(input) && visible(el) && looksLikeOpener(el),
            ) as HTMLElement | undefined) ?? null;
        }
        trigger ??= input;
      }
      if (!trigger) return { ok: false, detail: 'trigger-not-found' };
      press(trigger);
      const TITLE = new RegExp(`(${MONTHS.join('|')}) (\\d{4})`);
      const EXACT_TITLE = new RegExp(`^(${MONTHS.join('|')}) (\\d{4})$`);
      // The calendar: the smallest container that holds the month-year title and the day grid or
      // the Cancel/OK buttons. Found from its « button (United India health: the title shares the
      // header row with « ‹ › ») or from the title itself (calendars without «).
      const isWholeCalendar = (node: Element): boolean =>
        TITLE.test(node.textContent ?? '') &&
        (node.querySelector('table, [role="grid"], [role="gridcell"]') !== null ||
          buttonWithText(node, 'OK') !== null ||
          buttonWithText(node, 'Cancel') !== null);
      const climb = (start: Element | null): HTMLElement | null => {
        let node = start;
        while (node && node !== document.body && !isWholeCalendar(node)) node = node.parentElement;
        return node && node !== document.body ? (node as HTMLElement) : null;
      };
      const picker = await until(() => {
        const fromArrows = climb(buttonWithText(document, '«'));
        if (fromArrows) return fromArrows;
        const title = Array.from(
          document.querySelectorAll('button, strong, th, span, h1, h2, h3, h4, h5, div'),
        )
          .filter((el) => visible(el) && el.children.length <= 1 && EXACT_TITLE.test(text(el)))
          .map((el) => climb(el))
          .find((c) => c !== null);
        return title ?? null;
      }, 5000);
      if (!picker)
        return { ok: false, detail: `calendar-not-shown (opened with ${describe(trigger)})` };
      const shown = (): { year: number; month: number } | null => {
        const match = TITLE.exec(picker.textContent ?? '');
        return match ? { year: Number(match[2]), month: MONTHS.indexOf(match[1]!) + 1 } : null;
      };
      // Previous / next: by text (« ‹ › », < >, Prev / Next), else by an icon or label that says so.
      const navButton = (dir: 'prev' | 'next'): HTMLElement | null => {
        const texts = dir === 'prev' ? ['‹', '<', 'Prev', 'Previous'] : ['›', '>', 'Next'];
        for (const t of texts) {
          const b = buttonWithText(picker, t);
          if (b) return b;
        }
        const hint = dir === 'prev' ? /prev|left/i : /next|right/i;
        const own = (b: Element): string =>
          ['class', 'aria-label', 'title', 'role'].map((a) => b.getAttribute(a) ?? '').join(' ');
        const marked = (b: Element): boolean => {
          if (!visible(b) || EXACT_TITLE.test(text(b))) return false;
          const marks = [own(b), ...Array.from(b.querySelectorAll('[class]')).map(own)].join(' ');
          return hint.test(marks);
        };
        // A button (or link) that says so; else any element that says so itself, such as gijgo's
        // <div role="prev"><i class="gj-icon chevron-left">; a header cell around one only last
        // (a click on the cell does not reach the button inside).
        const button = Array.from(picker.querySelectorAll('button, a, [ng-click]')).find(marked);
        if (button) return button as HTMLElement;
        const element = Array.from(picker.querySelectorAll('*')).find(
          (b) =>
            b.tagName !== 'TH' && visible(b) && !EXACT_TITLE.test(text(b)) && hint.test(own(b)),
        );
        if (element) return element as HTMLElement;
        return (
          (Array.from(picker.querySelectorAll('th')).find(marked) as HTMLElement | undefined) ??
          null
        );
      };
      for (let i = 0; ; i += 1) {
        const now = shown();
        if (!now) return { ok: false, detail: 'calendar-title-not-found' };
        if (now.year === y && now.month === m) break;
        if (i >= 1200) return { ok: false, detail: 'calendar-did-not-reach-date' };
        // Whole years with « » when the calendar has them; otherwise month by month.
        const yearButton = now.year !== y ? buttonWithText(picker, now.year > y ? '«' : '»') : null;
        const nav =
          yearButton ?? navButton(now.year * 12 + now.month > y * 12 + m ? 'prev' : 'next');
        if (!nav) {
          const header = Array.from(picker.querySelectorAll('*'))
            .slice(0, 8)
            .map(
              (el) =>
                `${el.tagName.toLowerCase()}[${['class', 'role'].map((a) => el.getAttribute(a) ?? '').join('|')}]`,
            )
            .join(' ');
          return {
            ok: false,
            detail: `calendar-navigation-missing (calendar starts: ${header.slice(0, 200)})`,
          };
        }
        press(nav);
        await sleep(yearButton ? 60 : 40);
      }
      // The day: an element of the calendar whose text is exactly the day number and that is not
      // greyed out (days of the neighbouring months are).
      const OUTSIDE = /muted|disabled|old|new|other|off|outside/i;
      const greyed = (el: Element): boolean => {
        for (let n: Element | null = el; n && n !== picker; n = n.parentElement) {
          if (OUTSIDE.test(n.getAttribute('class') ?? '') || n.hasAttribute('disabled')) {
            return true;
          }
        }
        // The marking can also sit on the number inside (a span with text-muted).
        return Array.from(el.querySelectorAll('[class]')).some((c) =>
          OUTSIDE.test(c.getAttribute('class') ?? ''),
        );
      };
      const days = Array.from(picker.querySelectorAll('button, td, span, a, div')).filter(
        (el) =>
          visible(el) &&
          el.children.length <= 1 &&
          [String(d), String(d).padStart(2, '0')].includes(text(el)) &&
          !greyed(el),
      );
      const cell =
        days.find((el) => el.tagName === 'BUTTON') ??
        days.find((el) => el.tagName === 'TD') ??
        days[0];
      // Pressed on the number itself (the innermost element showing it): the press then reaches
      // every element around it too. gijgo listens on the <div> inside the cell, not on the cell.
      let day = cell;
      for (let inner = day; inner;) {
        day = inner;
        inner = days.find((el) => el !== day && day!.contains(el));
      }
      if (!day)
        return {
          ok: false,
          detail: `day-not-found (calendar shows ${shown()?.month}/${shown()?.year})`,
        };
      press(day);
      let set = await until(() => (sameDate(box()?.value ?? '') ? true : null), 2500);
      if (!set) {
        // Some calendars need OK (or Done) after the day.
        const ok =
          buttonWithText(picker, 'OK') ??
          buttonWithText(picker, 'Ok') ??
          buttonWithText(picker, 'Done');
        if (ok && visible(ok)) {
          ok.click();
          set = await until(() => (sameDate(box()?.value ?? '') ? true : null), 2500);
        }
      }
      return set
        ? { ok: true }
        : {
            ok: false,
            detail: `date-not-set: box shows "${box()?.value ?? ''}", clicked ${describe(day)} in ${describe(picker).slice(0, 60)}, opened with ${describe(trigger)}`,
          };
    }
    case 'setField': {
      // A dropdown (option by value, AngularJS "string:" value, or visible text) or a box.
      const find = (): HTMLSelectElement | HTMLInputElement | null => {
        const root = scope(command.within);
        const el = root ? first(root, command.selector) : null;
        return el instanceof HTMLSelectElement || el instanceof HTMLInputElement ? el : null;
      };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const el = find();
        if (!el) return { ok: false, detail: attempt === 0 ? 'not-found' : 'reset-by-page' };
        let want = command.value;
        if (el instanceof HTMLSelectElement) {
          // The visible text matched exactly first, then ignoring case and spacing (place names
          // come back in capitals).
          const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
          const options = Array.from(el.options);
          const option =
            options.find(
              (o) =>
                o.value === command.value ||
                o.value === `string:${command.value}` ||
                o.value === `number:${command.value}` ||
                o.text.trim() === command.value,
            ) ?? options.find((o) => loose(o.text) === loose(command.value));
          if (!option) return { ok: false, detail: 'option-missing' };
          want = option.value;
          el.focus();
          el.value = want;
        } else {
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          if (setter?.set) setter.set.call(el, want);
          else el.value = want;
          fire(el, 'input');
          fire(el, 'keyup');
        }
        fire(el, 'change');
        el.blur();
        await sleep(700);
        if (find()?.value === want) return { ok: true };
      }
      return { ok: false, detail: 'reset-by-page' };
    }
    case 'check': {
      const find = (): HTMLInputElement | null => {
        const root = scope(command.within);
        const el = root ? first(root, command.selector) : null;
        return el instanceof HTMLInputElement ? el : null;
      };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const el = find();
        if (!el) return { ok: false, detail: attempt === 0 ? 'not-found' : 'reset-by-page' };
        if (el.checked !== command.checked) el.click();
        await sleep(500);
        if (find()?.checked === command.checked) return { ok: true };
      }
      return { ok: false, detail: 'reset-by-page' };
    }
    case 'readTable': {
      // The first data row of the table in the pop-up: the label and the cell under the header
      // that contains `column` (for example "Premium").
      const found = await until(() => {
        const root = scope(command.within);
        const table = root ? (first(root, 'table') as HTMLTableElement | null) : null;
        if (!table) return null;
        const rows = Array.from(table.rows).filter((r) => visible(r));
        const header = rows.find((r) =>
          Array.from(r.cells).some((c) =>
            text(c).toLowerCase().includes(command.column.toLowerCase()),
          ),
        );
        if (!header) return null;
        const index = Array.from(header.cells).findIndex((c) =>
          text(c).toLowerCase().includes(command.column.toLowerCase()),
        );
        const data = rows.slice(rows.indexOf(header) + 1).find((r) => r.cells.length > index);
        const value = data ? text(data.cells[index]!) : '';
        return value ? { label: text(data!.cells[0]!), value } : null;
      }, command.timeoutMs);
      return found
        ? { ok: true, value: found.value, label: found.label }
        : { ok: false, detail: 'table-not-found' };
    }
    case 'errors': {
      const box = Array.from(document.querySelectorAll(DIALOGS)).find(
        (el) => visible(el) && /^\s*ERRORS\b/i.test(text(el)),
      );
      return box ? { ok: false, errors: text(box).slice(0, 400) } : { ok: true };
    }
  }
}
