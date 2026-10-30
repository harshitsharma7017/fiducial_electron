// S5 / Q-M1-01: the authenticated secret vault running on real Electron safeStorage.
// Every destructive experiment runs on a COPY of the vault; the real store is snapshotted
// before and after to prove that failures never overwrite or reset it.
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import { snapshotFiles } from '../../shared/file-scan';
import { check, type Check } from '../../shared/result';
import type { VaultErrorCode } from '../../shared/vault/errors';
import { ENVELOPE_SUFFIX, KEYRING_FILE, SecretVault } from '../../shared/vault/vault';
import { plaintextScan } from '../plaintext-scan';
import type { SpikeContext, SpikeOutcome } from '../spike-context';

const NAMES = ['portal.mock-a', 'portal.mock-b', 'unicode'] as const;

function vaultDir(): string {
  return join(app.getPath('userData'), 'secrets');
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

type Tally = Partial<Record<VaultErrorCode | 'RETURNED_VALUE', number>>;

function count(tally: Tally, key: VaultErrorCode | 'RETURNED_VALUE'): void {
  tally[key] = (tally[key] ?? 0) + 1;
}

export async function vaultWrite(ctx: SpikeContext): Promise<SpikeOutcome> {
  rmSync(vaultDir(), { recursive: true, force: true });
  const opened = await SecretVault.open(vaultDir(), safeStorage);
  if (!opened.ok) {
    return {
      checks: [check('s5v.open', 'Vault opens', true, opened.error.code, false)],
      facts: {},
    };
  }
  const vault = opened.data;
  // Random test secrets only; never real credentials.
  const values: Record<string, string> = {
    'portal.mock-a': randomBytes(24).toString('base64url'),
    'portal.mock-b': randomBytes(24).toString('base64url'),
    unicode: `${randomBytes(12).toString('base64url')} ₹ ✓ café`,
  };
  const results = await Promise.all(NAMES.map((n) => vault.put(n, values[n]!)));
  vault.close();
  const plaintextHits = plaintextScan(
    ctx,
    Object.values(values).map((v) => Buffer.from(v, 'utf8')),
  ).problems;
  return {
    checks: [
      check(
        's5v.put',
        'Three random secrets stored',
        3,
        results.filter((r) => r.ok).length,
        results.every((r) => r.ok),
      ),
      check(
        's5v.no-plaintext',
        'No secret plaintext in any file (userData, results, logs)',
        [],
        plaintextHits,
        plaintextHits.length === 0,
      ),
    ],
    facts: {
      fingerprints: Object.fromEntries(NAMES.map((n) => [n, fingerprint(values[n]!)])),
      files: Object.keys(snapshotFiles(vaultDir())).sort(),
    },
  };
}

export async function vaultRead(ctx: SpikeContext): Promise<SpikeOutcome> {
  const checks: Check[] = [];
  const written = JSON.parse(readFileSync(join(ctx.outDir, 's5-write.json'), 'utf8')) as {
    facts: { vault: { fingerprints: Record<string, string> } };
  };
  const realBefore = snapshotFiles(vaultDir());

  // 1. Restart survival: a new process reads every secret.
  const opened = await SecretVault.open(vaultDir(), safeStorage);
  if (!opened.ok) {
    return {
      checks: [check('s5v.reopen', 'Vault reopens', true, opened.error.code, false)],
      facts: {},
    };
  }
  const real = opened.data;
  const values = new Map<string, string>();
  for (const n of NAMES) {
    const r = await real.get(n);
    if (r.ok) values.set(n, r.data);
  }
  const fpsMatch = NAMES.every(
    (n) => values.has(n) && fingerprint(values.get(n)!) === written.facts.vault.fingerprints[n],
  );
  checks.push(
    check(
      's5v.restart-read',
      'All secrets read back in a new process (fingerprints match)',
      true,
      fpsMatch,
      fpsMatch,
    ),
  );

  // Work on a copy from here on.
  const work = join(ctx.outDir, 's5-vault-work');
  const reset = (): void => {
    rmSync(work, { recursive: true, force: true });
    cpSync(vaultDir(), work, { recursive: true });
  };
  reset();
  const target = join(work, `portal.mock-a${ENVELOPE_SUFFIX}`);
  const original = readFileSync(target);
  const copy = await SecretVault.open(work, safeStorage);
  if (!copy.ok) throw new Error('copy did not open');

  // 2. Every byte of the envelope, two bit patterns.
  const flips: Tally = {};
  for (const mask of [0x01, 0x80]) {
    for (let i = 0; i < original.length; i++) {
      const t = Buffer.from(original);
      t[i] = (t[i] ?? 0) ^ mask;
      writeFileSync(target, t);
      const r = await copy.data.get('portal.mock-a');
      count(flips, r.ok ? 'RETURNED_VALUE' : r.error.code);
    }
  }
  checks.push(
    check(
      's5v.envelope-bitflips',
      `Every single-byte change (${original.length * 2} trials) is rejected`,
      { RETURNED_VALUE: 0 },
      flips,
      !flips.RETURNED_VALUE,
    ),
  );

  // 3. Every truncation, an extension, an unsupported version and a moved envelope.
  const truncations: Tally = {};
  for (let len = 0; len < original.length; len++) {
    writeFileSync(target, original.subarray(0, len));
    const r = await copy.data.get('portal.mock-a');
    count(truncations, r.ok ? 'RETURNED_VALUE' : r.error.code);
  }
  checks.push(
    check(
      's5v.truncations',
      `Every truncation (${original.length} lengths) is rejected`,
      { RETURNED_VALUE: 0 },
      truncations,
      !truncations.RETURNED_VALUE,
    ),
  );

  const special = async (bytes: Buffer, name = 'portal.mock-a'): Promise<string> => {
    writeFileSync(join(work, `${name}${ENVELOPE_SUFFIX}`), bytes);
    const r = await copy.data.get(name);
    return r.ok ? 'RETURNED_VALUE' : r.error.code;
  };
  const v2 = Buffer.from(original);
  v2[4] = 2;
  const specials = {
    extended: await special(Buffer.concat([original, Buffer.from([0])])),
    version2: await special(v2),
    movedToOtherName: await special(original, 'portal.mock-b'),
    legacyRawSafeStorageBlob: await special(await safeStorage.encryptStringAsync('legacy')),
  };
  checks.push(
    check(
      's5v.special-cases',
      'Extended, unsupported-version, moved and legacy-format envelopes are rejected',
      {
        extended: 'SECRET_AUTH_FAILED',
        version2: 'ENVELOPE_UNSUPPORTED_VERSION',
        movedToOtherName: 'SECRET_AUTH_FAILED',
        legacyRawSafeStorageBlob: 'ENVELOPE_MALFORMED',
      },
      specials,
      specials.extended === 'SECRET_AUTH_FAILED' &&
        specials.version2 === 'ENVELOPE_UNSUPPORTED_VERSION' &&
        specials.movedToOtherName === 'SECRET_AUTH_FAILED' &&
        specials.legacyRawSafeStorageBlob === 'ENVELOPE_MALFORMED',
    ),
  );

  // 4. No silent overwrite: put() over an unreadable secret is refused and changes nothing.
  writeFileSync(
    target,
    Buffer.concat([original.subarray(0, -1), Buffer.from([(original.at(-1) ?? 0) ^ 1])]),
  );
  const corruptBytes = readFileSync(target);
  const refused = await copy.data.put('portal.mock-a', 'replacement');
  const unchanged = readFileSync(target).equals(corruptBytes);
  checks.push(
    check(
      's5v.no-overwrite-unreadable',
      'put() over an unreadable secret is refused and the file is unchanged',
      { code: 'SECRET_UNREADABLE_EXISTS', unchanged: true },
      { code: refused.ok ? 'WRITTEN' : refused.error.code, unchanged },
      !refused.ok && refused.error.code === 'SECRET_UNREADABLE_EXISTS' && unchanged,
    ),
  );
  copy.data.close();

  // 5. Wrapped data key tampered at every byte, with REAL safeStorage (the M1 finding).
  reset();
  const keyringPath = join(work, KEYRING_FILE);
  const keyringText = readFileSync(keyringPath, 'utf8');
  const keyring = JSON.parse(keyringText) as { keys: { wrapped: string; check: string }[] };
  const wrapped = Buffer.from(keyring.keys[0]!.wrapped, 'base64');
  const keyTamper: Tally = {};
  let keyTamperChangedFiles = 0;
  for (let i = 3; i < wrapped.length; i++) {
    const t = Buffer.from(wrapped);
    t[i] = (t[i] ?? 0) ^ 0x01;
    keyring.keys[0]!.wrapped = t.toString('base64');
    writeFileSync(keyringPath, JSON.stringify(keyring));
    const before = JSON.stringify(snapshotFiles(work));
    const r = await SecretVault.open(work, safeStorage);
    if (r.ok) {
      count(keyTamper, 'RETURNED_VALUE');
      r.data.close();
    } else {
      count(keyTamper, r.error.code);
    }
    if (JSON.stringify(snapshotFiles(work)) !== before) keyTamperChangedFiles += 1;
  }
  checks.push(
    check(
      's5v.wrapped-key-tamper',
      `Every single-byte change to the safeStorage-wrapped data key (${wrapped.length - 3} trials) is rejected`,
      { RETURNED_VALUE: 0 },
      keyTamper,
      !keyTamper.RETURNED_VALUE,
    ),
    check(
      's5v.wrapped-key-tamper-no-writes',
      'No file changed during wrapped-key tamper trials',
      0,
      keyTamperChangedFiles,
      keyTamperChangedFiles === 0,
    ),
  );

  // 6. Keyring missing, malformed, and a key removed from it.
  const outcome = async (): Promise<string> => {
    const r = await SecretVault.open(work, safeStorage);
    if (r.ok) r.data.close();
    return r.ok ? 'OPENED' : r.error.code;
  };
  writeFileSync(keyringPath, '{ not json');
  const malformed = await outcome();
  rmSync(keyringPath);
  const missing = await outcome();
  reset();
  const rot = await SecretVault.open(work, safeStorage);
  if (!rot.ok) throw new Error('copy did not open');
  const oldKey = rot.data.activeKeyId;
  await rot.data.rotateKey();
  rot.data.close();
  const k = JSON.parse(readFileSync(keyringPath, 'utf8')) as { keys: { id: string }[] };
  k.keys = k.keys.filter((e) => e.id !== oldKey);
  writeFileSync(keyringPath, JSON.stringify(k));
  const afterRemoval = await SecretVault.open(work, safeStorage);
  const keyMissing = afterRemoval.ok ? await afterRemoval.data.get('portal.mock-a') : null;
  checks.push(
    check(
      's5v.keyring-failures',
      'Malformed keyring, missing keyring and missing key are rejected',
      { malformed: 'KEYRING_MALFORMED', missing: 'KEYRING_MISSING', keyRemoved: 'KEY_NOT_FOUND' },
      {
        malformed,
        missing,
        keyRemoved: keyMissing && !keyMissing.ok ? keyMissing.error.code : 'RETURNED_VALUE',
      },
      malformed === 'KEYRING_MALFORMED' &&
        missing === 'KEYRING_MISSING' &&
        keyMissing !== null &&
        !keyMissing.ok &&
        keyMissing.error.code === 'KEY_NOT_FOUND',
    ),
  );

  // 7. Rotation on real safeStorage: rotate, re-encrypt, prune, read back.
  reset();
  const rv = await SecretVault.open(work, safeStorage);
  let rotationOk = false;
  if (rv.ok) {
    const first = rv.data.activeKeyId;
    await rv.data.rotateKey();
    const re = await rv.data.reencryptAll();
    const pruned = await rv.data.pruneRetiredKeys();
    rv.data.close();
    const again = await SecretVault.open(work, safeStorage);
    const readable =
      again.ok &&
      (await Promise.all(NAMES.map((n) => again.data.get(n)))).every(
        (r, i) => r.ok && r.data === values.get(NAMES[i]!),
      );
    rotationOk =
      re.ok &&
      re.data.reencrypted.length === 3 &&
      pruned.ok &&
      pruned.data[0] === first &&
      readable;
  }
  checks.push(
    check(
      's5v.rotation',
      'Rotate, re-encrypt all, prune retired key, read back after reopen',
      true,
      rotationOk,
      rotationOk,
    ),
  );
  rmSync(work, { recursive: true, force: true });

  // 8. The real store is byte-identical and still readable after all of the above.
  const realAfter = snapshotFiles(vaultDir());
  const realUnchanged = JSON.stringify(realBefore) === JSON.stringify(realAfter);
  const stillReadable = (await Promise.all(NAMES.map((n) => real.get(n)))).every(
    (r, i) => r.ok && r.data === values.get(NAMES[i]!),
  );
  real.close();
  checks.push(
    check(
      's5v.real-store-untouched',
      'Real vault files byte-identical and readable after every failure test',
      { unchanged: true, readable: true },
      { unchanged: realUnchanged, readable: stillReadable },
      realUnchanged && stillReadable,
    ),
  );

  // 9. Secrets never appear in files, results or this run's captured logs.
  const hits = plaintextScan(
    ctx,
    [...values.values()].map((v) => Buffer.from(v, 'utf8')),
  ).problems;
  checks.push(
    check(
      's5v.no-plaintext-anywhere',
      'No secret plaintext in userData, results or logs',
      [],
      hits,
      hits.length === 0,
    ),
  );

  return { checks, facts: { envelopeBytes: original.length, wrappedKeyBytes: wrapped.length } };
}

/** A different app identity (different Keychain item) opens a copy of another app's vault. */
export async function vaultForeign(
  ctx: SpikeContext,
  foreignVaultDir: string,
): Promise<SpikeOutcome> {
  const work = join(ctx.outDir, 's5-vault-foreign');
  rmSync(work, { recursive: true, force: true });
  cpSync(foreignVaultDir, work, { recursive: true });
  const before = JSON.stringify(snapshotFiles(work));
  const r = await SecretVault.open(work, safeStorage);
  if (r.ok) r.data.close();
  const unchanged = JSON.stringify(snapshotFiles(work)) === before;
  rmSync(work, { recursive: true, force: true });
  return {
    checks: [
      check(
        's5v.foreign-identity',
        'Another app identity cannot open this vault (key unusable)',
        'KEY_UNWRAP_FAILED or KEY_CHECK_FAILED',
        r.ok ? 'OPENED' : r.error.code,
        !r.ok && (r.error.code === 'KEY_UNWRAP_FAILED' || r.error.code === 'KEY_CHECK_FAILED'),
      ),
      check(
        's5v.foreign-no-writes',
        'The foreign vault files were not modified',
        true,
        unchanged,
        unchanged,
      ),
    ],
    facts: {},
  };
}
