// Keyboard fill for portals drawn on a canvas ("shortcut" portals; HDFC ERGO's Flutter app).
//
// Such a page has no form fields the app can find, but it takes typing like any other page. So the
// advisor clicks into the user ID box and presses the fill shortcut, and the app types as a
// keyboard would, checking each step against the box that has the cursor:
//   1. the page is the portal's sign-in page (origin and path);
//   2. the cursor is in an empty text box (the advisor's click), else nothing is typed;
//   3. the user ID is typed, and the box must then hold exactly as many characters (a dropped key
//      press stops here, before the password), then Tab;
//   4. the cursor is now in an empty password box, else the password is not typed;
//   5. the password is typed, and its length checked the same way.
// It never clicks and never presses Enter or the sign-in button: the advisor signs in.
// Logic only: the portal window supplies the target (focused box, typing, Tab).
import type { FillOutcome } from '../../shared/insurers/fill-outcomes';
import { mayFillLogin, type InsurerPortal } from '../../shared/insurers/portals';
import type { InsurerLogin } from './credentials';

export interface FocusedBox {
  /** The kind of box with the cursor: a text box, a password box, something else, or nothing. */
  kind: 'text' | 'password' | 'other' | 'none';
  empty: boolean;
  /** How many characters the box holds (never what they are). */
  length: number;
}

export interface KeyboardTarget {
  url(): string;
  focused(): Promise<FocusedBox>;
  type(text: string): Promise<void>;
  tab(): Promise<void>;
}

export async function keyboardFill(
  target: KeyboardTarget,
  portal: InsurerPortal,
  login: InsurerLogin,
): Promise<FillOutcome> {
  if (portal.automation !== 'shortcut' || !mayFillLogin(portal, target.url())) {
    return 'left-login-page';
  }
  const first = await target.focused();
  if (first.kind !== 'text') return 'click-username-first';
  if (!first.empty) return 'kept-advisor-input';

  await target.type(login.username);
  const typed = await target.focused();
  if (typed.kind !== 'text' || typed.length !== [...login.username].length) return 'agent-failed';

  await target.tab();
  if (!mayFillLogin(portal, target.url())) return 'left-login-page';
  const second = await target.focused();
  if (second.kind !== 'password') return 'field-wrong-type';
  if (!second.empty) return 'kept-advisor-input';

  await target.type(login.password);
  const done = await target.focused();
  return done.kind === 'password' && done.length === [...login.password].length
    ? 'filled'
    : 'agent-failed';
}

/** Electron key codes for typing `ch` (sendInputEvent): a space must be named. */
export function keyCodeFor(ch: string): string {
  return ch === ' ' ? 'Space' : ch;
}
