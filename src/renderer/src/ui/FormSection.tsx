// Form building blocks (the client form's redesign, 26 November 2026): a section card with a title,
// an optional description and actions, and a responsive grid for its fields. Fields stay plain
// <label> elements holding their caption and control; a field that needs the whole row takes the
// class "span-full".
import type { ReactNode } from 'react';

export function FormSection(props: {
  title: string;
  description?: ReactNode;
  /** Buttons or a switch at the right of the section's heading. */
  actions?: ReactNode;
  children?: ReactNode;
  /** A quieter section (no card), for a short group inside another. */
  plain?: boolean;
}): React.JSX.Element {
  return (
    <section className={props.plain ? 'form-section plain' : 'form-section'}>
      <header className="form-section-head">
        <div>
          <h3>{props.title}</h3>
          {props.description && <p>{props.description}</p>}
        </div>
        {props.actions && <div className="form-section-actions">{props.actions}</div>}
      </header>
      {props.children}
    </section>
  );
}

/** Fields side by side: up to `columns` on a wide screen, one on a narrow one. */
export function FormGrid(props: { columns?: 2 | 3 | 4; children: ReactNode }): React.JSX.Element {
  return <div className={`form-cols form-cols-${props.columns ?? 2}`}>{props.children}</div>;
}

/** A caption's "Optional" mark. */
export function Optional(): React.JSX.Element {
  return <span className="field-optional">Optional</span>;
}
