// Sanitises one exception message for the public CI job summary of the M1 Windows evidence run.
// Conservative by design: anything that might identify the machine or the user, or reveal a
// secret, is removed, even at the cost of diagnostic detail. Pure apart from reading the
// default context, so it can be unit-tested with synthetic values.
import { homedir, hostname, tmpdir, userInfo } from 'node:os';
import { SPIKE_ROOT } from './launch.mjs';

export const MAX_EXCEPTION_CHARS = 300;
export const NO_MESSAGE = 'unavailable (no message recorded)';
export const SANITISER_FAILED = 'unavailable (message could not be sanitised)';

/** Longer input is cut before any processing, which also bounds the regex work. */
const MAX_INPUT_CHARS = 4000;

// Internal markers for the known roots, built from a private-use character. Every private-use
// character in the input is replaced first, so a marker can never come from the message.
const ROOT_MARK = { spike: '\uE000S\uE000', tmp: '\uE000T\uE000', home: '\uE000H\uE000' };
const ROOT_LABEL = { S: 'spike', T: 'tmp', H: 'home' };

/**
 * Where a path begins: a `file:` URL; a known-root marker; a drive letter (`C:\`, `C:/`); a
 * `\\?\` or `\\.\` device prefix; a UNC share (`\\server`); the home shorthand (`~\`, `~/`);
 * an environment variable used as a path prefix (`%APPDATA%\`, `$env:X\`, `${X}/`, `$X/`); or
 * an absolute POSIX path with at least two components.
 */
const PATH_START =
  /file:\/\/|\uE000[STH]\uE000|(?<![A-Za-z0-9])[A-Za-z]:[\\/]|[\\/]{2}[?.][\\/](?:[A-Za-z]:[\\/])?|(?<![\\/])\\\\(?=[^\\\s])|(?<![\w.~-])~[\\/]|(?:%[A-Za-z_]\w*%|\$env:[A-Za-z_]\w*|\$\{[A-Za-z_]\w*\}|\$[A-Za-z_]\w*)[\\/]|(?<=^|[\s'"`(=,;:[{])\/[^\s/'"`<>|]+\//g;

/** Characters that cannot occur in a Windows path end an unquoted path. A `file:` URL may
 * contain `:` (`file:///C:/…`) but no spaces, so it ends at whitespace instead. */
const UNQUOTED_STOP = /["'`<>|*?:]/;
const UNQUOTED_URL_STOP = /["'`<>|\s]/;

/** A file name kept for paths inside the spike workspace only (letters, digits, `._ -`). */
const SAFE_NAME = /^[A-Za-z0-9._ -]{1,64}$/;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The context used in CI: this machine's roots, host and user names, and environment. */
export function defaultSanitiseContext() {
  let user = '';
  try {
    user = userInfo().username;
  } catch {
    // No user name available; there is nothing to redact for it.
  }
  return {
    roots: { spike: SPIKE_ROOT, tmp: tmpdir(), home: homedir() },
    names: [hostname(), user],
    env: process.env,
  };
}

/** Replaces each known root (any case, either slash style) with its internal marker. */
function markRoots(text, roots) {
  const entries = Object.entries(roots)
    .filter(([kind, root]) => kind in ROOT_MARK && typeof root === 'string')
    .map(([kind, root]) => [kind, root.replace(/[\\/]+$/, '')])
    .filter(([, root]) => root.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  let out = text;
  for (const [kind, root] of entries) {
    const pattern = root
      .split(/[\\/]+/)
      .map(escapeRegExp)
      .join('[\\\\/]+');
    // The root must end at a separator or a delimiter, so `C:\Users\ann` never matches the
    // start of `C:\Users\anna`.
    const re = new RegExp(`${pattern}(?=$|[\\\\/'"\`\\s<>|:*?,;)\\]])`, 'gi');
    out = out.replace(re, ROOT_MARK[kind]);
  }
  return out;
}

/** A closing quote must be followed by the end of the text, a space or punctuation, so a
 * quote inside a path (`C:\Users\O'Brien\x`) does not end it early. */
const QUOTE_CLOSE_FOLLOW = /^(?:$|[\s,;:.)\]}>-])/;

/** End of the path that starts at `start`: the closing quote, or for unquoted text the next
 * character that cannot be in a path, the next path, or the end of the text. */
function pathEnd(text, start, afterStart) {
  const before = start > 0 ? text[start - 1] : '';
  if (before === "'" || before === '"' || before === '`') {
    for (let close = text.indexOf(before, afterStart); close !== -1;) {
      if (QUOTE_CLOSE_FOLLOW.test(text.slice(close + 1))) return close;
      close = text.indexOf(before, close + 1);
    }
    return text.length;
  }
  const isUrl = text.startsWith('file:', start);
  let end = text.length;
  const stop = text.slice(afterStart).search(isUrl ? UNQUOTED_URL_STOP : UNQUOTED_STOP);
  if (stop !== -1) end = afterStart + stop;
  // A URL is one path even if it contains a drive letter or a root.
  if (isUrl) return end;
  PATH_START.lastIndex = afterStart;
  const next = PATH_START.exec(text);
  if (next && next.index < end) end = next.index;
  return end;
}

/** Placeholder for one path. Only a file inside the spike workspace keeps its name. */
function placeholder(kind, rest) {
  if (kind === 'tmp') return '<tmp-path>';
  if (kind === 'home') return '<home-path>';
  if (kind !== 'spike') return '<path>';
  const parts = rest.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return '<spike>';
  // The name gets the same token redaction as the rest of the message.
  const name = SAFE_NAME.test(parts[parts.length - 1]) ? redactTokens(parts[parts.length - 1]) : '';
  if (name === '') return '<spike>/…';
  return parts.length > 1 ? `<spike>/…/${name}` : `<spike>/${name}`;
}

/** Replaces every path with a placeholder, keeping the whitespace that follows it. */
function redactPaths(text) {
  let out = '';
  let pos = 0;
  PATH_START.lastIndex = 0;
  for (;;) {
    PATH_START.lastIndex = pos;
    const m = PATH_START.exec(text);
    if (!m) break;
    const start = m.index;
    const afterStart = start + m[0].length;
    const end = pathEnd(text, start, afterStart);
    const segment = text.slice(start, end);
    const trailing = /\s*$/.exec(segment)?.[0] ?? '';
    const mark = /^\uE000([STH])\uE000/.exec(m[0]);
    const kind = mark ? ROOT_LABEL[mark[1]] : m[0].startsWith('~') ? 'home' : 'path';
    const rest = segment.slice(m[0].length, segment.length - trailing.length);
    out += text.slice(pos, start) + placeholder(kind, rest) + trailing;
    pos = Math.max(end, afterStart);
  }
  return out + text.slice(pos);
}

/** Redacts each name, ignoring case; names of one or two characters only as whole words. */
function redactNames(text, names) {
  let out = text;
  for (const name of names) {
    if (typeof name !== 'string' || name.trim() === '') continue;
    const re =
      name.length >= 3
        ? new RegExp(escapeRegExp(name), 'gi')
        : new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9])`, 'gi');
    out = out.replace(re, '<name>');
  }
  return out;
}

/**
 * Long runs kept because they are identifiers, not data: error codes with a known prefix
 * (SQLite, Node and the spike's own vault and store codes, such as `SQLITE_CANTOPEN`,
 * `ERR_DLOPEN_FAILED`, `NODE_MODULE_VERSION`, `KEY_UNWRAP_FAILED`), and a fixed list of
 * names. Everything else of 16 or more base64 characters is redacted, including any file or
 * module name not on the list. The prefix list keeps random upper-case runs from passing as
 * codes.
 */
const ERROR_CODE_RUN =
  /^(?:SQLITE|ERR|NODE|KEY|KEYRING|SECRET|ENVELOPE|STORAGE|INVALID|VALIDATION|FORBIDDEN|RESET)(?:_[A-Z]{2,})+$/;
const KNOWN_IDENTIFIERS = new Set([
  'better-sqlite3-multiple-ciphers',
  'decryptStringAsync',
  'encryptStringAsync',
  'fqf-spike-m1-packaged',
  'getSelectedStorageBackend',
  'isAsyncEncryptionAvailable',
  'isEncryptionAvailable',
  'SQLite3MultipleCiphers',
]);

/** Redacts runs that may be key material, ciphertext, fingerprints or check values:
 * - any base64 or base64url run of 16 or more characters that is not an identifier (above);
 * - any standard-base64 run of 8 or more characters ending in `=` padding;
 * - then any hexadecimal run of 12 or more characters.
 * Base64 goes first so that a hex sub-run cannot split a token into surviving pieces. */
function redactTokens(text) {
  return text
    .replace(/[A-Za-z0-9+/_-]{16,}={0,2}/g, (run) =>
      ERROR_CODE_RUN.test(run) || KNOWN_IDENTIFIERS.has(run) ? run : '<redacted>',
    )
    .replace(/(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/]{8,}={1,2}(?![A-Za-z0-9+/_=-])/g, '<redacted>')
    .replace(/[0-9A-Fa-f]{12,}/g, '<redacted-hex>');
}

/** Node's `JSON.parse` errors quote the start of the input (`Unexpected token 'v', "v10…"…
 * is not valid JSON`, or `"undefined" is not valid JSON`), which may be file content. Both
 * the token and the quoted slice are removed: everything from the first quote of the line
 * up to ` is not valid JSON`. */
function redactJsonSnippet(text) {
  const end = text.indexOf(' is not valid JSON');
  if (end === -1) return text;
  const head = text.slice(0, end).replace(/Unexpected token .*$/, 'Unexpected token <redacted>');
  const quote = head.search(/["']/);
  const kept = quote === -1 ? head : `${head.slice(0, quote)}"<redacted>"`;
  return kept + text.slice(end);
}

/** E-mail addresses, which may be account names. */
function redactEmails(text) {
  return text.replace(/[^\s@'"`<>()[\]{},;:]+@[^\s@'"`<>()[\]{},;:]+\.[A-Za-z]{2,}/g, '<email>');
}

/** Cuts to `max` UTF-16 units including the ellipsis, without splitting a surrogate pair. */
function truncate(text, max) {
  if (text.length <= max) return text;
  let cut = max - 1;
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return `${text.slice(0, cut)}…`;
}

/**
 * The spike's own exception message from a failed check (`src/main/index.ts` records
 * `err.message` only, never a stack), reduced to a safe one-line summary:
 * 1. first line only; control characters become spaces; a `JSON.parse` input slice is removed;
 * 2. every path becomes a placeholder: `<tmp-path>`, `<home-path>` or `<path>`, whole,
 *    including paths with spaces, quoted or not. A path inside the spike workspace becomes
 *    `<spike>/…/name`, keeping only a plain file name;
 * 3. environment-variable references and values, e-mail addresses, the host name and the
 *    user name are removed;
 * 4. key-like hexadecimal and base64 runs are removed; known identifier shapes are kept.
 * Returns at most MAX_EXCEPTION_CHARS characters, and never throws.
 */
export function sanitiseException(value, context = defaultSanitiseContext()) {
  if (typeof value !== 'string' || value.trim() === '') return NO_MESSAGE;
  try {
    const firstLine = value.slice(0, MAX_INPUT_CHARS).split(/\r\n|[\r\n\u2028\u2029]/, 1)[0];
    // Control characters and private-use characters (the marker alphabet) become spaces.
    let text = [...firstLine]
      .map((ch) => {
        const code = ch.charCodeAt(0);
        const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
        return control || (code >= 0xe000 && code <= 0xf8ff) ? ' ' : ch;
      })
      .join('');
    text = redactJsonSnippet(text);
    text = redactPaths(markRoots(text, context.roots ?? {}));
    // Defensive: no root marker may survive, whatever the path rules did.
    text = text.replace(/\uE000[STH]\uE000/g, '<path>');
    text = text.replace(
      /%[A-Za-z_]\w*%|\$env:[A-Za-z_]\w*|\$\{[A-Za-z_]\w*\}|\$[A-Za-z_]\w*/gi,
      '<env>',
    );
    const envValues = Object.values(context.env ?? {})
      .filter((v) => typeof v === 'string' && v.length >= 8)
      .sort((a, b) => b.length - a.length);
    for (const v of envValues) text = text.split(v).join('<env>');
    text = redactNames(redactEmails(text), context.names ?? []);
    text = redactTokens(text).replace(/`/g, "'").replace(/\s+/g, ' ').trim();
    if (text === '') return NO_MESSAGE;
    return truncate(text, MAX_EXCEPTION_CHARS);
  } catch {
    // Publish nothing rather than risk an unsanitised message.
    return SANITISER_FAILED;
  }
}
