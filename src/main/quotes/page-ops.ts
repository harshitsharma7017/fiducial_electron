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
   * A box that suggests as you type (New India's Model and Variant): waits until it is enabled,
   * types the value, and picks the suggestion that reads the same (ignoring case and spacing).
   * No suggestions, or none that reads the same, fails (`no-match`): the typed text is never left
   * in the box as if it were chosen.
   */
  | {
      op: 'typeahead';
      selector: string;
      value: string;
      timeoutMs: number;
      /** The last box shown that matches (Niva Bupa's city, after any other suggesting box). */
      last?: boolean;
      /** The first box after a shown caption reading one of these (as for pickOption). */
      after?: string[];
    }
  /**
   * Sets a counter drawn as "-" [n] "+" (Niva Bupa's Adult and Child counts) to `count`: the
   * `index`-th such counter on the page (from 0), pressing + or - until its box shows the count.
   * Fails `stuck at n` when the page stops counting (its limit).
   */
  | { op: 'stepper'; index: number; count: number; timeoutMs: number }
  /**
   * Picks a date in an Angular Material calendar (the box is read-only): the `nth` (from 0) date
   * box of the `counter`-th counter's block (Niva Bupa's dates of birth under Adult and Child).
   * Opens the calendar with the box's own toggle, goes to the year, then the month, then the day,
   * and checks the box shows it (dd/mm/yyyy). A day the calendar greys out fails `date-disabled`.
   */
  | {
      op: 'matDate';
      date: string;
      counter?: number;
      nth?: number;
      /** Instead of a counter's box: the date box captioned so ("Previous Policy End Date"). */
      label?: string;
    }
  /**
   * Chooses an option in one of the page's Ionic dropdowns (ion-select, opening an ion-alert):
   * tries each dropdown shown, in order, until one offers an option whose text starts with
   * `option` (ignoring case and spacing), picks it and presses OK; a dropdown without it is
   * cancelled. None offering it fails `no-match (offered: …)`. Returns the option's text.
   */
  | {
      op: 'ionPick';
      option: string;
      timeoutMs: number;
      /** The option reads exactly `option` (ignoring spacing and case), not only starts with it. */
      exact?: boolean;
    }
  /**
   * Picks an Ionic radio (ion-radio) by what is written beside it, in the radio group found by a
   * selector or by the question written above it ("Is any of the insured member a medical
   * practitioner?"): `match` prefix (default), exact or contains. Checks it is then chosen.
   */
  | {
      op: 'ionRadio';
      group: { selector?: string; question?: string };
      label: string;
      match?: 'prefix' | 'exact' | 'contains';
      timeoutMs: number;
    }
  /** Returns what is written beside the chosen radio of a group (a policy period and premium). */
  | {
      op: 'ionRadioRead';
      group: { selector: string };
      timeoutMs: number;
      /**
       * Read only once the page shows these (else nothing is read): a dropdown (ion-select)
       * showing `select` (its digits: "₹ 2,000,000") or, with `chosen`, a caption reading it (Niva
       * Bupa's "Select Sum Insured", in place of "RECOMMENDED" once a sum insured is chosen: any
       * sum insured chosen will do then), and a chosen radio starting with `label` ("2 Year").
       * Niva Bupa shows a premium for its recommended sum insured first: it is never read.
       */
      requires?: { select?: string; chosen?: string; label?: string };
      /** Also gives, as `label`, the first shown dropdown reading an amount (the sum insured). */
      withSelect?: boolean;
    }
  /**
   * Adds a listed add-on: in the row naming it, presses "+ Add" and checks it is gone. A row
   * without "+ Add" but with Remove (or Added) is already added.
   */
  | { op: 'addOn'; name: string; timeoutMs: number }
  /** Presses the element reading `text` in the row that names `row` ("Show more" for Tiered Network). */
  | { op: 'clickInRow'; row: string; text: string; timeoutMs: number }
  /** Scrolls the element reading exactly `text` into view (a page whose footer follows the scroll). */
  | { op: 'scrollTo'; text: string; timeoutMs: number }
  /**
   * A box suggesting as you type, offering several names for one thing: types `type`, then picks
   * the first of `options` (in order) that a suggestion reads (ignoring spacing and case). None
   * offered fails `no-match (offered: …)`. Returns the suggestion picked.
   */
  | {
      op: 'pickOption';
      selector: string;
      type: string;
      options: string[];
      timeoutMs: number;
      last?: boolean;
      /**
       * The box is the first one matching `selector` after a shown caption reading one of these
       * (ignoring case and spacing): Niva Bupa's "Select Plan", never its City box. Waits for the
       * caption to appear.
       */
      after?: string[];
      /** A suggestion that starts with an option will do (PIE's "ABOHAR - PUNJAB" for "Abohar"). */
      startsWith?: boolean;
      /** How long to wait for the suggestions once typed; 4 seconds if absent. */
      suggestMs?: number;
      /**
       * Where the page shows the choice when it empties the box (a vue-select: the chosen option
       * in .vs__selected, the typing box cleared): the choice is checked there instead.
       */
      shownIn?: string;
      /**
       * Names the box used (data-fqf-box), so later steps can leave it alone: Niva Bupa's plan box,
       * which its page code puts after the City box.
       */
      markAs?: string;
    }
  /**
   * Presses the first shown element matching `selector` (and, if given, whose text reads `text`,
   * or matches `pattern`, ignoring case and spacing): a button or label by id or name (HDFC PIE's
   * product type, transaction type, Yes/No labels, Calculate Premium).
   */
  | { op: 'clickSelector'; selector: string; text?: string; pattern?: string; timeoutMs: number }
  /**
   * Makes `show` shown, pressing `by` (a fold-out section's heading) only if it is not: an open
   * section is never closed.
   */
  | { op: 'reveal'; show: string; by: string; timeoutMs: number }
  /**
   * Reads the amount written after `label` ("Total Payable Premium Rs7106"), once shown. If the page
   * instead shows a message matching `errorPattern` (its own validation), fails `page-says: …`.
   */
  | {
      op: 'readAmount';
      label: string;
      timeoutMs: number;
      errorPattern?: string;
      /** Other captions the amount may follow, tried after `label`. */
      alsoLabels?: string[];
      /**
       * Only an amount the page shows after this step starts (a quote worked out by the server),
       * never text already on the page (United India's "Premium Calculator" heading above its
       * sum-insured list: 11 November 2026).
       */
      fresh?: boolean;
    }
  /**
   * A box that opens a list of links or items when pressed (HDFC PIE's retail health forms:
   * Business Type, I stay in, Plan Type, Policy Period): presses it, then the shown item reading
   * `option` (ignoring case and spacing) nearest the box, and checks the box then shows it. A box
   * already showing it is left alone.
   */
  | { op: 'pickFromList'; input: string; option: string; timeoutMs: number }
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
      /**
       * If nothing comes in time, clear this box and type `value` again (as a person would after
       * the page's own error), then wait once more. United India's PIN code lookup can fail on its
       * server ("Some Error occure please try again", 11 November 2026).
       */
      retype?: { selector: string; value: string };
    }
  | { op: 'pause'; ms: number }
  | {
      op: 'radio';
      name: string;
      value: string;
      within?: string;
      /**
       * 'current': the row the last ensureEmptyRow marked (else found by `rowKey`); 'key': the row
       * found by `rowKey` alone (its `keyIndex`-th match, for twins), whichever row was marked.
       */
      row?: 'current' | 'key';
      rowKey?: RowKey;
      keyIndex?: number;
    }
  | { op: 'clickButton'; text: string; within?: string; timeoutMs: number }
  /**
   * Clicks the visible link with this text. `numbered`: the text after a section number ("X. ",
   * "XII. "), for a form whose numbering is not known; the last such link (the proposal's own
   * section, after any short form above it).
   */
  | { op: 'clickLink'; text: string; numbered?: boolean }
  /** Chooses an option (by value or visible text) or fills a box; re-checked like select. */
  | {
      op: 'setField';
      selector: string;
      value: string;
      within?: string;
      /**
       * A dropdown whose options the page loads after an earlier answer (United India's travel
       * destinations and plans): waits up to this long for the option to appear.
       */
      waitMs?: number;
    }
  /** Ticks or unticks a checkbox (or picks a radio) by selector; re-checked like select. */
  | { op: 'check'; selector: string; checked: boolean; within?: string }
  /**
   * Reads a box's value once it has one (for example a premium the page works out). `last`: the
   * last visible match (when the page repeats an id, the total comes after the net amount).
   */
  | { op: 'readValue'; selector: string; timeoutMs: number; last?: boolean }
  /**
   * Picks the `index`-th (from 1) visible radio named `name`, once they are shown, and returns its
   * value (for example the plans a form offers, lowest first).
   */
  | { op: 'pickNth'; name: string; index: number; timeoutMs: number }
  /**
   * Reads every plan of a quotes table whose plans are its columns (United India's "Insurance
   * Quotes": a "Policy Type" header row naming the plans, a "Premium (Excluding GST)" row): each
   * plan's name and the amount in the row whose first cell holds `row`. Waits for the table (the
   * server works the quote out); fails `page-says: …` when the page shows `errorPattern` instead.
   */
  | {
      op: 'readPlans';
      header: string;
      row: string;
      timeoutMs: number;
      errorPattern?: string;
    }
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
      /** How long to wait for the date box to appear; 15 seconds if absent. */
      waitMs?: number;
    }
  | { op: 'errors' }
  /**
   * What the page marks on its form, outside pop-ups: the visible validation messages written by
   * the fields or the buttons ("Please fill all details", a Material error) and the captions of
   * the boxes it marks invalid. Reads captions and messages only, never a box's value. Always
   * `ok: true`; `value` is empty when nothing is marked.
   */
  | { op: 'fieldErrors' }
  /** Waits until no shown element matches `selector` (a loading overlay gone). */
  | { op: 'waitGone'; selector: string; timeoutMs: number }
  /**
   * For support: how the page's typing boxes and open lists are built, as JSON in `value` (never a
   * box's value: only its length). Each shown box: id, type, classes, read-only, its autocomplete
   * markings and the list it names, the app's own marks, its form, and the caption nearest it. Each
   * shown list: its id and options. And the page's address and the element in focus.
   */
  | { op: 'inspect' }
  /**
   * Finds a box by what surrounds it and names it (data-fqf-box = `name`), for later steps: the
   * shown box matching `selector` whose nearest surrounding element reading `near` (a word, any
   * case) does not also read `avoid`; the closest such box wins. Niva Bupa's plan box ("Select
   * Plan") and City box suggest alike, and their order on the page cannot be relied on. When no box
   * is found so after `fallbackAfterMs`, the first shown box matching `fallback` is taken. Waits up
   * to `timeoutMs`; fails `not-found`.
   */
  | {
      op: 'nameBox';
      name: string;
      selector: string;
      near: string;
      avoid?: string;
      fallback?: string;
      fallbackAfterMs?: number;
      /**
       * Never taken by the fallback: a box whose nearest surrounding element reading this word
       * does not read `near` (Niva Bupa's City box, never taken for the plan box).
       */
      notNear?: string;
      timeoutMs: number;
    }
  /**
   * Presses a button the page shows only after scrolling (Niva Bupa's footer reads Calculate
   * Premium once Key Add-Ons is scrolled to): scrolls the page's own scrolling panels (Ionic's
   * ion-content scrolls inside its shadow root, not the window) to the element reading `near`,
   * then through each panel from the top, until a button reading `text` (ignoring case and
   * spacing) shows, and presses it. Fails `not-found` when none shows in time.
   */
  | { op: 'revealButton'; text: string; near: string; timeoutMs: number }
  /**
   * Marks the shown boxes matching `selector` that are on the page now (data-fqf-before), so a later
   * step can take the one that appears afterwards (`:not([data-fqf-before])`): Niva Bupa's plan box,
   * drawn only once "I Know My Plan" is pressed, never its City box, there from the start. Marks
   * nothing while an element reading `unlessText` is shown (the boxes are all drawn already).
   */
  | { op: 'markPresent'; selector: string; unlessText?: string }
  /**
   * Taps an element of a Flutter page (HDFC ERGO's 1up, drawn on a canvas) by its label: turns
   * Flutter's semantics on (its "Enable accessibility" placeholder, as a screen reader would), which
   * lays labelled elements over the canvas, then clicks the one reading `labels` (any of them,
   * ignoring case and spacing; exactly, else the shortest starting with it). Only a click event is
   * sent, never a pointer press (Flutter would take that for a tap on the canvas at its corner).
   * Fails `not-found` (with the count of labelled elements shown) when none reads so in time.
   */
  | { op: 'flutterTap'; labels: string[]; timeoutMs: number }
  /** The text of any visible pop-up (dialog), whatever it says: `ok: false` with `errors`. */
  | { op: 'popup' }
  /**
   * Clicks the visible element whose text is exactly `text` (ignoring case and spacing), outside
   * any pop-up: a tile drawn as a plain element (New India's dashboard: MOTOR, Private Car). The
   * click goes to its clickable container (link, button, ng-click). Fails `ambiguous` when more
   * than one such element is shown, rather than guess.
   */
  | { op: 'clickText'; text: string; timeoutMs: number }
  /** Waits for a visible heading (as the recorder notes them) reading exactly `text`. */
  | { op: 'hasHeading'; text: string; timeoutMs: number }
  /**
   * Makes sure something is shown (a box by `selector`, or an element reading exactly `text`),
   * opening it only if it is not: a section's link (its text, ignoring the count New India shows
   * after it: "Member Information 3"), a button (Add Spouse), or an element reading exactly `text`
   * (a FLOATER tile). Never clicks when it is already shown, so an open section is not closed.
   */
  | {
      op: 'ensureShown';
      shown: { selector?: string; text?: string };
      open: { link?: string; button?: string; text?: string };
      timeoutMs: number;
    }
  /**
   * Types a date into a box that takes it as dd/mm/yyyy (New India's dates of birth), then leaves
   * the box so the page works the age out. A read-only box (a calendar only) fails `read-only`.
   */
  | { op: 'typeDate'; input: string; date: string }
  /**
   * Waits for a button, link or label reading exactly `text` to be on the page, shown or not (a
   * form recognised by a button inside a closed section: New India's Add Animal).
   */
  | { op: 'hasText'; text: string; timeoutMs: number }
  /**
   * Opens every closed section of the form: each section link (a link in a heading) whose body
   * (the element after the heading, or after the heading's box) is hidden. An open section is left
   * open. Returns how many it opened.
   */
  | { op: 'openSections' };

export interface PageOpResult {
  ok: boolean;
  /** Why it failed: a short code, never a value. */
  detail?: string;
  /** For "errors": the text of a visible ERRORS pop-up. */
  errors?: string;
  /** For "readTable": the cell read, and the row's label; "readValue", "pickNth": the value. */
  value?: string;
  label?: string;
  /** For "readPlans": each plan's name and amount, as the page shows them. */
  plans?: { name: string; amount: string }[];
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
  /** Every visible pop-up containing `within`, innermost first (the title's may not hold the form). */
  const scopes = (within: string): Element[] =>
    Array.from(document.querySelectorAll(DIALOGS))
      .filter((el) => visible(el) && text(el).includes(within))
      .sort((a, b) => text(a).length - text(b).length);
  /** For support: the boxes a pop-up shows, by name or id. */
  const boxesIn = (root: ParentNode): string =>
    Array.from(root.querySelectorAll('input, select, textarea'))
      .filter(visible)
      .map((el) => el.getAttribute('name') ?? el.id ?? el.tagName.toLowerCase())
      .slice(0, 8)
      .join(', ');
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
  /** The row showing `key` (its `index`-th match), marked as the current row. */
  const keyedRow = (key: RowKey, index = 0): Element | null => {
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
    const found = rows[index];
    return found ? mark(found) : null;
  };
  const rootFor = (
    c: { within?: string; row?: 'current' | 'key'; rowKey?: RowKey; keyIndex?: number },
    pending?: (row: Element) => boolean,
  ): ParentNode | null =>
    c.row === 'current'
      ? currentRow(c.rowKey, pending)
      : c.row === 'key' && c.rowKey
        ? keyedRow(c.rowKey, c.keyIndex)
        : scope(c.within);
  /** The advisor cancelled the run: exec (run-uiic-health.ts) has set this. */
  const cancelled = (): boolean => (window as { __fqfStop?: boolean }).__fqfStop === true;
  const until = async <T>(
    find: () => T | null | undefined,
    timeoutMs: number,
  ): Promise<T | null> => {
    const deadline = Date.now() + Math.min(timeoutMs, 60_000);
    for (;;) {
      if (cancelled()) return null;
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
  /** A full press: some widgets act on pointer or mouse down, others on click. */
  const pressEl = (el: Element): void => {
    const at = { bubbles: true, cancelable: true, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', at));
    el.dispatchEvent(new MouseEvent('mousedown', at));
    el.dispatchEvent(new PointerEvent('pointerup', at));
    el.dispatchEvent(new MouseEvent('mouseup', at));
    (el as HTMLElement).click();
  };
  /**
   * Counters drawn as "-" [n] "+", in page order: each "+" button shown with a "-" button in the
   * nearest container around it; `box` is the container's box showing the count.
   */
  const findCounters = (): {
    plus: HTMLElement;
    minus: HTMLElement;
    root: Element;
    box: HTMLInputElement | null;
  }[] => {
    // A button, or an input button (HDFC's PIE: <input type="button" value="+">).
    const BUTTONS = 'button, input[type="button"]';
    const face = (b: Element) => text(b) || (b as HTMLInputElement).value || '';
    const isMinus = (b: Element) => ['-', '\u2212', '\u2013'].includes(face(b).trim());
    const found = [];
    for (const plus of Array.from(document.querySelectorAll<HTMLElement>(BUTTONS))) {
      if (!visible(plus) || face(plus).trim() !== '+') continue;
      let root: Element | null = plus.parentElement;
      for (let up = 0; root && up < 3; up += 1, root = root.parentElement) {
        const minus = Array.from(root.querySelectorAll<HTMLElement>(BUTTONS)).find(
          (b) => visible(b) && isMinus(b),
        );
        if (minus) {
          const box = root.querySelector<HTMLInputElement>(
            'input:not([type="button"]):not([type="submit"])',
          );
          found.push({ plus, minus, root, box });
          break;
        }
      }
    }
    return found;
  };

  /**
   * The first of `boxes` after a shown caption reading one of `captions` (ignoring case and
   * spacing; the innermost element so reading), or null while no such caption is shown.
   */
  const boxAfter = (boxes: Element[], captions: string[]): Element | null => {
    // "City *": a required field's mark is not part of the caption.
    const squash = (t: string) =>
      t
        .replace(/\s+/g, ' ')
        .replace(/\s*\*$/, '')
        .trim()
        .toLowerCase();
    const wants = captions.map(squash);
    const reading = Array.from(document.body.querySelectorAll('*')).filter(
      (el) =>
        el.childElementCount === 0 ||
        !Array.from(el.children).some((c) => wants.includes(squash(text(c)))),
    );
    const caption = reading.find(
      (el) => visible(el) && wants.includes(squash(text(el))) && !el.closest(DIALOGS),
    );
    if (!caption) return null;
    return (
      boxes.find(
        (box) =>
          !caption.contains(box) &&
          (caption.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ) ?? null
    );
  };

  /** What an Ionic dropdown shows (its chosen option), from its shadow root or value. */
  const selectShows = (el: Element): string => {
    const shadow = el.shadowRoot?.querySelector('.select-text')?.textContent;
    if (shadow) return shadow;
    const value = (el as HTMLElement & { value?: unknown }).value;
    return typeof value === 'string' || typeof value === 'number' ? String(value) : text(el);
  };

  switch (command.op) {
    case 'waitFor': {
      const found = await until(() => {
        const root = scope(command.within);
        return root ? first(root, command.selector) : null;
      }, command.timeoutMs);
      if (found) return { ok: true };
      const all = (scope(command.within) ?? document).querySelectorAll(command.selector).length;
      return { ok: false, detail: all ? `not-found (${all} matching, none shown)` : 'not-found' };
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
    case 'typeahead': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const pick = (): HTMLElement | null =>
        command.after
          ? (boxAfter(
              Array.from(document.querySelectorAll(command.selector)).filter(visible),
              command.after,
            ) as HTMLElement | null)
          : command.last
            ? ((Array.from(document.querySelectorAll(command.selector)).filter(visible).at(-1) as
                HTMLElement | undefined) ?? null)
            : first(document, command.selector);
      const box = await until(() => {
        const el = pick();
        return el instanceof HTMLInputElement && !el.disabled && !el.readOnly ? el : null;
      }, command.timeoutMs);
      if (!box) {
        const el = pick() as HTMLInputElement | null;
        return { ok: false, detail: el ? 'still-disabled' : 'not-found' };
      }
      // Another box's list left open (Niva Bupa's plan dropdown, in the same overlay as the City
      // list) is closed first, as a person would press Escape, so it cannot be taken for this one.
      const other = document.activeElement;
      if (other instanceof HTMLElement && other !== box && other !== document.body) {
        other.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
        );
        other.blur();
        await sleep(200);
      }
      box.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (setter?.set) setter.set.call(box, command.value);
      else box.value = command.value;
      fire(box, 'input');
      fire(box, 'keyup');
      // The box's own suggestion list: the list it names (aria-owns / aria-controls, as
      // uib-typeahead sets), else a list that opened next to it (within three levels up), else a
      // jQuery UI list (appended to the page's end). Never any other menu on the page.
      const SUGGESTIONS =
        'li, [role="option"], .ui-menu-item, .typeahead li, .autocomplete li, .dropdown-menu li';
      const shownItems = (root: ParentNode | null): HTMLElement[] =>
        root
          ? Array.from(root.querySelectorAll<HTMLElement>(SUGGESTIONS)).filter(
              (el) => visible(el) && text(el) !== '',
            )
          : [];
      const suggestions = (): HTMLElement[] => {
        const owned = ['aria-owns', 'aria-controls']
          .map((a) => box.getAttribute(a))
          .filter((id): id is string => !!id)
          .flatMap((ids) => ids.split(/\s+/))
          .map((id) => document.getElementById(id));
        for (const list of owned) {
          const items = shownItems(list);
          if (items.length > 0) return items;
        }
        let near: Element | null = box.parentElement;
        for (let level = 0; near && level < 3; level += 1, near = near.parentElement) {
          const items = Array.from(
            near.querySelectorAll<HTMLElement>('.dropdown-menu, [role="listbox"], .typeahead'),
          ).flatMap((list) => shownItems(list));
          if (items.length > 0) return items;
        }
        // jQuery UI (appended to the page's end), or Angular Material's overlay (likewise), but
        // never a list another box names as its own (the plan dropdown's, in the same overlay).
        const othersLists = new Set(
          Array.from(document.querySelectorAll('[aria-owns], [aria-controls]'))
            .filter((el) => el !== box)
            .flatMap((el) =>
              ['aria-owns', 'aria-controls'].flatMap((a) =>
                (el.getAttribute(a) ?? '').split(/\s+/).filter(Boolean),
              ),
            ),
        );
        return Array.from(
          document.querySelectorAll<HTMLElement>(
            '.ui-autocomplete, .cdk-overlay-container [role="listbox"]',
          ),
        )
          .filter((list) => visible(list) && !othersLists.has(list.id))
          .flatMap((list) => shownItems(list));
      };
      // No list: the page has nothing by that name. Typed text it did not offer would be left in
      // the box looking filled, so stop instead.
      const shown = await until(() => (suggestions().length > 0 ? true : null), 3000);
      if (!shown) return { ok: false, detail: 'no-match (no suggestions)' };
      const match = suggestions().find((el) => loose(text(el)) === loose(command.value));
      if (!match) return { ok: false, detail: `no-match (${suggestions().length} suggestions)` };
      // The link inside the item when there is one (uib-typeahead listens there).
      const target = (match.querySelector('a') as HTMLElement | null) ?? match;
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      target.click();
      await sleep(700);
      const kept = box.isConnected ? box : (pick() as HTMLInputElement | null);
      return kept && loose(kept.value) === loose(command.value)
        ? { ok: true }
        : { ok: false, detail: 'not-kept' };
    }
    case 'waitForValue': {
      const rejected = command.rejectValues ?? [];
      const box = (): HTMLInputElement | null => {
        const root = rootFor(command);
        return root ? (first(root, command.selector) as HTMLInputElement | null) : null;
      };
      const filled = () => {
        const value = box()?.value.trim() ?? '';
        return value !== '' && !rejected.includes(value) ? true : null;
      };
      let found = await until(filled, command.timeoutMs);
      if (!found && command.retype) {
        const input = first(document, command.retype.selector);
        if (input instanceof HTMLInputElement) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          const put = (value: string) => {
            if (setter?.set) setter.set.call(input, value);
            else input.value = value;
            fire(input, 'input');
            fire(input, 'keyup');
            fire(input, 'change');
          };
          input.focus();
          put('');
          await sleep(400);
          put(command.retype.value);
          input.blur();
          found = await until(filled, command.timeoutMs);
        }
      }
      if (found) return { ok: true, ...(command.retype ? { detail: 'filled' } : {}) };
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
        if (!command.within) return buttonWithText(document, command.text);
        for (const root of scopes(command.within)) {
          const found = buttonWithText(root, command.text);
          if (found) return found;
        }
        return null;
      }, command.timeoutMs);
      if (!button) return { ok: false, detail: 'not-found' };
      if ((button as HTMLButtonElement).disabled) return { ok: false, detail: 'disabled' };
      button.click();
      return { ok: true };
    }
    case 'clickLink': {
      const matches = (a: Element): boolean => {
        const t = text(a);
        return command.numbered
          ? /^[IVXL]+\.\s*/.test(t) && t.replace(/^[IVXL]+\.\s*/, '') === command.text
          : t === command.text;
      };
      const links = Array.from(document.querySelectorAll('a')).filter(
        (a) => visible(a) && matches(a),
      );
      const link = command.numbered ? links.at(-1) : links[0];
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
      // The box may arrive after the fields around it: United India draws its date boxes from a
      // template downloaded when the proposal opens (slower on a fresh install, 6 November 2026).
      const drawn = (): ParentNode | null => {
        const here = rootFor(command);
        if (!here) return null;
        const ready =
          first(here, command.input) ?? (command.trigger ? first(here, command.trigger) : null);
        return ready ? here : null;
      };
      const root = (await until(drawn, command.waitMs ?? 15_000)) ?? rootFor(command);
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
        if (!input) {
          const onPage = root.querySelectorAll(command.input).length > 0;
          return { ok: false, detail: onPage ? 'date-box-hidden' : 'date-box-not-shown' };
        }
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
        // A wrapper around the real button (uib-datepicker's span.input-group-btn): press the
        // button, since a click on the wrapper does not reach it.
        const inner = trigger?.tagName === 'BUTTON' ? null : trigger?.querySelector('button');
        if (inner && visible(inner)) trigger = inner;
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
      const locate = (): HTMLElement | null => {
        const fromArrows = climb(buttonWithText(document, '«'));
        if (fromArrows) return fromArrows;
        const title = Array.from(
          document.querySelectorAll('button, strong, th, span, h1, h2, h3, h4, h5, div'),
        )
          .filter((el) => visible(el) && el.children.length <= 1 && EXACT_TITLE.test(text(el)))
          .map((el) => climb(el))
          .find((c) => c !== null);
        return title ?? null;
      };
      // Some calendars draw themselves again on every month change (replacing the elements):
      // find the calendar again when the one held is no longer on the page.
      const found = await until(locate, 5000);
      if (!found)
        return { ok: false, detail: `calendar-not-shown (opened with ${describe(trigger)})` };
      let picker: HTMLElement = found;
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
        if (!picker.isConnected) {
          const again = await until(locate, 2000);
          if (!again) return { ok: false, detail: 'calendar-closed-while-moving' };
          picker = again;
        }
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
      const confirm = (): HTMLElement | null => {
        if (!picker.isConnected) return null;
        const ok =
          buttonWithText(picker, 'OK') ??
          buttonWithText(picker, 'Ok') ??
          buttonWithText(picker, 'Done');
        return ok && visible(ok) ? ok : null;
      };
      let set = await until(() => (sameDate(box()?.value ?? '') ? true : null), 2500);
      if (!set) {
        // Some calendars need OK (or Done) after the day.
        const ok = confirm();
        if (ok) {
          ok.click();
          set = await until(() => (sameDate(box()?.value ?? '') ? true : null), 2500);
        }
      } else {
        // Others show the day in the box at once but keep the date only once OK is pressed
        // (United India's Overseas Mediclaim: closed any other way, its plan check then asks for
        // the date of birth, 6 November 2026). Still open with OK or Done: press it, as a person
        // would.
        const ok = confirm();
        if (ok) {
          ok.click();
          await sleep(300);
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
      // A dropdown (option by value, AngularJS "string:" value, or visible text), a box or a
      // text area (New India's address).
      const find = (): HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement | null => {
        // Within a pop-up: any pop-up showing that text (the one with the title may not hold the
        // form, United India's User Details).
        const roots: ParentNode[] = command.within ? scopes(command.within) : [document];
        let el: HTMLElement | null = null;
        for (const root of roots) {
          el = first(root, command.selector);
          if (el) break;
        }
        return el instanceof HTMLSelectElement ||
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
          ? el
          : null;
      };
      // A box the page is still drawing (a pop-up whose form is a template it downloads): waited
      // for, when the step allows it.
      if (!find() && command.waitMs) await until(find, command.waitMs);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let el = find();
        if (!el && attempt === 0 && command.within) {
          const shown = scopes(command.within)[0];
          return {
            ok: false,
            detail: shown
              ? `not-found (the "${command.within}" pop-up shows boxes: ${boxesIn(shown) || 'none'})`
              : `not-found (no "${command.within}" pop-up shown)`,
          };
        }
        if (!el) return { ok: false, detail: attempt === 0 ? 'not-found' : 'reset-by-page' };
        let want = command.value;
        if (el instanceof HTMLSelectElement) {
          // The visible text matched exactly first, then ignoring case and spacing (place names
          // come back in capitals).
          const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
          const match = (select: HTMLSelectElement): HTMLOptionElement | undefined => {
            const options = Array.from(select.options);
            return (
              options.find(
                (o) =>
                  o.value === command.value ||
                  o.value === `string:${command.value}` ||
                  o.value === `number:${command.value}` ||
                  o.text.trim() === command.value,
              ) ?? options.find((o) => loose(o.text) === loose(command.value))
            );
          };
          // A list the page is still loading: wait for the option (bounded).
          const option =
            match(el) ??
            (command.waitMs
              ? ((await until(() => {
                  const now = find();
                  return now instanceof HTMLSelectElement ? (match(now) ?? null) : null;
                }, command.waitMs)) ?? undefined)
              : undefined);
          if (!option) {
            const now = find();
            const offered =
              now instanceof HTMLSelectElement
                ? Array.from(now.options)
                    .map((o) => o.text.trim())
                    .filter(Boolean)
                    .slice(0, 10)
                    .join('; ')
                : '';
            return {
              ok: false,
              detail: `option-missing${offered ? ` (offered: ${offered})` : ''}`,
            };
          }
          want = option.value;
          // The dropdown the option is in (the page may have drawn it again while it loaded).
          const owner = option.closest('select');
          const select = owner instanceof HTMLSelectElement ? owner : el;
          el = select;
          select.focus();
          select.value = want;
        } else {
          el.focus();
          const proto =
            el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value');
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
        if (!el) {
          if (attempt > 0) return { ok: false, detail: 'reset-by-page' };
          const all = (scope(command.within) ?? document).querySelectorAll(command.selector).length;
          return {
            ok: false,
            detail: all ? `not-found (${all} matching, none shown)` : 'not-found',
          };
        }
        if (el.checked !== command.checked) el.click();
        await sleep(500);
        if (find()?.checked === command.checked) return { ok: true };
      }
      return { ok: false, detail: 'reset-by-page' };
    }
    case 'readPlans': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim();
      const has = (cell: Element | undefined, words: string) =>
        !!cell && loose(text(cell)).toLowerCase().startsWith(words.toLowerCase());
      // A cell's amount: its text, or a box's value (some pages show it in a read-only box).
      const amountIn = (cell: Element): string => {
        const shown =
          loose(text(cell)) || (cell.querySelector<HTMLInputElement>('input')?.value ?? '');
        const m = /(\d[\d,]*(?:\.\d{1,2})?)/.exec(shown);
        return m && m[1]!.replace(/\D/g, '').length >= 2 ? m[1]! : '';
      };
      const read = (): { name: string; amount: string }[] | null => {
        for (const table of Array.from(document.querySelectorAll('table'))) {
          if (!visible(table)) continue;
          const rows = Array.from(table.rows).filter((r) => visible(r));
          const header = rows.find((r) => has(r.cells[0], command.header));
          const amounts = rows.find((r) => r !== header && has(r.cells[0], command.row));
          if (!header || !amounts) continue;
          const plans = Array.from(header.cells)
            .slice(1)
            .map((cell, i) => {
              const amountCell = amounts.cells[i + 1];
              return { name: loose(text(cell)), amount: amountCell ? amountIn(amountCell) : '' };
            })
            .filter((p) => p.name && p.amount);
          if (plans.length > 0) return plans;
        }
        return null;
      };
      const errors = command.errorPattern ? new RegExp(command.errorPattern, 'i') : null;
      const complaint = (): string | null => {
        if (!errors) return null;
        const hit = Array.from(
          document.querySelectorAll<HTMLElement>('label, span, div, p, li, strong'),
        ).find((el) => el.children.length === 0 && visible(el) && errors.test(text(el)));
        return hit ? text(hit).slice(0, 200) : null;
      };
      const found = await until(
        () => read() ?? (complaint() ? 'complaint' : null),
        command.timeoutMs,
      );
      if (found && found !== 'complaint') return { ok: true, plans: found };
      const said = complaint();
      if (said) return { ok: false, detail: `page-says: ${said}` };
      const seen = Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((el) => el.children.length === 0 && visible(el) && /premium|quote/i.test(text(el)))
        .map((el) => text(el).slice(0, 60))
        .filter((t, i, all) => all.indexOf(t) === i)
        .slice(0, 4)
        .join(' | ');
      return { ok: false, detail: seen ? `not-shown (page shows: ${seen})` : 'not-shown' };
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
    case 'readValue': {
      const value = await until(() => {
        const el = (
          command.last
            ? Array.from(document.querySelectorAll(command.selector)).filter(visible).at(-1)
            : first(document, command.selector)
        ) as HTMLInputElement | null | undefined;
        const v = el?.value?.trim() ?? '';
        return v ? v : null;
      }, command.timeoutMs);
      return value ? { ok: true, value } : { ok: false, detail: 'empty' };
    }
    case 'pickNth': {
      const radios = (): HTMLInputElement[] =>
        Array.from(document.querySelectorAll('input[type="radio"]')).filter(
          (r): r is HTMLInputElement =>
            r instanceof HTMLInputElement && r.name === command.name && visible(r),
        );
      const shown = await until(() => (radios().length > 0 ? radios() : null), command.timeoutMs);
      if (!shown) return { ok: false, detail: 'not-found' };
      const radio = shown[command.index - 1];
      if (!radio) return { ok: false, detail: `only-${shown.length}` };
      if (!radio.checked) radio.click();
      await sleep(500);
      return radio.checked
        ? { ok: true, value: radio.value }
        : { ok: false, detail: 'reset-by-page' };
    }
    case 'errors': {
      const box = Array.from(document.querySelectorAll(DIALOGS)).find(
        (el) => visible(el) && /^\s*ERRORS\b/i.test(text(el)),
      );
      return box ? { ok: false, errors: text(box).slice(0, 400) } : { ok: true };
    }
    case 'flutterTap': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const wants = command.labels.map(loose);
      /** Every element matching `selector`, in the document and in open shadow roots. */
      const deep = (root: ParentNode, selector: string, out: Element[] = []): Element[] => {
        out.push(...Array.from(root.querySelectorAll(selector)));
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot) deep(el.shadowRoot, selector, out);
        }
        return out;
      };
      const NODES =
        'flt-semantics, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';
      const nameOf = (el: Element): string =>
        loose(el.getAttribute('aria-label') || (el as HTMLElement).innerText || '');
      const enable = () => {
        if (deep(document, 'flt-semantics').length > 0) return;
        const placeholder = deep(document, 'flt-semantics-placeholder')[0];
        if (placeholder) (placeholder as HTMLElement).click();
      };
      let seen = 0;
      const target = await until(() => {
        enable();
        const nodes = deep(document, NODES).filter(visible);
        seen = nodes.length;
        const named = nodes.map((el) => ({ el, name: nameOf(el) })).filter((n) => n.name);
        const exact = named.find((n) => wants.includes(n.name));
        if (exact) return exact.el;
        const starts = named
          .filter((n) => wants.some((w) => n.name.startsWith(`${w} `)))
          .sort((a, b) => a.name.length - b.name.length);
        return starts[0]?.el ?? null;
      }, command.timeoutMs);
      if (!target) return { ok: false, detail: `not-found (${seen} labelled shown)` };
      (target as HTMLElement).click();
      return { ok: true };
    }
    case 'markPresent': {
      const squash = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const already =
        command.unlessText !== undefined &&
        Array.from(document.body.querySelectorAll('*')).some(
          (el) =>
            el.childElementCount === 0 &&
            visible(el) &&
            squash(text(el)) === squash(command.unlessText!),
        );
      // An earlier run's marks are cleared first (the page may still carry them).
      for (const el of Array.from(document.querySelectorAll('[data-fqf-before], [data-fqf-box]'))) {
        el.removeAttribute('data-fqf-before');
        el.removeAttribute('data-fqf-box');
      }
      if (already) return { ok: true, detail: 'already-shown' };
      // Shown boxes only: a box drawn but hidden until later is not "there before".
      const boxes = Array.from(document.querySelectorAll(command.selector)).filter(visible);
      for (const box of boxes) box.setAttribute('data-fqf-before', '');
      return { ok: true, value: String(boxes.length) };
    }
    case 'nameBox': {
      const word = (w: string) =>
        new RegExp(`(^|[^a-z])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
      const near = word(command.near);
      const avoid = command.avoid ? word(command.avoid) : null;
      const reads = (el: Element, w: RegExp) => w.test((el.textContent ?? '').toLowerCase());
      /** How many levels up the nearest element reading `near` is (and not `avoid`), or null. */
      const distance = (box: Element): number | null => {
        let n: Element | null = box.parentElement;
        for (let up = 1; n && n !== document.body && up <= 8; up += 1, n = n.parentElement) {
          if (reads(n, near)) return avoid && reads(n, avoid) ? null : up;
        }
        return null;
      };
      const byCaption = (): HTMLElement | null => {
        const ranked = Array.from(document.querySelectorAll<HTMLElement>(command.selector))
          .filter((b) => visible(b) && !(b as HTMLInputElement).disabled)
          .map((b) => ({ b, d: distance(b) }))
          .filter((x): x is { b: HTMLElement; d: number } => x.d !== null)
          .sort((x, y) => x.d - y.d);
        return ranked[0]?.b ?? null;
      };
      const started = Date.now();
      const found = await until(() => {
        const caption = byCaption();
        if (caption) return { box: caption, how: 'by-caption' };
        if (command.fallback && Date.now() - started >= (command.fallbackAfterMs ?? 5000)) {
          const other = command.notNear ? word(command.notNear) : null;
          /** Whether the nearest element reading `notNear` around the box does not read `near`. */
          const elsewhere = (box: Element): boolean => {
            if (!other) return false;
            let n: Element | null = box.parentElement;
            for (let up = 1; n && n !== document.body && up <= 8; up += 1, n = n.parentElement) {
              if (reads(n, other)) return !reads(n, near);
            }
            return false;
          };
          const fb = Array.from(document.querySelectorAll<HTMLElement>(command.fallback)).find(
            (b) => visible(b) && !elsewhere(b),
          );
          if (fb) return { box: fb, how: 'by-order' };
        }
        return null;
      }, command.timeoutMs);
      if (!found) return { ok: false, detail: 'not-found' };
      for (const el of Array.from(document.querySelectorAll(`[data-fqf-box="${command.name}"]`))) {
        if (el !== found.box) el.removeAttribute('data-fqf-box');
      }
      found.box.setAttribute('data-fqf-box', command.name);
      return { ok: true, detail: found.how };
    }
    case 'waitGone': {
      const gone = await until(
        () => (Array.from(document.querySelectorAll(command.selector)).some(visible) ? null : true),
        command.timeoutMs,
      );
      return gone ? { ok: true } : { ok: false, detail: 'still-shown' };
    }
    case 'inspect': {
      const short = (t: string | null | undefined, n = 80) =>
        (t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
      const forms = Array.from(document.querySelectorAll('form'));
      /** The nearest caption: the first ancestor (5 levels up) with short text of its own. */
      const caption = (el: Element): string => {
        let n: Element | null = el.parentElement;
        for (let up = 0; n && up < 5; up += 1, n = n.parentElement) {
          const t = short(text(n), 200);
          if (t && t.length <= 80) return t;
        }
        return '';
      };
      const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea'))
        .filter((b) => visible(b) && !/^(hidden|checkbox|radio|button|submit)$/i.test(b.type))
        .slice(0, 25)
        .map((b) => ({
          id: b.id || null,
          name: b.getAttribute('name'),
          type: b.type,
          classes: short(b.className, 120),
          readOnly: b.readOnly,
          disabled: b.disabled,
          role: b.getAttribute('role'),
          ariaAutocomplete: b.getAttribute('aria-autocomplete'),
          ariaOwns: b.getAttribute('aria-owns'),
          ariaControls: b.getAttribute('aria-controls'),
          ariaExpanded: b.getAttribute('aria-expanded'),
          placeholder: short(b.placeholder, 60),
          fqfBefore: b.hasAttribute('data-fqf-before'),
          fqfBox: b.getAttribute('data-fqf-box'),
          valueLength: b.value.length,
          form: b.form ? forms.indexOf(b.form) : null,
          caption: caption(b),
        }));
      const lists = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="listbox"], .mat-autocomplete-panel, .mat-mdc-autocomplete-panel, .cdk-overlay-pane',
        ),
      )
        .filter(visible)
        .slice(0, 10)
        .map((l) => {
          const options = Array.from(
            l.querySelectorAll<HTMLElement>('[role="option"], mat-option, li'),
          ).filter(visible);
          return {
            id: l.id || null,
            classes: short(l.className, 80),
            options: options.length,
            first: options.slice(0, 8).map((o) => short(text(o), 60)),
          };
        });
      const active = document.activeElement;
      // The buttons shown (a footer's Continue or Calculate Premium, an add-on's "+ Add").
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>('button, ion-button, [role="button"]'),
      )
        .filter(visible)
        .map((b) => short(text(b), 40))
        .filter((t, i, all) => t && all.indexOf(t) === i)
        .slice(0, 40);
      const overlays = Array.from(document.querySelectorAll('ion-loading, ion-alert, ion-modal'))
        .filter(visible)
        .map((o) => o.tagName.toLowerCase());
      return {
        ok: true,
        value: JSON.stringify({
          url: `${location.pathname}${location.hash}`,
          active: active ? `${active.tagName.toLowerCase()}#${active.id}` : null,
          forms: forms.length,
          overlays,
          boxes,
          lists,
          buttons,
        }),
      };
    }
    case 'revealButton': {
      const squash = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const want = squash(command.text);
      const BUTTONS =
        'button, ion-button, [role="button"], input[type="button"], input[type="submit"]';
      const findButton = (): HTMLElement | null =>
        Array.from(document.querySelectorAll<HTMLElement>(BUTTONS)).find(
          (b) =>
            visible(b) &&
            !(b as HTMLButtonElement).disabled &&
            squash(text(b) || (b as HTMLInputElement).value || '') === want,
        ) ?? null;
      const press = (b: HTMLElement): PageOpResult => {
        pressEl(b);
        return { ok: true };
      };
      const deadline = Date.now() + Math.min(command.timeoutMs, 60_000);
      const left = () => Math.max(0, deadline - Date.now());
      const found = findButton();
      if (found) return press(found);
      /** The scrolling panels around an element: Ionic's inner scroll, and scrollable boxes. */
      const panelsOf = (el: Element): HTMLElement[] => {
        const out: HTMLElement[] = [];
        let n: Node | null = el;
        while (n) {
          if (n instanceof HTMLElement) {
            if (n.tagName === 'ION-CONTENT') {
              const inner = n.shadowRoot?.querySelector<HTMLElement>('.inner-scroll');
              if (inner) out.push(inner);
            } else if (
              n.scrollHeight > n.clientHeight + 1 &&
              /(auto|scroll)/.test(getComputedStyle(n).overflowY)
            ) {
              out.push(n);
            }
          }
          n = n instanceof ShadowRoot ? n.host : n.parentNode;
        }
        return out;
      };
      const nudge = (panel: HTMLElement) => panel.dispatchEvent(new Event('scroll'));
      const squashText = (e: Element) => squash(text(e));
      const anchor =
        Array.from(document.querySelectorAll<HTMLElement>('*')).find(
          (e) => e.children.length === 0 && visible(e) && squashText(e) === squash(command.near),
        ) ?? null;
      const panels = [
        ...(anchor ? panelsOf(anchor) : []),
        ...Array.from(document.querySelectorAll('ion-content'))
          .filter(visible)
          .map((c) => c.shadowRoot?.querySelector<HTMLElement>('.inner-scroll'))
          .filter((p): p is HTMLElement => !!p),
        ...(document.scrollingElement instanceof HTMLElement ? [document.scrollingElement] : []),
      ].filter((p, i, all) => all.indexOf(p) === i);
      // 1. The element reading `near` into view, in each of its panels (a real scroll each).
      if (anchor) {
        for (const panel of panelsOf(anchor)) {
          const by = anchor.getBoundingClientRect().top - panel.getBoundingClientRect().top - 40;
          panel.scrollTop += by === 0 ? 1 : by;
          nudge(panel);
        }
        anchor.scrollIntoView({ block: 'center' });
        const shown = await until(findButton, Math.min(1500, left()));
        if (shown) return press(shown);
      }
      // 2. Through each panel from the top, a step at a time.
      for (const panel of panels) {
        if (cancelled()) return { ok: false, detail: 'cancelled' };
        panel.scrollTop = 0;
        nudge(panel);
        await sleep(300);
        for (let guard = 0; guard < 60 && left() > 0; guard += 1) {
          const shown = findButton();
          if (shown) return press(shown);
          if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2) break;
          panel.scrollTop += Math.max(200, Math.round(panel.clientHeight * 0.6));
          nudge(panel);
          await sleep(400);
        }
        const shown = findButton();
        if (shown) return press(shown);
      }
      const late = await until(findButton, left());
      return late ? press(late) : { ok: false, detail: 'not-found' };
    }
    case 'fieldErrors': {
      const said: string[] = [];
      const note = (t: string) => {
        const clean = t.replace(/\s+/g, ' ').trim();
        if (clean && clean.length <= 160 && !said.includes(clean)) said.push(clean);
      };
      // Messages: Material and Ionic errors, and any short element named as an error.
      const MESSAGES =
        'mat-error, .mat-error, .mat-mdc-form-field-error, ion-note[slot="error"], .error-text, ' +
        '.invalid-feedback, .text-danger, [role="alert"], [class*="error" i], [id*="error" i]';
      for (const el of Array.from(document.querySelectorAll(MESSAGES))) {
        if (!visible(el) || el.closest(DIALOGS)) continue;
        // The innermost message only (a container named "error-box" holds the message itself).
        if (Array.from(el.querySelectorAll(MESSAGES)).some((inner) => visible(inner))) continue;
        // A field's own box ("mat-form-field-invalid") is not a message.
        const BOXES = 'input, select, textarea, button, ion-input, ion-select, mat-select';
        if (el.matches(BOXES) || el.querySelector(BOXES)) continue;
        note(text(el));
      }
      // Boxes marked invalid (Angular's classes), by their caption.
      const caption = (el: Element): string => {
        const field = el.closest('mat-form-field, .mat-mdc-form-field, ion-item');
        const label = field?.querySelector('mat-label, label, ion-label');
        const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        const named =
          (label && text(label)) ||
          (byFor && text(byFor)) ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          (el.getAttribute('formcontrolname') ?? '').replace(/([a-z])([A-Z])/g, '$1 $2');
        return named.replace(/\s*\*\s*$/, '').trim();
      };
      const INVALID =
        'input.ng-invalid, textarea.ng-invalid, select.ng-invalid, mat-select.ng-invalid, ' +
        'ion-input.ng-invalid, ion-select.ng-invalid, ion-radio-group.ng-invalid';
      const marked: string[] = [];
      for (const el of Array.from(document.querySelectorAll(INVALID))) {
        if (el.closest(DIALOGS) || (el as HTMLInputElement).disabled) continue;
        const shown = visible(el) || (el.parentElement !== null && visible(el.parentElement));
        if (!shown || el.parentElement?.closest('.ng-invalid:is(ion-input, ion-select)')) continue;
        const name = caption(el);
        if (name && name.length <= 80 && !marked.includes(name)) marked.push(name);
      }
      const parts = [
        ...said.slice(0, 5),
        ...(marked.length > 0 ? [`marked: ${marked.slice(0, 8).join(', ')}`] : []),
      ];
      return { ok: true, value: parts.join('; ').slice(0, 500) };
    }
    case 'clickText': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const want = loose(command.text);
      const dialogs = (): Element[] =>
        Array.from(document.querySelectorAll(DIALOGS)).filter(visible);
      const CLICKABLE = 'a, button, [ng-click], [data-ng-click], [onclick], [role="button"]';
      const targets = (): HTMLElement[] => {
        const open = dialogs();
        // textContent first (cheap); innerText (as shown, after text-transform) only for those.
        const hits = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter(
          (el) =>
            loose(el.textContent ?? '') === want &&
            visible(el) &&
            loose(text(el)) === want &&
            !open.some((d) => d.contains(el)),
        );
        const innermost = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
        return [...new Set(innermost.map((el) => el.closest<HTMLElement>(CLICKABLE) ?? el))];
      };
      const found = await until(() => (targets().length > 0 ? targets() : null), command.timeoutMs);
      if (!found) return { ok: false, detail: 'not-found' };
      if (found.length > 1) return { ok: false, detail: `ambiguous (${found.length} shown)` };
      found[0]!.click();
      return { ok: true };
    }
    case 'hasHeading': {
      const found = await until(
        () =>
          Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, .card-title')).find(
            (h) => visible(h) && text(h) === command.text,
          ) ?? null,
        command.timeoutMs,
      );
      return found ? { ok: true } : { ok: false, detail: 'heading-not-shown' };
    }
    case 'popup': {
      const box = Array.from(document.querySelectorAll(DIALOGS)).find(
        (el) => visible(el) && text(el) !== '',
      );
      return box ? { ok: false, errors: text(box).slice(0, 400) } : { ok: true };
    }
    case 'ensureShown': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const exactText = (want: string): HTMLElement[] => {
        const hits = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter(
          (el) =>
            loose(el.textContent ?? '') === loose(want) &&
            visible(el) &&
            loose(text(el)) === loose(want),
        );
        return hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
      };
      const isShown = (): boolean =>
        (!!command.shown.selector && first(document, command.shown.selector) !== null) ||
        (!!command.shown.text && exactText(command.shown.text).length > 0);
      if (isShown()) return { ok: true, detail: 'already-shown' };
      const { link, button, text: tile } = command.open;
      let opener: HTMLElement | null = null;
      if (link) {
        const name = loose(link);
        opener =
          (Array.from(document.querySelectorAll('a')).find(
            (a) => visible(a) && loose(text(a)).replace(/\s*\d+$/, '') === name,
          ) as HTMLElement | undefined) ?? null;
      } else if (button) {
        opener = await until(() => buttonWithText(document, button), 3000);
      } else if (tile) {
        const found = exactText(tile).map(
          (el) =>
            el.closest<HTMLElement>(
              'a, button, label, [ng-click], [data-ng-click], [onclick], [role="button"]',
            ) ?? el,
        );
        const unique = [...new Set(found)];
        if (unique.length > 1) return { ok: false, detail: `ambiguous (${unique.length} shown)` };
        opener = unique[0] ?? null;
      }
      if (!opener) return { ok: false, detail: 'opener-not-found' };
      if ((opener as HTMLButtonElement).disabled) return { ok: false, detail: 'disabled' };
      opener.click();
      const shown = await until(() => (isShown() ? true : null), command.timeoutMs);
      return shown ? { ok: true } : { ok: false, detail: 'not-shown-after-click' };
    }
    case 'hasText': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const found = await until(
        () =>
          Array.from(document.querySelectorAll('button, a, label')).find(
            (el) => loose(el.textContent ?? '') === loose(command.text),
          ) ?? null,
        command.timeoutMs,
      );
      return found ? { ok: true } : { ok: false, detail: 'text-not-found' };
    }
    case 'openSections': {
      const bodyOf = (a: Element): Element | null => {
        const heading = a.closest('h1, h2, h3, h4, h5, h6');
        if (!heading) return null;
        return heading.nextElementSibling ?? heading.parentElement?.nextElementSibling ?? null;
      };
      const closed = (): HTMLElement[] =>
        Array.from(document.querySelectorAll<HTMLElement>('h3 > a, h4 > a, h5 > a')).filter((a) => {
          if (!visible(a) || a.closest(DIALOGS)) return false;
          const body = bodyOf(a);
          return body !== null && !visible(body);
        });
      let opened = 0;
      for (const a of closed()) {
        a.click();
        opened += 1;
        await sleep(300);
      }
      // Sections drawn as others open (AngularJS): one more pass.
      for (const a of closed()) {
        a.click();
        opened += 1;
        await sleep(300);
      }
      return { ok: true, value: String(opened) };
    }
    case 'typeDate': {
      const [y, m, d] = command.date.split('-');
      const want = `${d}/${m}/${y}`;
      const box = await until(() => first(document, command.input), 5000);
      if (!(box instanceof HTMLInputElement)) return { ok: false, detail: 'not-found' };
      if (box.readOnly || box.disabled) return { ok: false, detail: 'read-only' };
      box.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (setter?.set) setter.set.call(box, want);
      else box.value = want;
      fire(box, 'input');
      fire(box, 'keyup');
      fire(box, 'change');
      // Close a calendar the box may have opened, then leave the box (the page works the age out
      // when it is left).
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      box.blur();
      fire(box, 'blur');
      await sleep(700);
      const now = (first(document, command.input) as HTMLInputElement | null)?.value ?? '';
      return now.replace(/-/g, '/') === want
        ? { ok: true }
        : { ok: false, detail: `not-kept: box shows "${now}"` };
    }
    case 'stepper': {
      const get = () => findCounters()[command.index] ?? null;
      const count = (c: NonNullable<ReturnType<typeof get>>): number => {
        const digits = (c.box?.value ?? text(c.root)).replace(/[^0-9]/g, '');
        return digits === '' ? Number.NaN : Number(digits);
      };
      if (!(await until(get, command.timeoutMs))) {
        return { ok: false, detail: `not-found (${findCounters().length} counters shown)` };
      }
      for (let press = 0; press < 15; press += 1) {
        const c = get();
        if (!c) return { ok: false, detail: 'not-found' };
        const n = count(c);
        if (Number.isNaN(n)) return { ok: false, detail: 'count-unreadable' };
        if (n === command.count) return { ok: true };
        const button = n < command.count ? c.plus : c.minus;
        if ((button as HTMLButtonElement).disabled) return { ok: false, detail: `stuck at ${n}` };
        button.click();
        const moved = await until(() => {
          const now = get();
          return now && count(now) !== n ? true : null;
        }, 3000);
        if (!moved) return { ok: false, detail: `stuck at ${n}` };
      }
      return { ok: false, detail: 'too-many-presses' };
    }
    case 'matDate': {
      const [y, m, d] = command.date.split('-').map(Number) as [number, number, number];
      const MONTHS = [
        'january',
        'february',
        'march',
        'april',
        'may',
        'june',
        'july',
        'august',
        'september',
        'october',
        'november',
        'december',
      ];
      const month = MONTHS[m - 1]!;
      // The box may show the date as dd/mm/yyyy or, as Niva Bupa's does, without leading zeros
      // and month first ("8/1/1981"): the day was chosen here, so day and month in either order
      // can only be this date.
      const same = (value: string): boolean => {
        const parts = value
          .trim()
          .split(/[^0-9]+/)
          .filter(Boolean)
          .map(Number);
        if (parts.length !== 3 || parts[2] !== y) return false;
        const [a, b] = parts as [number, number];
        return (a === d && b === m) || (a === m && b === d);
      };
      /** The counter's block (the largest container holding no other counter), its date boxes. */
      const dateBoxes = (): HTMLInputElement[] => {
        const counter = findCounters()[command.counter ?? 0];
        if (!counter) return [];
        let block: Element = counter.root;
        for (
          let n = counter.root.parentElement, up = 0;
          n && n !== document.body && up < 6;
          n = n.parentElement, up += 1
        ) {
          const pluses = Array.from(n.querySelectorAll('button')).filter(
            (b) => visible(b) && text(b) === '+',
          );
          if (pluses.length > 1) break;
          block = n;
        }
        return Array.from(block.querySelectorAll('input')).filter(
          (i) => visible(i) && i.parentElement?.querySelector('mat-datepicker-toggle') !== null,
        );
      };
      /** The date box captioned `label`: its container (holding no other date box) says so. */
      const labelled = (label: string): HTMLInputElement | null => {
        const all = Array.from(document.querySelectorAll('input')).filter(
          (i) => visible(i) && i.parentElement?.querySelector('mat-datepicker-toggle') !== null,
        );
        for (const input of all) {
          for (let n = input.parentElement, up = 0; n && up < 5; n = n.parentElement, up += 1) {
            if (all.filter((i) => n.contains(i)).length > 1) break;
            if (text(n).toLowerCase().includes(label.toLowerCase())) return input;
          }
        }
        return null;
      };
      const box = () =>
        command.label !== undefined
          ? labelled(command.label)
          : (dateBoxes()[command.nth ?? 0] ?? null);
      // A box added by the counter or a question a moment ago may not be drawn yet.
      const start = await until(box, 2500);
      if (!start) {
        if (command.label !== undefined) return { ok: false, detail: 'date-box-not-found' };
        const counter = findCounters()[command.counter ?? 0];
        const shows = counter?.box?.value ?? (counter ? text(counter.root) : 'no counter');
        return {
          ok: false,
          detail: `date-box-not-found (${dateBoxes().length} shown, counter shows ${shows})`,
        };
      }
      if (same(start.value)) return { ok: true, detail: 'already-set' };
      const toggle =
        start.parentElement?.querySelector<HTMLElement>('mat-datepicker-toggle button') ?? start;
      pressEl(toggle);
      const calendar = (): HTMLElement | null =>
        Array.from(document.querySelectorAll<HTMLElement>('mat-calendar')).find(visible) ?? null;
      if (!(await until(calendar, 5000))) return { ok: false, detail: 'calendar-not-shown' };
      const words = (el: Element) =>
        (el.getAttribute('aria-label') ?? text(el)).toLowerCase().split(/[^a-z0-9]+/);
      const disabled = (el: Element) =>
        el.classList.contains('mat-calendar-body-disabled') ||
        el.getAttribute('aria-disabled') === 'true';
      for (let move = 0; ; move += 1) {
        const cal = calendar();
        if (!cal) break; // closed: the day was chosen
        if (move >= 60) return { ok: false, detail: 'calendar-did-not-reach-date' };
        const cells = Array.from(cal.querySelectorAll<HTMLElement>('.mat-calendar-body-cell'));
        const go = (selector: string): boolean => {
          const b = cal.querySelector<HTMLButtonElement>(selector);
          if (!b || b.disabled) return false;
          pressEl(b);
          return true;
        };
        let target: HTMLElement | undefined;
        if (cal.querySelector('mat-month-view')) {
          target = cells.find((c) => {
            const w = words(c);
            return w.includes(String(d)) && w.includes(month) && w.includes(String(y));
          });
          if (!target && !go('.mat-calendar-period-button')) {
            return { ok: false, detail: 'calendar-period-button-missing' };
          }
        } else if (cal.querySelector('mat-multi-year-view')) {
          target = cells.find((c) => text(c) === String(y));
          if (!target) {
            const years = cells.map((c) => Number(text(c))).filter((n) => n > 0);
            const back = years.length > 0 && y < Math.min(...years);
            if (!go(back ? '.mat-calendar-previous-button' : '.mat-calendar-next-button')) {
              return { ok: false, detail: 'date-disabled' };
            }
          }
        } else if (cal.querySelector('mat-year-view')) {
          target = cells.find((c) => {
            const w = words(c);
            return (w.includes(month) && w.includes(String(y))) || w.includes(month.slice(0, 3));
          });
          if (!target) return { ok: false, detail: 'month-not-found' };
        } else {
          return { ok: false, detail: 'calendar-view-unknown' };
        }
        if (target) {
          if (disabled(target)) return { ok: false, detail: 'date-disabled' };
          pressEl(target.querySelector('.mat-calendar-body-cell-content') ?? target);
          // The day: done once the box shows it, whether or not the calendar closes by itself.
          if (cal.querySelector('mat-month-view')) {
            if (await until(() => (same(box()?.value ?? '') ? true : null), 1500)) break;
          }
        }
        await sleep(150);
      }
      const set = await until(() => (same(box()?.value ?? '') ? true : null), 2500);
      return set
        ? { ok: true }
        : { ok: false, detail: `date-not-set: box shows "${box()?.value ?? ''}"` };
    }
    case 'ionPick': {
      const loose = (t: string) => t.replace(/\s+/g, '').toLowerCase();
      const want = loose(command.option);
      const selects = await until(() => {
        const shown = Array.from(document.querySelectorAll<HTMLElement>('ion-select')).filter(
          visible,
        );
        return shown.length > 0 ? shown : null;
      }, command.timeoutMs);
      if (!selects) return { ok: false, detail: 'no-dropdown' };
      const alertShown = (): HTMLElement | null =>
        Array.from(document.querySelectorAll<HTMLElement>('ion-alert')).find((a) =>
          visible(a.querySelector('.alert-wrapper') ?? a),
        ) ?? null;
      const offered: string[] = [];
      for (const select of selects) {
        if (!select.isConnected) continue;
        select.click();
        const alert = await until(alertShown, 4000);
        if (!alert) continue;
        const options = Array.from(alert.querySelectorAll<HTMLElement>('button')).filter(
          (b) =>
            b.id.startsWith('alert-input-') ||
            b.matches('.alert-radio-button, .alert-checkbox-button'),
        );
        for (const o of options) if (text(o) && !offered.includes(text(o))) offered.push(text(o));
        const action = (label: string): HTMLElement | null =>
          Array.from(alert.querySelectorAll<HTMLElement>('button')).find(
            (b) => !options.includes(b) && text(b).toLowerCase() === label,
          ) ?? null;
        const match = options.find((o) =>
          command.exact ? loose(text(o)) === want : loose(text(o)).startsWith(want),
        );
        if (!match) {
          action('cancel')?.click();
          await until(() => (alertShown() ? null : true), 3000);
          continue;
        }
        if (match.getAttribute('aria-checked') !== 'true') match.click();
        await sleep(200);
        const ok = action('ok');
        if (!ok) return { ok: false, detail: 'ok-not-found' };
        ok.click();
        if (!(await until(() => (alertShown() ? null : true), 4000))) {
          return { ok: false, detail: 'picker-still-open' };
        }
        return { ok: true, value: text(match) };
      }
      return {
        ok: false,
        detail: offered.length > 0 ? `no-match (offered: ${offered.join('; ')})` : 'no-options',
      };
    }
    case 'ionRadio': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const want = loose(command.label);
      const fits = (t: string) => {
        const have = loose(t);
        if (command.match === 'exact') return have === want;
        if (command.match === 'contains') return have.includes(want);
        return have.startsWith(want);
      };
      const group = (): Element | null => {
        const groups = Array.from(
          document.querySelectorAll(command.group.selector ?? 'ion-radio-group'),
        ).filter(visible);
        if (!command.group.question) return groups[0] ?? null;
        const q = loose(command.group.question);
        // The group whose nearest container saying the question holds no other group.
        for (const g of groups) {
          for (let n = g.parentElement, up = 0; n && up < 5; n = n.parentElement, up += 1) {
            if (groups.filter((o) => n.contains(o)).length > 1) break;
            if (loose(text(n)).includes(q)) return g;
          }
        }
        return null;
      };
      const found = await until(group, command.timeoutMs);
      if (!found) return { ok: false, detail: 'group-not-found' };
      const radios = () =>
        Array.from((group() ?? found).querySelectorAll<HTMLElement>('ion-radio')).filter(visible);
      const checked = (r: Element) =>
        r.getAttribute('aria-checked') === 'true' ||
        /\bradio-checked\b/.test(r.getAttribute('class') ?? '');
      const labelOf = (r: HTMLElement): string => {
        if (text(r)) return text(r);
        for (let n = r.parentElement, up = 0; n && up < 3; n = n.parentElement, up += 1) {
          if (n.querySelectorAll('ion-radio').length > 1) break;
          if (text(n)) return text(n);
        }
        return '';
      };
      const pick = () => radios().find((r) => fits(labelOf(r))) ?? null;
      const radio = pick();
      if (!radio) {
        return {
          ok: false,
          detail: `option-missing (offered: ${radios()
            .map(labelOf)
            .map((t) => t.slice(0, 40))
            .join('; ')})`,
        };
      }
      if (checked(radio)) return { ok: true, detail: 'already-chosen', value: labelOf(radio) };
      radio.click();
      const chosen = await until(() => {
        const now = pick();
        return now && checked(now) ? now : null;
      }, 3000);
      return chosen ? { ok: true, value: labelOf(chosen) } : { ok: false, detail: 'not-chosen' };
    }
    case 'ionRadioRead': {
      const read = (): string | null => {
        const g = first(document, command.group.selector);
        const radio = g
          ? Array.from(g.querySelectorAll('ion-radio')).find(
              (r) =>
                visible(r) &&
                (r.getAttribute('aria-checked') === 'true' ||
                  /\bradio-checked\b/.test(r.getAttribute('class') ?? '')),
            )
          : undefined;
        if (!radio) return null;
        const need = command.requires;
        if (need?.select !== undefined || need?.chosen !== undefined) {
          const digits = (t: string) => t.replace(/\D/g, '');
          const want = need.select !== undefined ? digits(need.select) : null;
          const showsWanted =
            want !== null &&
            Array.from(document.querySelectorAll('ion-select')).some(
              (el) => visible(el) && digits(selectShows(el)) === want,
            );
          const squash = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
          const chosen =
            need.chosen !== undefined &&
            Array.from(document.querySelectorAll('body *')).some(
              (el) =>
                el.childElementCount === 0 &&
                visible(el) &&
                squash(text(el)) === squash(need.chosen!),
            );
          if (!showsWanted && !chosen) return null;
        }
        for (let n: Element | null = radio, up = 0; n && up < 4; n = n.parentElement, up += 1) {
          if (n.querySelectorAll('ion-radio').length > 1) break;
          const label = text(n);
          if (!label) continue;
          if (
            need?.label !== undefined &&
            !label.replace(/\s+/g, ' ').toLowerCase().startsWith(need.label.toLowerCase())
          ) {
            return null;
          }
          return label;
        }
        return null;
      };
      const value = await until(read, command.timeoutMs);
      if (!value) return { ok: false, detail: 'nothing-chosen' };
      const sum = command.withSelect
        ? Array.from(document.querySelectorAll('ion-select'))
            .filter(visible)
            .map((el) => selectShows(el).replace(/\s+/g, ' ').trim())
            .find((t) => /\d/.test(t) && /₹|rs|inr|\d,\d/i.test(t))
        : undefined;
      return { ok: true, value, ...(sum ? { label: sum } : {}) };
    }
    case 'addOn': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const want = loose(command.name);
      const ADD = /^\+?\s*add$/i;
      const DONE = /^(remove|added|✓\s*added)$/i;
      const leaves = (root: ParentNode) =>
        Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
          (el) => el.children.length === 0 && visible(el),
        );
      /** The add-on's row: around the text naming it, the first container with an Add/Remove. */
      const row = (): { add: HTMLElement | null; done: boolean } | null => {
        const names = leaves(document).filter((el) => loose(text(el)) === want);
        const named =
          names.length > 0
            ? names
            : leaves(document).filter((el) => loose(text(el)).startsWith(want));
        for (const name of named) {
          for (let n = name.parentElement, up = 0; n && up < 6; n = n.parentElement, up += 1) {
            const actions = leaves(n).filter((el) => ADD.test(text(el)) || DONE.test(text(el)));
            if (actions.length > 1) break;
            if (actions.length === 1) {
              const a = actions[0]!;
              return { add: ADD.test(text(a)) ? a : null, done: DONE.test(text(a)) };
            }
          }
        }
        return null;
      };
      const found = await until(row, command.timeoutMs);
      if (!found) return { ok: false, detail: 'add-on-not-found' };
      if (!found.add) return { ok: true, detail: 'already-added' };
      pressEl(found.add.closest('button, a, [role="button"]') ?? found.add);
      const added = await until(() => (row()?.add ? null : true), 4000);
      return added ? { ok: true } : { ok: false, detail: 'not-added' };
    }
    case 'clickInRow': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const target = await until(() => {
        const hits = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
          (el) =>
            el.children.length === 0 && visible(el) && loose(text(el)) === loose(command.text),
        );
        return (
          hits.find((el) => {
            for (let n = el.parentElement, up = 0; n && up < 6; n = n.parentElement, up += 1) {
              if (hits.filter((h) => n.contains(h)).length > 1) return false;
              if (loose(text(n)).includes(loose(command.row))) return true;
            }
            return false;
          }) ?? null
        );
      }, command.timeoutMs);
      if (!target) return { ok: false, detail: 'not-found' };
      pressEl(target.closest('button, a, [role="button"]') ?? target);
      return { ok: true };
    }
    case 'scrollTo': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const el = await until(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>('*')).find(
            (e) => e.children.length === 0 && visible(e) && loose(text(e)) === loose(command.text),
          ) ?? null,
        command.timeoutMs,
      );
      if (!el) return { ok: false, detail: 'not-found' };
      // A page that acts on scrolling (Niva Bupa's footer turns to Calculate Premium) must see a
      // scroll even when the element is already in view: nudge first, then scroll to it.
      window.scrollBy(0, window.scrollY > 0 ? -1 : 1);
      await sleep(100);
      el.scrollIntoView({ block: 'start' });
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('scroll'));
      await sleep(800);
      return { ok: true };
    }
    case 'pickOption': {
      const loose = (t: string) => t.replace(/\s+/g, '').toLowerCase();
      const find = (): HTMLInputElement | null => {
        const all = Array.from(document.querySelectorAll(command.selector)).filter(visible);
        const el = command.after
          ? boxAfter(all, command.after)
          : command.last
            ? all.at(-1)
            : all[0];
        return el instanceof HTMLInputElement && !el.disabled ? el : null;
      };
      const box = await until(find, command.timeoutMs);
      if (!box) return { ok: false, detail: 'not-found' };
      if (command.markAs) box.setAttribute('data-fqf-box', command.markAs);
      const items = (): HTMLElement[] => {
        const owned = ['aria-controls', 'aria-owns']
          .map((a) => box.getAttribute(a))
          .filter((id): id is string => !!id)
          .map((id) => document.getElementById(id))
          .filter((el): el is HTMLElement => el !== null);
        const lists =
          owned.length > 0
            ? owned
            : Array.from(
                document.querySelectorAll<HTMLElement>('.cdk-overlay-container [role="listbox"]'),
              );
        return lists
          .flatMap((l) =>
            Array.from(l.querySelectorAll<HTMLElement>('[role="option"], mat-option')),
          )
          .filter((o) => visible(o) && text(o) !== '');
      };
      /** Waits for the list, opening the box again every `every` ms as a person would click it. */
      const listed = (ms: number, every: number, again: () => void): Promise<true | null> => {
        let asked = Date.now();
        return until(() => {
          if (items().length > 0) return true;
          if (Date.now() - asked >= every) {
            asked = Date.now();
            again();
          }
          return null;
        }, ms);
      };
      box.focus();
      pressEl(box);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (setter?.set) setter.set.call(box, command.type);
      else box.value = command.type;
      fire(box, 'input');
      fire(box, 'keyup');
      // A list loaded from the insurer may come late: while none is shown, the box is asked again
      // every 1.5 seconds, as a person would: a click on the field around the box (the recording of
      // 24 November 2026 opened Niva Bupa's plan list so, not on the box), the Down arrow (which
      // opens an Angular Material list), and the text typed again.
      const field =
        (box
          .closest('mat-form-field, .mat-mdc-form-field')
          ?.querySelector(
            '.mat-form-field-infix, .mat-mdc-form-field-infix, .mat-form-field-flex',
          ) as HTMLElement | null) ?? box.parentElement;
      // The text must change each time: Angular Material works its list out again only when the
      // box's text changes (the trace of 25 November 2026: "ReAssure2.0" typed again and again, the
      // plans loaded meanwhile, no list ever shown). So the retries take turns: the box emptied
      // (every option listed, as a person clicking an empty box sees), then the text typed again.
      let emptied = false;
      const shown = await listed(command.suggestMs ?? 4000, 1500, () => {
        emptied = !emptied;
        if (field && field !== box) pressEl(field);
        box.focus();
        pressEl(box);
        if (setter?.set) setter.set.call(box, emptied ? '' : command.type);
        else box.value = emptied ? '' : command.type;
        fire(box, 'input');
        fire(box, 'keyup');
        box.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            keyCode: 40,
            bubbles: true,
          }),
        );
      });
      if (!shown) return { ok: false, detail: 'no-match (no suggestions)' };
      let match: HTMLElement | undefined;
      for (const option of command.options) {
        match = items().find((o) =>
          command.startsWith
            ? loose(text(o)).startsWith(loose(option))
            : loose(text(o)) === loose(option),
        );
        if (match) break;
      }
      if (!match) {
        const offered = items()
          .map((o) => text(o))
          .slice(0, 15)
          .join('; ');
        box.blur();
        return { ok: false, detail: `no-match (offered: ${offered})` };
      }
      const chosen = text(match);
      const wanted = command.options.find((o) =>
        command.startsWith ? loose(chosen).startsWith(loose(o)) : loose(chosen) === loose(o),
      );
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      match.click();
      await sleep(700);
      if (command.shownIn) {
        const shown = await until(
          () =>
            Array.from(document.querySelectorAll(command.shownIn!)).some(
              (el) => visible(el) && loose(text(el)).startsWith(loose(wanted ?? chosen)),
            )
              ? true
              : null,
          3000,
        );
        return shown
          ? { ok: true, value: chosen }
          : { ok: false, detail: `not-kept: ${command.shownIn} does not show it` };
      }
      const kept = find();
      return kept && loose(kept.value) === loose(chosen)
        ? { ok: true, value: chosen }
        : { ok: false, detail: `not-kept: box shows "${kept?.value ?? ''}"` };
    }
    case 'clickSelector': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const pattern = command.pattern ? new RegExp(command.pattern, 'i') : null;
      const face = (el: Element) => loose(text(el) || (el as HTMLInputElement).value || '');
      const target = await until(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>(command.selector)).find(
            (el) =>
              visible(el) &&
              (command.text === undefined || face(el) === loose(command.text)) &&
              (!pattern || pattern.test(face(el))),
          ) ?? null,
        command.timeoutMs,
      );
      if (!target) return { ok: false, detail: 'not-found' };
      if ((target as HTMLButtonElement).disabled) return { ok: false, detail: 'disabled' };
      target.click();
      await sleep(400);
      return { ok: true };
    }
    case 'reveal': {
      if (first(document, command.show)) return { ok: true, detail: 'already-shown' };
      const opener = first(document, command.by);
      if (!opener) return { ok: false, detail: 'opener-not-found' };
      opener.click();
      const shown = await until(() => first(document, command.show), command.timeoutMs);
      return shown ? { ok: true } : { ok: false, detail: 'not-shown-after-click' };
    }
    case 'readAmount': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim();
      const labels = [command.label, ...(command.alsoLabels ?? [])].map((l) => l.toLowerCase());
      const errors = command.errorPattern ? new RegExp(command.errorPattern, 'i') : null;
      // A number standing alone: not part of a date (11/11/2026) or a longer number.
      const AMOUNT = /(?<![\d/])(?:rs\.?|₹|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)(?![\d/]|-\d)/i;
      // The text a person reads as a caption and its amount: never the options of a list, a
      // button's words or anything hidden.
      const readable = (el: Element): string => {
        const parts: string[] = [];
        const walk = (node: Node): void => {
          if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent ?? '');
            return;
          }
          if (!(node instanceof Element)) return;
          if (/^(SELECT|OPTION|SCRIPT|STYLE|TEXTAREA|BUTTON)$/.test(node.tagName)) return;
          if (node !== el && !visible(node)) return;
          node.childNodes.forEach(walk);
        };
        walk(el);
        return loose(parts.join(' '));
      };
      const chains = (label: string): Element[][] =>
        Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter(
            (el) =>
              el.children.length <= 3 &&
              visible(el) &&
              !el.closest('select') &&
              loose(text(el)).toLowerCase().includes(label),
          )
          .map((el) => {
            // The label's own element, then up to two around it (its row: the next cell).
            const chain: Element[] = [];
            for (let n: Element | null = el; n && chain.length < 3; n = n.parentElement)
              chain.push(n);
            return chain;
          });
      // What the page already said when the step began (left out when only fresh text counts).
      const before = new Map<Element, string>();
      if (command.fresh) {
        for (const label of labels)
          for (const chain of chains(label)) for (const n of chain) before.set(n, readable(n));
      }
      const amount = (): string | null => {
        for (const label of labels) {
          for (const chain of chains(label)) {
            for (const n of chain) {
              const t = readable(n);
              if (before.get(n) === t) continue;
              const at = t.toLowerCase().indexOf(label);
              if (at < 0) continue;
              const m = AMOUNT.exec(t.slice(at + label.length));
              if (m && m[1]!.replace(/\D/g, '').length >= 2) return m[1]!;
            }
          }
        }
        return null;
      };
      const complaint = (): string | null => {
        if (!errors) return null;
        const hit = Array.from(
          document.querySelectorAll<HTMLElement>('label, span, div, p, li, strong'),
        ).find((el) => el.children.length === 0 && visible(el) && errors.test(text(el)));
        return hit ? text(hit).slice(0, 200) : null;
      };
      const found = await until(
        () => amount() ?? (complaint() ? 'complaint' : null),
        command.timeoutMs,
      );
      if (found && found !== 'complaint') return { ok: true, value: found };
      const said = complaint();
      if (said) return { ok: false, detail: `page-says: ${said}` };
      // For support (a page not recorded): what the page says about premiums instead.
      const seen = Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((el) => el.children.length === 0 && visible(el) && /premium/i.test(text(el)))
        .map((el) => text(el).slice(0, 60))
        .filter((t, i, all) => all.indexOf(t) === i)
        .slice(0, 4)
        .join(' | ');
      return { ok: false, detail: seen ? `not-shown (page shows: ${seen})` : 'not-shown' };
    }
    case 'pickFromList': {
      const loose = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const want = loose(command.option);
      const box = await until(() => first(document, command.input), command.timeoutMs);
      if (!box) return { ok: false, detail: 'not-found' };
      const shows = () => {
        const b = first(document, command.input) as HTMLInputElement | null;
        return b ? loose(b.value || text(b)) : '';
      };
      if (shows() === want) return { ok: true, detail: 'already-chosen', value: command.option };
      pressEl(box);
      // The item nearest the box (lists of several boxes may all be on the page).
      const ancestors = new Map<Element, number>();
      for (let n: Element | null = box, d = 0; n; n = n.parentElement, d += 1) ancestors.set(n, d);
      const distance = (el: Element): number => {
        for (let n: Element | null = el; n; n = n.parentElement) {
          const d = ancestors.get(n);
          if (d !== undefined) return d;
        }
        return Number.MAX_SAFE_INTEGER;
      };
      const items = (): HTMLElement[] =>
        Array.from(document.querySelectorAll<HTMLElement>('a, li, button, [role="option"], label'))
          .filter((el) => el !== box && visible(el) && loose(text(el)) === want)
          // The innermost (the link inside a list item: PIE listens on the link).
          .filter((el, _i, all) => !all.some((o) => o !== el && el.contains(o)))
          .sort((a, b) => distance(a) - distance(b));
      const shown = await until(() => (items().length > 0 ? items() : null), 4000);
      if (!shown) {
        const near = Array.from(
          (box.parentElement?.parentElement ?? document).querySelectorAll<HTMLElement>('a, li'),
        )
          .filter(visible)
          .map((el) => text(el))
          .filter(Boolean)
          .slice(0, 12);
        return {
          ok: false,
          detail: `no-match${near.length ? ` (offered: ${near.join('; ')})` : ''}`,
        };
      }
      pressEl(shown[0]!);
      const kept = await until(() => (shows().includes(want) ? true : null), 2500);
      return kept
        ? { ok: true, value: command.option }
        : { ok: false, detail: `not-kept: box shows "${shows()}"` };
    }
  }
}
