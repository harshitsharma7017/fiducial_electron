// Dialog and drawer. Rendered into document.body. Handles Escape, backdrop click, focus trap and
// focus return, and keeps the last content on screen for the short exit animation.
// variant 'drawer' docks it to the right edge (quote workspaces); 'dialog' centres it.
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const EXIT_MS = 180;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal(props: {
  open: boolean;
  title: string;
  /** A line under the title (for example the client a quote is for). */
  subtitle?: string;
  onClose: () => void;
  variant?: 'dialog' | 'drawer';
  /** Width: narrow (confirmations), default, or wide (tables). */
  size?: 'narrow' | 'default' | 'wide';
  /** Kept for older callers: the same as size="wide". */
  wide?: boolean;
  /**
   * Out of sight but kept (its fields and results stay as they were): a quote drawer while the
   * app fills the insurer's form in its tab.
   */
  hidden?: boolean;
  children: ReactNode;
}): React.JSX.Element | null {
  const { open, title, subtitle, onClose, children } = props;
  const hiddenRef = useRef(props.hidden ?? false);
  hiddenRef.current = props.hidden ?? false;
  const [mounted, setMounted] = useState(open);
  const last = useRef<{ title: string; subtitle?: string; children: ReactNode }>({
    title,
    children,
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
    if (open) last.current = { title, ...(subtitle ? { subtitle } : {}), children };
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
    const first = dialog?.querySelector<HTMLElement>(
      '.modal-body input, .modal-body select, .modal-body textarea',
    );
    (first ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // Hidden: the keys belong to whatever is shown.
      if (hiddenRef.current) return;
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
  const content = open ? { title, subtitle, children } : last.current;
  const size = props.wide ? 'wide' : (props.size ?? 'default');

  return createPortal(
    <div
      className="modal-backdrop"
      data-state={open ? 'open' : 'closing'}
      data-variant={props.variant ?? 'dialog'}
      hidden={props.hidden}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={size === 'default' ? 'modal' : `modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        inert={!open}
      >
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{content.title}</h2>
            {content.subtitle && <p>{content.subtitle}</p>}
          </div>
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
