// Glass dialog. Rendered into document.body (a backdrop-filter ancestor would otherwise become the
// containing block of the fixed overlay). Handles Escape, backdrop click, focus trap and focus
// return, and keeps the last content on screen for the short exit animation.
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const EXIT_MS = 180;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** A wider dialog (for a table). */
  wide?: boolean;
  children: ReactNode;
}): React.JSX.Element | null {
  const { open, title, onClose, children } = props;
  const [mounted, setMounted] = useState(open);
  const last = useRef<{ title: string; children: ReactNode }>({ title, children });
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
    if (open) last.current = { title, children };
  });

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>('input, select, textarea');
    (first ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnFocus.current?.focus?.();
    };
  }, [open]);

  if (!mounted && !open) return null;
  const content = open ? { title, children } : last.current;

  return createPortal(
    <div
      className="modal-backdrop"
      data-state={open ? 'open' : 'closing'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={props.wide ? 'modal modal-wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        inert={!open}
      >
        <header className="modal-header">
          <h2 id={titleId}>{content.title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">{content.children}</div>
      </div>
    </div>,
    document.body,
  );
}
