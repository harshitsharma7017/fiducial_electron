// A "more actions" dropdown: a small icon button that opens a list of actions. Keyboard
// operable (arrow keys, Home/End, Escape), closed by choosing an item, clicking elsewhere or
// scrolling. The list is drawn in a layer over the page (so a card or the top bar never clips it),
// next to the button: below it, or above it when there is more room there, scrolling if tall.
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuEntry =
  | {
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** Shown as a tooltip, for example why the item is disabled. */
      hint?: string;
    }
  | { heading: string }
  | 'separator';

export function ActionMenu(props: {
  /** For screen readers: "Actions for Ramesh Kumar". */
  label: string;
  items: MenuEntry[];
  /** Tells the card a menu is open (to lift it above its neighbours). */
  onOpenChange?: (open: boolean) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'bottom' | 'top'>('bottom');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const onOpenChange = useRef(props.onOpenChange);
  onOpenChange.current = props.onOpenChange;

  const setShown = (next: boolean, restoreFocus = false) => {
    setOpen(next);
    onOpenChange.current?.(next);
    if (!next && restoreFocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el || !trigger.current) return;
    const at = trigger.current.getBoundingClientRect();
    const gap = 6;
    const margin = 12;
    const below = window.innerHeight - at.bottom - gap - margin;
    const above = at.top - gap - margin;
    const up = el.scrollHeight > below && above > below;
    setSide(up ? 'top' : 'bottom');
    el.style.maxHeight = `${Math.max(120, up ? above : below)}px`;
    el.style.right = `${Math.max(margin, window.innerWidth - at.right)}px`;
    if (up) el.style.bottom = `${window.innerHeight - at.top + gap}px`;
    else el.style.top = `${at.bottom + gap}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !pop.current?.contains(target)) setShown(false);
    };
    // The list stays where it was drawn: close it when the page scrolls or resizes under it.
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) setShown(false);
    };
    const onResize = () => setShown(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(pop.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter(
      (b) => !b.disabled,
    );
    const at = buttons.findIndex((b) => b === document.activeElement);
    const move = (to: number) => {
      e.preventDefault();
      buttons[(to + buttons.length) % buttons.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(buttons.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setShown(false, true);
    } else if (e.key === 'Tab') setShown(false);
  };

  return (
    <div className="menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="icon-button btn-sm"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="More actions"
        onClick={() => setShown(!open)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div className="menu-layer">
            <div
              ref={pop}
              id={menuId}
              className="menu-pop"
              role="menu"
              aria-label={props.label}
              data-side={side}
              onKeyDown={onKeyDown}
            >
              {props.items.map((item, i) => {
                if (item === 'separator')
                  return <div key={i} className="menu-sep" role="separator" />;
                if ('heading' in item)
                  return (
                    <div key={i} className="menu-label" role="presentation">
                      {item.heading}
                    </div>
                  );
                const Icon = item.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    className={item.danger ? 'menu-item danger' : 'menu-item'}
                    disabled={item.disabled}
                    title={item.hint}
                    onClick={() => {
                      setShown(false, true);
                      item.onSelect();
                    }}
                  >
                    {Icon && <Icon size={16} aria-hidden="true" />}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
