// Presentation helpers shared by the dashboard and the insurer cards: a monogram tile for each
// insurer, and one place that decides how a portal's connection is described.
import type { InsurerPortalView } from '../../../shared/ipc/contract';

export type StatusTone = 'success' | 'info' | 'neutral';

export interface PortalStatus {
  tone: StatusTone;
  label: string;
}

export function portalStatus(portal: InsurerPortalView): PortalStatus {
  if (portal.sessionEndsAt) return { tone: 'success', label: 'Signed in' };
  if (portal.windowOpen) return { tone: 'info', label: 'Portal open' };
  return { tone: 'neutral', label: 'Not connected' };
}

/** Time a session ends, with "tomorrow" when it is not today. */
export function endTime(iso: string): string {
  const end = new Date(iso);
  const sameDay = end.toDateString() === new Date().toDateString();
  const time = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${time} tomorrow`;
}

const TONES = 6;

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name.slice(0, 2)];
  return letters.join('').toUpperCase();
}

/** Same insurer, same colour: derived from the name so it is stable between runs. */
function toneFor(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash % TONES;
}

export function InsurerAvatar(props: { name: string }): React.JSX.Element {
  return (
    <span className={`avatar avatar-tone-${toneFor(props.name)}`} aria-hidden="true">
      {initials(props.name)}
    </span>
  );
}

export function StatusBadge(props: { status: PortalStatus }): React.JSX.Element {
  return (
    <span className={`status status-${props.status.tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {props.status.label}
    </span>
  );
}
