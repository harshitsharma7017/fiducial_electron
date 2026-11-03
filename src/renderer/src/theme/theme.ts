// Theme preference: light, dark or follow the system. The choice is kept in this window's local
// storage only (no IPC, no database) and applied as data attributes on <html>, where the design
// tokens in styles/tokens.css pick it up. initTheme() runs before the first React render so the
// first painted frame already has the right colours.
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'fqf.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const TRANSITION_MS = 320;

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStored(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (isPreference(value)) return value;
  } catch {
    // Storage can be unavailable; fall back to the system setting.
  }
  return 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

let preference: ThemePreference = 'system';
let resolved: ResolvedTheme = 'light';
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function apply(animate: boolean): void {
  const root = document.documentElement;
  resolved = resolve(preference);
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-transition');
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS);
  }
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
}

/** Applies the saved preference and follows the system setting. Call once, before rendering. */
export function initTheme(): void {
  preference = readStored();
  apply(false);
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (preference !== 'system') return;
    apply(true);
    notify();
  });
}

export function setThemePreference(next: ThemePreference): void {
  if (next === preference) return;
  preference = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still applies for this session.
  }
  apply(true);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme } {
  const currentPreference = useSyncExternalStore(subscribe, () => preference);
  const currentResolved = useSyncExternalStore(subscribe, () => resolved);
  return { preference: currentPreference, resolved: currentResolved };
}
