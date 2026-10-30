// S5: OS-backed secret storage through Electron safeStorage (Keychain on macOS), using the
// asynchronous API. Phases: "write" (default), "read" (new process), "decrypt-foreign"
// (a different app identity tries to decrypt the development run's ciphertext) and
// "vault-foreign" (the same for the authenticated vault, Q-M1-01).
// Raw safeStorage is measured for the record; application secrets go through the vault.
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import { check, type Check } from '../../shared/result';
import { SecretStore } from '../../shared/secret-store';
import { tamperTrials } from '../../shared/tamper';
import { plaintextScan } from '../plaintext-scan';
import type { SpikeContext, SpikeOutcome } from '../spike-context';
import { withTimeout } from '../util';
import { vaultForeign, vaultRead, vaultWrite } from './s5-vault';

/** Short hash used to compare secrets across processes without recording them. */
function fingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

function secretFile(): string {
  return join(app.getPath('userData'), 'keys', 's5-secret.enc');
}

export function runS5(ctx: SpikeContext): Promise<SpikeOutcome> {
  switch (ctx.args.phase ?? 'write') {
    case 'read':
      return read(ctx);
    case 'decrypt-foreign':
      return decryptForeign(ctx);
    case 'vault-foreign':
      if (!ctx.args.foreign) throw new Error('--foreign=<vault dir> is required');
      return vaultForeign(ctx, ctx.args.foreign);
    default:
      return write(ctx);
  }
}

async function write(ctx: SpikeContext): Promise<SpikeOutcome> {
  const checks: Check[] = [];
  const preReadyAsync = await withTimeout(
    ctx.preReadyAsyncSafeStorage,
    5000,
    'pre-ready async probe',
  ).catch(() => 'timed out');
  const available = await safeStorage.isAsyncEncryptionAvailable();
  checks.push(
    check(
      's5.available',
      'safeStorage.isAsyncEncryptionAvailable() after ready',
      true,
      available,
      available,
    ),
  );
  if (!available)
    return { checks, facts: { preReadySync: ctx.preReadySafeStorage, preReadyAsync } };

  const store = new SecretStore(safeStorage);
  const secret = randomBytes(32).toString('base64url');
  const sealed = await store.seal(secret);
  if (!sealed.ok) {
    checks.push(check('s5.seal', 'Secret sealed', true, sealed.error.code, false));
    return { checks, facts: {} };
  }
  mkdirSync(join(app.getPath('userData'), 'keys'), { recursive: true, mode: 0o700 });
  writeFileSync(secretFile(), sealed.data, { mode: 0o600 });

  const opened = await store.open(sealed.data);
  const roundTrip = opened.ok && opened.data.value === secret;

  // Migration path for Electron 46: data sealed with the deprecated sync API must stay readable.
  const legacySecret = randomBytes(16).toString('base64url');
  const legacyOpened = await store.open(safeStorage.encryptString(legacySecret));
  const legacyReadable = legacyOpened.ok && legacyOpened.data.value === legacySecret;

  const scan = plaintextScan(ctx, [Buffer.from(secret)]);
  const hits = scan.problems;
  const containsPlain = sealed.data.includes(Buffer.from(secret));

  checks.push(
    check(
      's5.ciphertext-not-plaintext',
      'Ciphertext does not contain the secret',
      false,
      containsPlain,
      !containsPlain,
    ),
    check(
      's5.round-trip',
      'Async decrypt in the same process returns the secret',
      true,
      roundTrip,
      roundTrip,
    ),
    check(
      's5.legacy-sync-readable',
      'Ciphertext from deprecated encryptString() decrypts with decryptStringAsync()',
      true,
      legacyReadable,
      legacyReadable,
    ),
    check(
      's5.no-plaintext-files',
      'Secret not found in any file under userData or the output folder (the session folder of the running Chromium: post-exit scan)',
      [],
      hits,
      hits.length === 0,
    ),
  );
  const vault = await vaultWrite(ctx);
  checks.push(...vault.checks);
  return {
    checks,
    facts: {
      vault: vault.facts,
      fingerprint: fingerprint(secret),
      deferredToPostExit: scan.deferredToPostExit,
      ciphertextBytes: sealed.data.length,
      ciphertextPrefix: sealed.data.subarray(0, 3).toString('latin1'),
      shouldReEncrypt: opened.ok ? opened.data.shouldReEncrypt : null,
      preReadySync: ctx.preReadySafeStorage,
      preReadyAsync,
      appName: app.getName(),
      expectedKeychainService: `${app.getName()} Safe Storage`,
    },
  };
}

async function read(ctx: SpikeContext): Promise<SpikeOutcome> {
  const checks: Check[] = [];
  const written = JSON.parse(readFileSync(join(ctx.outDir, 's5-write.json'), 'utf8')) as {
    facts: { fingerprint: string };
  };
  const store = new SecretStore(safeStorage);
  const sealed = readFileSync(secretFile());
  const opened = await store.open(sealed);
  const fp = opened.ok ? fingerprint(opened.data.value) : null;

  // Flip one bit at every position after the "v10" prefix and see what safeStorage does.
  const tamper = opened.ok
    ? await tamperTrials(
        sealed,
        async (blob) => {
          const r = await store.open(blob);
          if (!r.ok) throw new Error(r.error.code);
          return r.data.value;
        },
        opened.data.value,
        3,
      )
    : null;

  // The output folder includes the captured logs of every phase of this run.
  const scan = opened.ok ? plaintextScan(ctx, [Buffer.from(opened.data.value)]) : null;
  const hits = scan ? scan.problems : ['(secret not recovered)'];

  checks.push(
    check(
      's5.restart-read',
      'New process decrypts the stored secret',
      written.facts.fingerprint,
      fp,
      fp === written.facts.fingerprint,
    ),
    check(
      's5.tamper-never-original',
      'No bit-flipped ciphertext decrypts to the original secret',
      0,
      tamper?.acceptedWithOriginalValue ?? null,
      tamper !== null && tamper.acceptedWithOriginalValue === 0,
    ),
    check(
      's5.no-plaintext-anywhere',
      'Secret absent from userData, results and captured logs (the session folder of the running Chromium: post-exit scan)',
      [],
      hits,
      hits.length === 0,
    ),
  );
  // Raw safeStorage integrity is recorded as a fact, not an acceptance check: it is known not to
  // reject all tampering on macOS (M1 finding). Integrity is enforced by the vault (Q-M1-01).
  const vault = await vaultRead(ctx);
  checks.push(...vault.checks);
  return {
    checks,
    facts: {
      appName: app.getName(),
      shouldReEncrypt: opened.ok ? opened.data.shouldReEncrypt : null,
      deferredToPostExit: scan?.deferredToPostExit ?? null,
      rawSafeStorageTamper: tamper ? { ...tamper } : null,
      vault: vault.facts,
    },
  };
}

async function decryptForeign(ctx: SpikeContext): Promise<SpikeOutcome> {
  const foreign = ctx.args.foreign;
  if (!foreign) throw new Error('--foreign=<path> is required for phase decrypt-foreign');
  const result = await new SecretStore(safeStorage).open(readFileSync(foreign));
  return {
    checks: [
      check(
        's5.foreign-key-store',
        'Ciphertext sealed by a different app identity cannot be decrypted here',
        'SECRET_DECRYPT_FAILED',
        result.ok ? 'decrypted' : result.error.code,
        !result.ok && result.error.code === 'SECRET_DECRYPT_FAILED',
      ),
    ],
    facts: { appName: app.getName() },
  };
}
