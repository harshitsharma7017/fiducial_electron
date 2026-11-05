// Requests from one screen to another, such as the Overview's "Add a health client": the target
// screen acts on it when it is shown (at once if it is already mounted). One pending request at a
// time; a newer one replaces it.
import { useEffect, useRef } from 'react';

export type IntentAction = 'add' | 'import';
interface Intent {
  view: string;
  action: IntentAction;
}

let pending: Intent | null = null;
const listeners = new Set<() => void>();

export function requestIntent(view: string, action: IntentAction): void {
  pending = { view, action };
  listeners.forEach((l) => l());
}

/** Calls the handler for a request aimed at `view` (and clears it). */
export function useIntent(view: string, handlers: Partial<Record<IntentAction, () => void>>): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const check = () => {
      if (!pending || pending.view !== view) return;
      const handler = ref.current[pending.action];
      if (!handler) return;
      pending = null;
      handler();
    };
    check();
    listeners.add(check);
    return () => {
      listeners.delete(check);
    };
  }, [view]);
}
