// The page every client list uses (health, travel, rural, marine, property clients, vehicles):
// header with Add and Import, search and filters, a grid of record cards, and empty and loading
// states. Each card has one primary action (Quote) and the rest in its "more" menu. The page owns
// no data: the screen passes its records, already mapped to cards.
import { CalendarClock, Plus, Search, SearchX, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { ImportKind } from '../../../shared/import/import-kinds';
import { ImportButton } from '../import/ImportDialog';
import { ActionMenu, type MenuEntry } from './Menu';
import { EmptyState, PageHeader, SkeletonCards } from './PageHeader';
import { relativeTime } from './format';
import { useIntent } from './intents';

export type Tone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

export interface RecordItem {
  id: string;
  title: string;
  /** The record's kind, under its name ("Health client · individual"). */
  subtitle: string;
  icon: LucideIcon;
  /** Hue of the icon tile (0–5), so different kinds read apart at a glance. */
  hue?: number;
  meta: { icon: LucideIcon; text: string }[];
  badge?: { label: string; tone: Tone };
  updatedAt?: string;
  primary?: { label: string; icon?: LucideIcon; onClick: () => void; disabled?: boolean };
  menu: MenuEntry[];
  /** Text the search matches (name, pincode, kind...). */
  search: string;
}

export interface RecordFilter {
  id: string;
  label: string;
  test: (id: string) => boolean;
}

export function RecordPage(props: {
  /** The screen's id, for requests from other screens (Overview's quick actions). */
  view: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  noun: { one: string; many: string };
  addLabel?: string;
  onAdd?: () => void;
  importKind?: ImportKind;
  onImported?: () => void;
  /** null while loading. */
  items: RecordItem[] | null;
  filters?: RecordFilter[];
  empty: { icon: LucideIcon; title: string; text: string };
  /** Errors and notices, shown under the header. */
  alerts?: ReactNode;
  /** The list could not be loaded (the alerts say why): no loading placeholder. */
  failed?: boolean;
  /** Dialogs and drawers (forms, quote workspace, confirmations). */
  children?: ReactNode;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [importRequest, setImportRequest] = useState(0);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  useIntent(props.view, {
    ...(props.onAdd ? { add: props.onAdd } : {}),
    ...(props.importKind ? { import: () => setImportRequest((n) => n + 1) } : {}),
  });

  const all = props.items;
  const active = props.filters?.find((f) => f.id === filter);
  const shown = useMemo(() => {
    if (!all) return null;
    const q = query.trim().toLowerCase();
    return all.filter(
      (item) => (!active || active.test(item.id)) && (!q || item.search.toLowerCase().includes(q)),
    );
  }, [all, query, active]);

  const add = props.onAdd && props.addLabel && (
    <button type="button" className="primary" onClick={props.onAdd}>
      <Plus size={16} aria-hidden="true" />
      {props.addLabel}
    </button>
  );
  const importButton = props.importKind && (
    <ImportButton
      kind={props.importKind}
      openRequest={importRequest}
      onImported={() => props.onImported?.()}
    />
  );

  return (
    <section aria-label={props.title}>
      <PageHeader
        icon={props.icon}
        title={props.title}
        subtitle={props.subtitle}
        actions={
          all && (
            <>
              {importButton}
              {add}
            </>
          )
        }
      />
      {props.alerts}
      {all && all.length > 0 && (
        <div className="toolbar">
          <label className="search-field">
            <span className="visually-hidden">Search {props.noun.many}</span>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={`Search ${props.noun.many}…`}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {props.filters && props.filters.length > 0 && (
            <div className="chips" role="group" aria-label="Filter">
              {[{ id: 'all', label: 'All', test: () => true }, ...props.filters].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="chip"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="chip-count">{all.filter((i) => f.test(i.id)).length}</span>
                </button>
              ))}
            </div>
          )}
          <span className="toolbar-count" aria-live="polite">
            {shown?.length === all.length
              ? `${all.length} ${all.length === 1 ? props.noun.one : props.noun.many}`
              : `${shown?.length ?? 0} of ${all.length}`}
          </span>
        </div>
      )}
      {!shown && !props.failed && <SkeletonCards />}
      {all && all.length === 0 && (
        <EmptyState
          icon={props.empty.icon}
          title={props.empty.title}
          text={props.empty.text}
          actions={
            <>
              {importButton}
              {add}
            </>
          }
        />
      )}
      {shown && all && all.length > 0 && shown.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={`No ${props.noun.many} match`}
          text="Try another name or pincode, or clear the filter."
          actions={
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Clear search
            </button>
          }
        />
      )}
      {shown && shown.length > 0 && (
        <ul className="record-grid">
          {shown.map((item) => (
            <RecordCard
              key={item.id}
              item={item}
              menuOpen={menuOpen === item.id}
              onMenuOpenChange={(open) => setMenuOpen(open ? item.id : null)}
            />
          ))}
        </ul>
      )}
      {props.children}
    </section>
  );
}

function RecordCard(props: {
  item: RecordItem;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const { item } = props;
  const Icon = item.icon;
  const PrimaryIcon = item.primary?.icon;
  return (
    <li className="record-card" data-menu-open={props.menuOpen}>
      <div className="record-head">
        <span className={`record-icon avatar-tone-${item.hue ?? 0}`} aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="record-title">
          <strong title={item.title}>{item.title}</strong>
          <span>{item.subtitle}</span>
        </div>
        {item.badge && <span className={`badge badge-${item.badge.tone}`}>{item.badge.label}</span>}
      </div>
      <ul className="record-meta">
        {item.meta.map(({ icon: MetaIcon, text }) => (
          <li key={text}>
            <MetaIcon size={14} aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
      <div className="record-foot">
        <span className="record-updated">
          {item.updatedAt && (
            <>
              <CalendarClock size={12} aria-hidden="true" /> Updated {relativeTime(item.updatedAt)}
            </>
          )}
        </span>
        {item.primary && (
          <button
            type="button"
            className="primary btn-sm"
            disabled={item.primary.disabled}
            onClick={item.primary.onClick}
          >
            {PrimaryIcon && <PrimaryIcon size={14} aria-hidden="true" />}
            {item.primary.label}
          </button>
        )}
        <ActionMenu
          label={`Actions for ${item.title}`}
          items={item.menu}
          onOpenChange={props.onMenuOpenChange}
        />
      </div>
    </li>
  );
}
