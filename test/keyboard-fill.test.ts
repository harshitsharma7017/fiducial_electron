// Keyboard fill for canvas portals (HDFC ERGO): every check before each typing step, against a
// simulated page. Synthetic details only.
import { describe, expect, it } from 'vitest';
import {
  keyboardFill,
  keyCodeFor,
  type FocusedBox,
  type KeyboardTarget,
} from '../src/main/insurers/keyboard-fill';
import { findPortal, type InsurerPortal } from '../src/shared/insurers/portals';

const LOGIN = { username: 'SYNTHUSER01', password: 'Synth@Pass#9!' };
const HDFC = findPortal('hdfc-ergo') as InsurerPortal;

/** A page with boxes in Tab order; `cursor` is the box the advisor clicked (or null). */
function page(
  boxes: { kind: FocusedBox['kind']; value?: string }[],
  cursor: number | null,
  url = 'https://1up.hdfcergo.com/',
) {
  const values = boxes.map((b) => b.value ?? '');
  let at = cursor;
  const typed: string[] = [];
  const target: KeyboardTarget = {
    url: () => url,
    focused: () =>
      Promise.resolve(
        at === null
          ? { kind: 'none', empty: true }
          : { kind: boxes[at]!.kind, empty: values[at] === '' },
      ),
    type: (text) => {
      typed.push(text);
      if (at !== null) values[at] += text;
      return Promise.resolve();
    },
    tab: () => {
      if (at !== null) at = at + 1 < boxes.length ? at + 1 : null;
      return Promise.resolve();
    },
  };
  return { target, values, typed };
}

describe('keyboard fill (canvas portals)', () => {
  it('types the user ID, Tab, then the password, when the advisor clicked the user ID box', async () => {
    const p = page([{ kind: 'text' }, { kind: 'password' }], 0);
    expect(await keyboardFill(p.target, HDFC, LOGIN)).toBe('filled');
    expect(p.values).toEqual([LOGIN.username, LOGIN.password]);
  });

  it('types nothing unless the cursor is in a text box', async () => {
    for (const cursor of [null, 1]) {
      const p = page([{ kind: 'text' }, { kind: 'password' }], cursor);
      expect(await keyboardFill(p.target, HDFC, LOGIN)).toBe('click-username-first');
      expect(p.typed).toEqual([]);
    }
    const other = page([{ kind: 'other' }, { kind: 'password' }], 0);
    expect(await keyboardFill(other.target, HDFC, LOGIN)).toBe('click-username-first');
    expect(other.typed).toEqual([]);
  });

  it('never types the password unless Tab lands in a password box', async () => {
    const p = page([{ kind: 'text' }, { kind: 'text' }], 0);
    expect(await keyboardFill(p.target, HDFC, LOGIN)).toBe('field-wrong-type');
    expect(p.typed).toEqual([LOGIN.username]);
    expect(p.values.join('')).not.toContain(LOGIN.password);
  });

  it('keeps what the advisor already typed', async () => {
    const user = page([{ kind: 'text', value: 'TYPED' }, { kind: 'password' }], 0);
    expect(await keyboardFill(user.target, HDFC, LOGIN)).toBe('kept-advisor-input');
    expect(user.typed).toEqual([]);
    const pass = page([{ kind: 'text' }, { kind: 'password', value: 'x' }], 0);
    expect(await keyboardFill(pass.target, HDFC, LOGIN)).toBe('kept-advisor-input');
    expect(pass.typed).toEqual([LOGIN.username]);
  });

  it('types nothing off the sign-in page or on another site', async () => {
    for (const url of [
      'https://1up.hdfcergo.com/dashboard',
      'https://evil.example/',
      'http://1up.hdfcergo.com/',
    ]) {
      const p = page([{ kind: 'text' }, { kind: 'password' }], 0, url);
      expect(await keyboardFill(p.target, HDFC, LOGIN)).toBe('left-login-page');
      expect(p.typed).toEqual([]);
    }
  });

  it('only runs for shortcut portals', async () => {
    const p = page(
      [{ kind: 'text' }, { kind: 'password' }],
      0,
      'https://www.uiic.in/GCWebPortal/login/LoginAction.do',
    );
    expect(await keyboardFill(p.target, findPortal('united-india') as InsurerPortal, LOGIN)).toBe(
      'left-login-page',
    );
    expect(p.typed).toEqual([]);
  });

  it('names the space key, and passes every other character through', () => {
    expect(keyCodeFor(' ')).toBe('Space');
    expect([...'aZ9@#!$%'].map(keyCodeFor).join('')).toBe('aZ9@#!$%');
  });
});
