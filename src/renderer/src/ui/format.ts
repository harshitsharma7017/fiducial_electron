// Dates as the screens show them.

/** "4 Nov 2026". */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "5 days ago", then the date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return shortDate(iso);
}

/** "1 member", "3 members". */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;
