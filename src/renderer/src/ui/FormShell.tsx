// The frame of a client's form (health, travel, vehicle: request of 27 November 2026, "it should
// be same like health clients"): numbered tabs fixed at the top, one scrolling area, and Cancel
// and Save fixed at the bottom with the save's problem beside them. Used inside a Modal with
// size="xl" and fill.
import { useEffect, useRef, type ReactNode } from 'react';

export interface FormTab<T extends string> {
  id: T;
  title: string;
  /** A line under the title (what the tab holds). */
  hint?: string;
}

export function FormShell<T extends string>(props: {
  /** The tabs' accessible name ("Client details"). */
  label: string;
  tabs: readonly FormTab<T>[];
  tab: T;
  onTab: (tab: T) => void;
  /** A change of it brings the scrolling area back to the top (the tab, or an insurer chosen). */
  scrollKey?: string;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  busy: boolean;
  saveLabel: string;
  error: string | null;
  children: ReactNode;
}): React.JSX.Element {
  const body = useRef<HTMLDivElement>(null);
  const scrollKey = props.scrollKey ?? props.tab;
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [scrollKey]);
  return (
    <form className="client-form cf" onSubmit={props.onSubmit}>
      <div className="cf-tabs" role="tablist" aria-label={props.label}>
        {props.tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={props.tab === t.id}
            onClick={() => props.onTab(t.id)}
          >
            <span className="cf-tab-step" aria-hidden="true">
              {i + 1}
            </span>
            <span className="cf-tab-text">
              {t.title}
              {t.hint && <small>{t.hint}</small>}
            </span>
          </button>
        ))}
      </div>
      <div className="cf-body" ref={body}>
        {props.children}
      </div>
      <footer className="cf-footer">
        <div className="cf-footer-status">
          {props.error ? (
            <p className="error" role="alert">
              {props.error}
            </p>
          ) : (
            <p className="muted">Stored encrypted on this computer.</p>
          )}
        </div>
        <div className="cf-footer-actions">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={props.busy}>
            {props.busy ? 'Saving…' : props.saveLabel}
          </button>
        </div>
      </footer>
    </form>
  );
}
