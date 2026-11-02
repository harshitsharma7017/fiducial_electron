// The in-page login agent: fills an insurer's own sign-in form with the advisor's saved user ID
// and password. It is serialised with Function.prototype.toString and run in an isolated world
// of the portal window, so it must stay self-contained: no imports, no outer variables.
//
// What it does, and does not do:
// - Checks again, inside the page, that the page is on the expected origin: the main process
//   checked the URL, but the page may have navigated since.
// - Waits (bounded) for the form to render, since most of these portals are single-page apps.
// - Needs exactly one visible match for each selector; the password field must be a real
//   password input. Anything else is reported and nothing is filled.
// - A box the page marks read-only gets focus first, as a click would (some portals unlock on
//   focus); if it stays read-only it is refused. The agent never removes the lock itself.
// - Fills a field only if it is empty: whatever the advisor has typed is kept.
// - Sets values the way typing does (native setter, then input and change events), so Angular,
//   AngularJS and Ionic forms see them.
// - Focuses the CAPTCHA box if there is one. It never reads, solves or fills a CAPTCHA, never
//   clicks a button and never submits the form: the advisor signs in.
// - Returns field states only, never values.

export type FieldState = 'filled' | 'kept' | 'not-found' | 'ambiguous' | 'wrong-type';

export interface FillCommand {
  op: 'fill';
  expectedOrigin: string;
  selectors: { username: string; password: string; captcha?: string };
  username: string;
  password: string;
  /** How long to wait for the form to appear, in milliseconds. */
  waitMs: number;
}

export type FillResult =
  | { ok: false; reason: 'wrong-origin' | 'form-not-found' }
  | {
      ok: true;
      username: FieldState;
      password: FieldState;
      captchaFocused: boolean;
    };

export async function insurerLoginAgent(command: FillCommand): Promise<FillResult> {
  const visible = (el: Element): boolean => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    );
  };
  const lookup = (selector: string): { el: HTMLInputElement | null; state: FieldState | null } => {
    let matches: Element[];
    try {
      matches = Array.from(document.querySelectorAll(selector)).filter(visible);
    } catch {
      return { el: null, state: 'not-found' };
    }
    if (matches.length === 0) return { el: null, state: 'not-found' };
    if (matches.length > 1) return { el: null, state: 'ambiguous' };
    const el = matches[0];
    // Read-only is checked after unlocking (below): some portals unlock on focus.
    if (!(el instanceof HTMLInputElement) || el.disabled) {
      return { el: null, state: 'wrong-type' };
    }
    return { el, state: null };
  };
  // Some portals (United India) mark the boxes read-only against browser autofill and unlock each
  // one when it receives focus, as a click into it would. Give the page that focus; never remove
  // the lock ourselves. A box that stays read-only is refused.
  const unlock = async (el: HTMLInputElement): Promise<boolean> => {
    if (!el.readOnly) return true;
    el.focus();
    // focus() fires no event while the window itself is not focused: send the one a click would.
    if (el.readOnly) el.dispatchEvent(new FocusEvent('focus'));
    if (el.readOnly) await new Promise((resolve) => setTimeout(resolve, 100));
    return !el.readOnly;
  };
  const sameOrigin = (): boolean => location.origin === command.expectedOrigin;

  if (!sameOrigin()) return { ok: false, reason: 'wrong-origin' };

  // Wait for both fields to render (single-page apps draw the form after load).
  const deadline = Date.now() + Math.max(0, Math.min(command.waitMs, 30_000));
  let user = lookup(command.selectors.username);
  let pass = lookup(command.selectors.password);
  while ((user.state === 'not-found' || pass.state === 'not-found') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!sameOrigin()) return { ok: false, reason: 'wrong-origin' };
    user = lookup(command.selectors.username);
    pass = lookup(command.selectors.password);
  }
  if (user.state === 'not-found' && pass.state === 'not-found') {
    return { ok: false, reason: 'form-not-found' };
  }
  if (pass.el && pass.el.type !== 'password') pass = { el: null, state: 'wrong-type' };
  if (user.el && !['text', 'email', 'tel', ''].includes(user.el.getAttribute('type') ?? '')) {
    user = { el: null, state: 'wrong-type' };
  }
  if (user.el && pass.el) {
    if (!(await unlock(user.el))) user = { el: null, state: 'wrong-type' };
    if (pass.el && !(await unlock(pass.el))) pass = { el: null, state: 'wrong-type' };
  }
  // Fill both or neither: a half-filled form invites a wrong sign-in attempt.
  if (!user.el || !pass.el) {
    return {
      ok: true,
      username: user.state ?? 'kept',
      password: pass.state ?? 'kept',
      captchaFocused: false,
    };
  }
  if (!sameOrigin()) return { ok: false, reason: 'wrong-origin' };

  // The prototype's setter, as typing would use, rather than one a framework put on the element.
  const valueProperty = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const fill = (el: HTMLInputElement, value: string): FieldState => {
    if (el.value !== '') return 'kept';
    el.focus();
    if (valueProperty?.set) valueProperty.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return 'filled';
  };
  const username = fill(user.el, command.username);
  const password = fill(pass.el, command.password);

  let captchaFocused = false;
  if (command.selectors.captcha) {
    const captcha = lookup(command.selectors.captcha);
    if (captcha.el && captcha.el.value === '') {
      captcha.el.focus();
      captchaFocused = document.activeElement === captcha.el;
    }
  }
  return { ok: true, username, password, captchaFocused };
}
