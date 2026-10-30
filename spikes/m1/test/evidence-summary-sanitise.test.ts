// Sanitising exception messages for the public job summary of the M1 Windows evidence run.
// Every input is synthetic: invented user, host and folder names, and key-like values made at
// run time with randomBytes. No real credentials, runner secrets or insurer data.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SPIKE_ROOT } from '../scripts/lib/launch.mjs';
import {
  MAX_EXCEPTION_CHARS,
  NO_MESSAGE,
  SANITISER_FAILED,
  type SanitiseContext,
  defaultSanitiseContext,
  sanitiseException,
} from '../scripts/lib/sanitise-exception.mjs';

/** A GitHub-hosted Windows runner, with invented names. */
const WIN: SanitiseContext = {
  roots: {
    spike: 'D:\\a\\demo-repo\\demo-repo\\spikes\\m1',
    tmp: 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp',
    home: 'C:\\Users\\runneradmin',
  },
  names: ['fv-az000-111', 'runneradmin'],
  env: {
    DEMO_SETTING: 'demo-env-value-0000',
    COMPUTERNAME: 'FV-AZ000-111',
    USERPROFILE: 'C:\\Users\\runneradmin',
  },
};

/** A POSIX machine, with invented names. */
const POSIX: SanitiseContext = {
  roots: { spike: '/home/demo-user/work/spikes/m1', tmp: '/tmp', home: '/home/demo-user' },
  names: ['demo-host', 'demo-user'],
  env: {},
};

/** None of the fragments may survive, in any case. */
function expectNone(output: string, fragments: readonly string[]): void {
  for (const fragment of fragments)
    expect(output.toLowerCase()).not.toContain(fragment.toLowerCase());
}

describe('sanitiseException: Windows paths', () => {
  it('redacts a whole path that contains spaces', () => {
    const out = sanitiseException(
      "EPERM: operation not permitted, open 'C:\\Program Files\\Demo Vendor\\data\\demo-secret.db'",
      WIN,
    );
    expect(out).toBe("EPERM: operation not permitted, open '<path>'");
    expectNone(out, ['Program', 'Files', 'Demo Vendor', 'data\\', 'demo-secret']);
  });

  it('redacts a user folder whose name contains a space', () => {
    const out = sanitiseException(
      "EBUSY: resource busy or locked, open 'C:\\Users\\Zyxa Q Qorvath\\AppData\\Roaming\\fqf\\Cookies'",
      WIN,
    );
    expect(out).toBe("EBUSY: resource busy or locked, open '<path>'");
    expectNone(out, ['Users', 'Zyxa', 'Qorvath', 'AppData', 'Roaming', 'Cookies']);
  });

  it('redacts quoted paths to the closing quote and keeps the text around them', () => {
    expect(
      sanitiseException(
        'ENOENT: no such file, open "C:\\Users\\Zyxa Qorvath\\x y\\z.db" (read)',
        WIN,
      ),
    ).toBe('ENOENT: no such file, open "<path>" (read)');
    expect(sanitiseException('open `C:\\Users\\Zyxa Qorvath\\a.db` failed', WIN)).toBe(
      "open '<path>' failed",
    );
    // A quote inside the path does not end it early.
    const apostrophe = sanitiseException("EBUSY: open 'C:\\Users\\O'Brien Demo\\x.db'", WIN);
    expect(apostrophe).toBe("EBUSY: open '<path>'");
    expectNone(apostrophe, ['Brien', 'Demo', 'x.db']);
    expect(
      sanitiseException(
        "EPERM: rename 'C:\\Users\\Zyxa Qorvath\\a.tmp' -> 'C:\\Users\\Zyxa Qorvath\\a'",
        WIN,
      ),
    ).toBe("EPERM: rename '<path>' -> '<path>'");
  });

  it('redacts unquoted paths, spaces included, up to a character no path can contain', () => {
    const plain = sanitiseException(
      'failed to load C:\\Program Files\\Demo Vendor\\keys\\vault.key',
      WIN,
    );
    expect(plain).toBe('failed to load <path>');
    expectNone(plain, ['Program', 'Demo Vendor', 'keys', 'vault.key']);
    expect(
      sanitiseException(
        'Failed to load D:\\a\\_temp\\native\\addon.node: The specified module could not be found.',
        WIN,
      ),
    ).toBe('Failed to load <path>: The specified module could not be found.');
    const slashes = sanitiseException('open C:/Users/Zyxa Qorvath/AppData/x.db', WIN);
    expect(slashes).toBe('open <path>');
    expectNone(slashes, ['Zyxa', 'Qorvath', 'AppData']);
  });

  it('handles the runner home folder, temporary folder and workspace', () => {
    expect(
      sanitiseException('open "C:\\Users\\runneradmin\\AppData\\Local\\fqf\\Local State"', WIN),
    ).toBe('open "<home-path>"');
    expect(
      sanitiseException("open 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\fqf-1\\x.db'", WIN),
    ).toBe("open '<tmp-path>'");
    // The long form of the temporary folder is under the home folder.
    expect(
      sanitiseException("open 'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\fqf-1\\x.db'", WIN),
    ).toBe("open '<home-path>'");
    // Inside the workspace only a plain file name is kept; the folders are dropped.
    const cookies = sanitiseException(
      "EBUSY: resource busy or locked, open 'D:\\a\\demo-repo\\demo-repo\\spikes\\m1\\out\\runs\\dev\\user-data\\Network\\Cookies'",
      WIN,
    );
    expect(cookies).toBe("EBUSY: resource busy or locked, open '<spike>/…/Cookies'");
    expectNone(cookies, ['demo-repo', 'out\\runs', 'user-data', 'Network']);
    // Any case and either slash style still match the workspace.
    expect(
      sanitiseException(
        "open 'd:/A/Demo-Repo/demo-repo/spikes/m1/out/runs/dev/user-data/lockfile'",
        WIN,
      ),
    ).toBe("open '<spike>/…/lockfile'");
    // A folder next to the workspace is not inside it.
    expect(
      sanitiseException("open 'D:\\a\\demo-repo\\demo-repo\\spikes\\m1-other\\x.db'", WIN),
    ).toBe("open '<path>'");
    expect(sanitiseException("open 'D:\\a\\_temp\\demo\\x.db'", WIN)).toBe("open '<path>'");
    // A workspace file name that looks like data is redacted too.
    const token = randomBytes(16).toString('base64url');
    expect(
      sanitiseException(`open 'D:\\a\\demo-repo\\demo-repo\\spikes\\m1\\out\\${token}'`, WIN),
    ).toBe("open '<spike>/…/<redacted>'");
  });

  it('redacts UNC, device and file: URL paths', () => {
    expect(sanitiseException("open '\\\\demo-server\\Shared Data\\team\\x.txt'", WIN)).toBe(
      "open '<path>'",
    );
    expect(sanitiseException('open \\\\?\\C:\\Users\\Zyxa Qorvath\\long\\x.txt failed', WIN)).toBe(
      'open <path>',
    );
    const url = sanitiseException(
      'Cannot find module file:///C:/Users/Zyxa%20Qorvath/x/y.mjs',
      WIN,
    );
    expect(url).toBe('Cannot find module <path>');
    expectNone(url, ['Zyxa', 'Qorvath', 'y.mjs']);
  });
});

describe('sanitiseException: POSIX paths', () => {
  it('redacts home paths completely, including nested folders', () => {
    const home = sanitiseException(
      "ENOENT: no such file or directory, open '/home/demo-user/x/y/z.json'",
      POSIX,
    );
    expect(home).toBe("ENOENT: no such file or directory, open '<home-path>'");
    const tilde = sanitiseException('cannot open ~/x/y/z.json for reading', POSIX);
    expect(tilde).toBe('cannot open <home-path>');
    for (const out of [home, tilde]) expectNone(out, ['x/y', 'z.json', 'demo-user']);
  });

  it('redacts other absolute paths completely, including folders with spaces', () => {
    const quoted = sanitiseException(
      "ENOENT: open '/Users/Vrel Ostrand/Library/App Data/x.db'",
      POSIX,
    );
    expect(quoted).toBe("ENOENT: open '<path>'");
    const unquoted = sanitiseException('cannot open /Users/Vrel Ostrand/Library/x.db now', POSIX);
    expect(unquoted).toBe('cannot open <path>');
    for (const out of [quoted, unquoted]) expectNone(out, ['Vrel', 'Ostrand', 'Library', 'x.db']);
    expect(sanitiseException("open '/tmp/fqf-1/x.db'", POSIX)).toBe("open '<tmp-path>'");
  });
});

describe('sanitiseException: secrets and identity', () => {
  it('redacts key-like hex and base64 values in every format the spike uses', () => {
    const makers: Record<string, () => string> = {
      'raw key as hex': () => randomBytes(32).toString('hex'),
      'raw key as base64': () => randomBytes(32).toString('base64'),
      'S5 secret': () => randomBytes(32).toString('base64url'),
      'legacy secret': () => randomBytes(16).toString('base64url'),
      'vault secret': () => randomBytes(24).toString('base64url'),
      'unicode secret prefix': () => randomBytes(12).toString('base64url'),
      'short padded base64': () => randomBytes(7).toString('base64'),
      fingerprint: () => createHash('sha256').update(randomBytes(16)).digest('hex').slice(0, 16),
      'S3 marker suffix': () => randomBytes(8).toString('hex'),
      'random suffix': () => randomBytes(6).toString('hex'),
    };
    for (const [label, make] of Object.entries(makers)) {
      for (let i = 0; i < 300; i += 1) {
        const value = make();
        const out = sanitiseException(`check failed: value ${value} rejected`, WIN);
        expect(out, label).not.toContain(value);
        // A standard-base64 value can begin `/x/`, which reads as a path; it is then redacted
        // as one, together with the rest of the line.
        expect(out, label).toMatch(/^check failed: value (<redacted(-hex)?> rejected|<path>)$/);
      }
    }
    expect(sanitiseException(`marker FQF-S3-MARKER-${randomBytes(8).toString('hex')}`, WIN)).toBe(
      'marker <redacted>',
    );
  });

  it('keeps error codes and API names, which carry the diagnosis', () => {
    for (const text of [
      'SQLITE_NOTADB: file is not a database',
      'SQLITE_CANTOPEN: unable to open database file',
      'ERR_DLOPEN_FAILED; NODE_MODULE_VERSION 127',
      'KEY_UNWRAP_FAILED',
      'safeStorage.decryptStringAsync is not a function',
      'safeStorage.isAsyncEncryptionAvailable() returned false',
      'Cannot find module better-sqlite3-multiple-ciphers',
      'Error while decrypting the ciphertext provided to safeStorage.decryptString.',
    ]) {
      expect(sanitiseException(text, WIN)).toBe(text);
    }
  });

  it('redacts environment-variable references and values', () => {
    expect(
      sanitiseException('missing %APPDATA%, $env:USERPROFILE, ${HOME} and $DEMO_VAR', WIN),
    ).toBe('missing <env>, <env>, <env> and <env>');
    expect(sanitiseException('setting demo-env-value-0000 rejected', WIN)).toBe(
      'setting <env> rejected',
    );
    // An environment variable used as a path prefix makes the whole path a placeholder.
    const prefixed = sanitiseException('cannot read %APPDATA%\\fqf spike\\keys\\db.key.enc', WIN);
    expect(prefixed).toBe('cannot read <path>');
    expectNone(prefixed, ['APPDATA', 'fqf spike', 'db.key']);
  });

  it('redacts host and user names in any case, and e-mail addresses', () => {
    expect(sanitiseException('job on FV-AZ000-111 as RunnerAdmin failed', WIN)).not.toMatch(
      /fv-az000-111|runneradmin/i,
    );
    expect(sanitiseException('login failed for zyxa.qorvath@example.com', WIN)).toBe(
      'login failed for <email>',
    );
  });

  it('removes the input slice that a JSON.parse error quotes', () => {
    expect(
      sanitiseException('Unexpected token \'v\', "v10demo-file-content"... is not valid JSON', WIN),
    ).toBe('Unexpected token <redacted> is not valid JSON');
    expect(sanitiseException('"demo-file-content" is not valid JSON', WIN)).toBe(
      '"<redacted>" is not valid JSON',
    );
  });
});

describe('sanitiseException: shape and bounds', () => {
  it('keeps only the first line of a multiline exception with a stack trace', () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'marker')",
      '    at reopen (D:\\a\\demo-repo\\demo-repo\\spikes\\m1\\dist\\main\\spikes\\s3-sqlite.js:12:5)',
      '    at async main (file:///D:/a/demo-repo/demo-repo/spikes/m1/dist/main/index.js:90:3)',
    ];
    for (const newline of ['\n', '\r\n', '\r', '\u2028']) {
      const out = sanitiseException(stack.join(newline), WIN);
      expect(out).toBe("TypeError: Cannot read properties of undefined (reading 'marker')");
      expectNone(out, [' at ', 's3-sqlite', 'index.js', 'file:']);
    }
  });

  it('never returns more than the maximum length', () => {
    const long = sanitiseException('word '.repeat(2000), WIN);
    expect(long).toHaveLength(MAX_EXCEPTION_CHARS);
    expect(long.endsWith('…')).toBe(true);
    // A surrogate pair at the cut is not split (the emoji starts at index 298).
    const emoji = sanitiseException(`${'ab '.repeat(99)}c😀😀😀`, WIN);
    expect(emoji).toBe(`${'ab '.repeat(99)}c…`);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji)).toBe(false);
    expect(
      sanitiseException(`${'C:\\Demo Folder\\x '.repeat(2000)}`, WIN).length,
    ).toBeLessThanOrEqual(MAX_EXCEPTION_CHARS);
  });

  it('returns a fixed text for missing input, and never throws', () => {
    for (const value of [undefined, null, 42, {}, ['x'], '', '   ', '\n\n']) {
      expect(sanitiseException(value, WIN)).toBe(NO_MESSAGE);
    }
    const broken = {
      get roots(): SanitiseContext['roots'] {
        throw new Error('demo failure');
      },
      names: [],
      env: {},
    };
    expect(sanitiseException('EBUSY: open C:\\x', broken)).toBe(SANITISER_FAILED);
  });

  it('replaces control characters and backticks, so the summary markup cannot be broken', () => {
    // Internal root markers are built from U+E000; input that imitates one cannot pass as one.
    const out = sanitiseException('bell\u0007 tab\t `code` \uE000S\uE000\\x \u0001S\u0001', WIN);
    expect(out).toBe("bell tab 'code' S \\x S");
    const unsafe = [...out].filter((ch) => {
      const code = ch.charCodeAt(0);
      return code < 0x20 || code === 0x7f || ch === '`' || (code >= 0xe000 && code <= 0xf8ff);
    });
    expect(unsafe).toEqual([]);
  });

  it('uses this machine as the default context', () => {
    const ctx = defaultSanitiseContext();
    expect(ctx.roots.spike).toBe(SPIKE_ROOT);
    expect(typeof ctx.roots.tmp).toBe('string');
    expect(typeof ctx.roots.home).toBe('string');
    expect(sanitiseException(`open '${join(SPIKE_ROOT, 'out', 'runs', 'demo.json')}'`)).toBe(
      "open '<spike>/…/demo.json'",
    );
  });
});

describe('evidence summary with synthetic results (integration)', () => {
  // A copy of the summary script in a temporary folder, so its SPIKE_ROOT is that folder and
  // it never reads or rewrites this checkout's out/ evidence.
  const root = mkdtempSync(join(tmpdir(), 'fqf-summary-test-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('publishes sanitised messages for failed runner checks only and keeps every status', () => {
    mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
    for (const file of [
      'scripts/evidence-summary.mjs',
      'scripts/lib/launch.mjs',
      'scripts/lib/sanitise-exception.mjs',
    ]) {
      cpSync(join(SPIKE_ROOT, file), join(root, file));
    }
    // The workspace root as the copied script computes it: Node resolves symbolic links in
    // module URLs (on macOS the temporary folder is reached through /var -> /private/var).
    const copiedRoot = realpathSync(root);
    const write = (run: string, phase: string, result: object): void => {
      mkdirSync(join(root, 'out', 'runs', run), { recursive: true });
      writeFileSync(join(root, 'out', 'runs', run, `${phase}.json`), JSON.stringify(result));
    };
    const secret = randomBytes(32).toString('base64url');
    write('dev', 's3-reopen', {
      status: 'pass',
      checks: [{ id: 's3.reopen-read', pass: true, actual: 'DEMO-SENTINEL-REOPEN' }],
      facts: {
        nativeModules: [
          join(copiedRoot, 'node_modules', 'demo-native', 'demo_module.node'),
          'C:\\Users\\Zyxa Q Qorvath\\Kelmor Data\\demo_module.node',
        ],
      },
    });
    write('dev', 's3-create', {
      status: 'fail',
      checks: [
        {
          id: 'runner',
          pass: false,
          actual: `EBUSY: resource busy or locked, open 'C:\\Users\\Zyxa Q Qorvath\\Kelmor Data\\Veltrop\\Cookies' ${secret}\n    at create (C:\\Users\\Zyxa Q Qorvath\\x.js:1:1)`,
        },
      ],
    });
    write('dev', 's5-write', {
      status: 'fail',
      checks: [
        { id: 's5.no-plaintext-files', pass: false, actual: ['DEMO-SENTINEL-FAILED-VALUE'] },
        { id: 's5.round-trip', pass: true, actual: 'DEMO-SENTINEL-PASSED-VALUE' },
      ],
    });
    write('packaged', 's5-decrypt-foreign', {
      status: 'pass',
      checks: [{ id: 'runner', pass: true, actual: 'DEMO-SENTINEL-RUNNER-PASSED' }],
    });

    const env = { ...process.env };
    // Never append to a real job summary when this test itself runs in CI.
    delete env.GITHUB_STEP_SUMMARY;
    delete env.STEP_OUTCOMES;
    execFileSync(process.execPath, [join(root, 'scripts', 'evidence-summary.mjs')], {
      env,
      stdio: 'pipe',
      timeout: 60_000,
    });
    const summary = readFileSync(join(root, 'out', 'evidence', 'summary.md'), 'utf8');

    // Statuses and check IDs are reported exactly as recorded.
    expect(summary).toContain('| s3-create | **fail** | runner |  |');
    expect(summary).toContain('| s5-write | **fail** | s5.no-plaintext-files | s5.round-trip |');
    expect(summary).toContain('| s5-decrypt-foreign | **pass** | none | runner |');
    expect(summary).toContain('| s3-reopen | **pass** | none | s3.reopen-read |');
    // A native module inside the workspace keeps its relative path; any other path is redacted.
    expect(summary).toContain(
      `| dev s3-reopen | \`<spike>${sep}node_modules${sep}demo-native${sep}demo_module.node\` | file not found |`,
    );
    expect(summary).toContain('| dev s3-reopen | `<path>` | file not found |');
    // One exception line: the failed runner check, sanitised, first line only.
    const lines = summary.split('\n').filter((l) => /^- (dev|packaged) s\d-/.test(l));
    expect(lines).toEqual([
      "- dev s3-create: `EBUSY: resource busy or locked, open '<path>' <redacted>`",
    ]);
    // No other check value, path, name or secret reaches the summary.
    expectNone(summary, [
      'DEMO-SENTINEL',
      secret,
      'Zyxa',
      'Qorvath',
      'Kelmor',
      'Veltrop',
      'Cookies',
      'x.js',
      ' at create',
    ]);
  });
});

describe('evidence summary: plaintext-scan diagnostics (integration)', () => {
  const root = mkdtempSync(join(tmpdir(), 'fqf-summary-scan-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('publishes structured scan problems (kind, code, relative path, scan) and nothing else', () => {
    mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
    for (const file of [
      'scripts/evidence-summary.mjs',
      'scripts/lib/launch.mjs',
      'scripts/lib/sanitise-exception.mjs',
    ]) {
      cpSync(join(SPIKE_ROOT, file), join(root, file));
    }
    const runDir = (run: string) => join(root, 'out', 'runs', run);
    mkdirSync(runDir('dev'), { recursive: true });
    mkdirSync(runDir('packaged'), { recursive: true });
    const secret = randomBytes(32).toString('base64url');
    writeFileSync(
      join(runDir('dev'), 's5-write.json'),
      JSON.stringify({
        status: 'fail',
        checks: [
          {
            id: 's5.no-plaintext-files',
            pass: false,
            actual: [
              {
                kind: 'unreadable',
                file: 'user-data-session/GPUPersistentCache/cache.db',
                code: 'EBUSY',
                scan: 's5-write (in-app)',
              },
              { kind: 'match', file: 'logs/s5-write.log', code: null, scan: 's5-write (in-app)' },
              {
                kind: 'unreadable',
                file: 'C:\\Users\\Zyxa Q Qorvath\\Kelmor\\Cookies',
                code: 'EPERM',
                scan: 's5-write (in-app)',
              },
              'DEMO-SENTINEL-FREE-TEXT',
              { kind: 'other', file: 'DEMO-SENTINEL-OBJECT', value: secret },
            ],
          },
          { id: 's5.round-trip', pass: true, actual: [`DEMO-SENTINEL-PASSED ${secret}`] },
        ],
      }),
    );
    writeFileSync(
      join(runDir('dev'), 'post-exit-scan.json'),
      JSON.stringify({
        run: 'dev',
        status: 'fail',
        reason: '1 match(es), 1 unreadable file(s)',
        phasesWithDigests: ['s5-write'],
        digests: 3,
        filesScanned: 42,
        matches: [{ file: 'user-data-session/Preferences', phase: 's5-write', needleBytes: 32 }],
        unreadable: [{ file: 'user-data-session/LOCK', code: 'EBUSY' }],
      }),
    );

    const env = { ...process.env };
    delete env.GITHUB_STEP_SUMMARY;
    delete env.STEP_OUTCOMES;
    execFileSync(process.execPath, [join(root, 'scripts', 'evidence-summary.mjs')], {
      env,
      stdio: 'pipe',
      timeout: 60_000,
    });
    const summary = readFileSync(join(root, 'out', 'evidence', 'summary.md'), 'utf8');

    const lines = summary.split('\n').filter((l) => /^- (dev|packaged) s\d-/.test(l));
    expect(lines).toEqual([
      '- dev s5-write `s5.no-plaintext-files`: unreadable (EBUSY) in `user-data-session/GPUPersistentCache/cache.db` (scan: s5-write (in-app))',
      '- dev s5-write `s5.no-plaintext-files`: **plaintext match** in `logs/s5-write.log` (scan: s5-write (in-app))',
      '- dev s5-write `s5.no-plaintext-files`: unreadable (EPERM) in `<path>` (scan: s5-write (in-app))',
    ]);
    expect(summary).toContain('| dev | **fail** | 42 | 3 (s5-write) | 1 | 1 |');
    expect(summary).toContain('| packaged | not run / no result | — | — | — | — |');
    expect(summary).toContain(
      '- dev: **plaintext match** in `user-data-session/Preferences` (needle from s5-write, 32 bytes)',
    );
    expect(summary).toContain('- dev: unreadable (EBUSY) `user-data-session/LOCK`');
    expectNone(summary, ['DEMO-SENTINEL', secret, 'Zyxa', 'Qorvath', 'Kelmor', 'Cookies']);
  });
});
