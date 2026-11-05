// A page's title block: icon, title, a short subtitle, and the page's actions on the right.
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader(props: {
  icon?: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}): React.JSX.Element {
  const Icon = props.icon;
  return (
    <header className="page-header">
      <div className="page-header-main">
        {Icon && (
          <span className="page-header-icon" aria-hidden="true">
            <Icon size={20} />
          </span>
        )}
        <div>
          <h1>{props.title}</h1>
          {props.subtitle && <p>{props.subtitle}</p>}
        </div>
      </div>
      {props.actions && <div className="page-header-actions">{props.actions}</div>}
    </header>
  );
}

export function EmptyState(props: {
  icon: LucideIcon;
  title: string;
  text: string;
  actions?: ReactNode;
}): React.JSX.Element {
  const Icon = props.icon;
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <h3>{props.title}</h3>
      <p>{props.text}</p>
      {props.actions && <div className="page-header-actions">{props.actions}</div>}
    </div>
  );
}

/** Placeholder cards while a list loads. */
export function SkeletonCards(props: { count?: number }): React.JSX.Element {
  return (
    <ul className="record-grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: props.count ?? 6 }, (_, i) => (
        <li key={i} className="skeleton-card">
          <div className="skeleton-head">
            <span className="skeleton skeleton-icon" />
            <div className="skeleton-lines">
              <span className="skeleton skeleton-line-lg" />
              <span className="skeleton skeleton-line-sm" />
            </div>
          </div>
          <span className="skeleton skeleton-line-md" />
          <span className="skeleton skeleton-bar" />
        </li>
      ))}
    </ul>
  );
}
