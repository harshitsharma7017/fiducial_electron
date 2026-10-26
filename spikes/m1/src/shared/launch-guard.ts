// Startup guard (DM-04): refuse to run when launched with switches that would expose a
// debugger or inspector. Pure function so it can be unit-tested without Electron.

/** Chromium and Node switches that open a debugging endpoint or change the JS engine. */
export const UNSAFE_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'remote-allow-origins',
  'inspect',
  'inspect-brk',
  'inspect-port',
  'inspect-publish-uid',
  'js-flags',
] as const;

/** NODE_OPTIONS entries that start an inspector. */
const UNSAFE_NODE_OPTIONS = /(^|\s)--(inspect|inspect-brk|inspect-port|inspect-publish-uid)\b/;

function switchName(arg: string, platform: NodeJS.Platform): string | null {
  // Chromium accepts "--name", "-name" and, on Windows, "/name"; names are case-insensitive there.
  const match = /^(?:--?|\/)([A-Za-z][A-Za-z0-9-]*)(?:=.*)?$/.exec(arg);
  if (!match?.[1]) return null;
  if (arg.startsWith('/') && platform !== 'win32') return null;
  return platform === 'win32' ? match[1].toLowerCase() : match[1];
}

/**
 * Returns the names of unsafe launch options found in argv or the environment.
 * Values are never returned, so the result is safe to log.
 */
export function findUnsafeLaunchOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): string[] {
  const found = new Set<string>();
  for (const arg of argv) {
    const name = switchName(arg, platform);
    if (name && (UNSAFE_SWITCHES as readonly string[]).includes(name)) found.add(`--${name}`);
  }
  const nodeOptions = env['NODE_OPTIONS'];
  if (nodeOptions && UNSAFE_NODE_OPTIONS.test(nodeOptions)) found.add('NODE_OPTIONS(--inspect*)');
  return [...found];
}
