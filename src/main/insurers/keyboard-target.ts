// The Electron side of keyboard fill (keyboard-fill.ts): what has the cursor, typing and Tab, in
// one portal window. Typing goes through sendInputEvent (key down, character, key up), which a
// canvas app such as Flutter handles like a real keyboard. The focused box is read in an isolated
// world, and only its kind and whether it is empty: never its value.
import type { WebContents } from 'electron';
import { keyCodeFor, type FocusedBox, type KeyboardTarget } from './keyboard-fill';

const FOCUSED_BOX = `(() => {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return { kind: el && el !== document.body ? 'other' : 'none', empty: true };
  }
  const type = el instanceof HTMLInputElement ? el.type : 'text';
  const kind =
    type === 'password' ? 'password' : ['text', 'email', 'tel', ''].includes(type) ? 'text' : 'other';
  return { kind, empty: el.value === '' };
})()`;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function keyboardTargetFor(wc: WebContents, worldId: number): KeyboardTarget {
  const key = (keyCode: string, withChar: boolean): void => {
    wc.sendInputEvent({ type: 'keyDown', keyCode });
    if (withChar) wc.sendInputEvent({ type: 'char', keyCode });
    wc.sendInputEvent({ type: 'keyUp', keyCode });
  };
  return {
    url: () => (wc.isDestroyed() ? '' : wc.getURL()),
    focused: async () =>
      wc.isDestroyed()
        ? { kind: 'none', empty: true }
        : ((await wc.executeJavaScriptInIsolatedWorld(worldId, [
            { code: FOCUSED_BOX },
          ])) as FocusedBox),
    type: async (text) => {
      for (const ch of text) {
        if (wc.isDestroyed()) return;
        key(keyCodeFor(ch), true);
        await pause(25);
      }
      await pause(300);
    },
    tab: async () => {
      if (wc.isDestroyed()) return;
      key('Tab', false);
      await pause(400);
    },
  };
}
