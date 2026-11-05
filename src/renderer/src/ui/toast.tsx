// Toast notifications: short confirmations ("Client saved") in the bottom-right corner. A tiny
// store any screen can call (toast(...)); <Toaster/> in the app shell shows them.
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

export type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const SHOWN_MS = 4500;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function dismiss(id: number): void {
  items = items.filter((t) => t.id !== id);
  notify();
}

export function toast(text: string, tone: ToastTone = 'success'): void {
  const id = nextId++;
  // At most three at once: the oldest goes.
  items = [...items.slice(-2), { id, tone, text }];
  notify();
  setTimeout(() => dismiss(id), SHOWN_MS);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const ICONS = { success: CheckCircle2, error: XCircle, info: Info } as const;

export function Toaster(): React.JSX.Element {
  const shown = useSyncExternalStore(subscribe, () => items);
  return createPortal(
    <div className="toaster" role="status" aria-live="polite">
      {shown.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon size={18} aria-hidden="true" />
            <p>{t.text}</p>
            <button
              type="button"
              className="icon-button btn-sm"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
