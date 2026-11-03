// Theme menu for the top bar: Light, Dark or System. A small popover with radio items, keyboard
// operable (arrow keys, Home/End, Escape) and closed by clicking elsewhere.
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { setThemePreference, useTheme, type ThemePreference } from './theme';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeSwitcher(): React.JSX.Element {
  const { preference, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const selected = Math.max(
      0,
      OPTIONS.findIndex((o) => o.value === preference),
    );
    itemRefs.current[selected]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // Only re-run when the menu opens; choosing an item closes it.
  }, [open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const items = itemRefs.current;
    const index = items.findIndex((el) => el === document.activeElement);
    const move = (to: number) => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') setOpen(false);
  };

  const CurrentIcon = resolved === 'dark' ? Moon : Sun;

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Theme: ${OPTIONS.find((o) => o.value === preference)?.label ?? 'System'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <CurrentIcon size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          className="popover"
          role="menu"
          aria-label="Theme"
          onKeyDown={onMenuKeyDown}
        >
          {OPTIONS.map(({ value, label, icon: Icon }, i) => (
            <button
              key={value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={preference === value}
              className="popover-item"
              onClick={() => {
                setThemePreference(value);
                close(true);
              }}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
              {preference === value && <Check size={15} className="popover-check" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
