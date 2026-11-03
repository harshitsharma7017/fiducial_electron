// Windows companion to R7 in vault.test.ts. R7 makes the vault folder unwritable with
// chmod(0o500), which is POSIX-only: on Windows it does not stop new files being created. This
// test denies "create files" on the folder with an NTFS ACL instead and expects the same
// outcome as R7: a failed rotation reports STORAGE_ERROR and leaves the live vault unchanged.
// R7 itself is kept unchanged.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SecretBackend } from '../src/shared/secret-store';
import { SecretVault } from '../src/shared/vault/vault';

// The OS wrapper is not under test here (only the write-failure path), so a transparent fake
// is enough. Values are random test data.
const backend: SecretBackend = {
  isAsyncEncryptionAvailable: () => Promise.resolve(true),
  encryptStringAsync: (plain) => Promise.resolve(Buffer.from(`fake:${plain}`, 'utf8')),
  decryptStringAsync: (blob) =>
    Promise.resolve({ shouldReEncrypt: false, result: blob.toString('utf8').slice(5) }),
};

function currentUserSid(): string {
  const out = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
  const sid = /"(S-1-[\d-]+)"/.exec(out)?.[1];
  if (!sid) throw new Error('could not read the current user SID');
  return sid;
}

describe('vault write failure on Windows (NTFS ACL)', () => {
  it.skipIf(process.platform !== 'win32')(
    'R7 (Windows): a rotation denied by an ACL leaves the live vault unchanged',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'fqf-vault-acl-'));
      const secret = `test-${randomBytes(8).toString('hex')}`;
      try {
        const opened = await SecretVault.open(dir, backend);
        if (!opened.ok) throw new Error(opened.error.code);
        const v = opened.data;
        expect(await v.put('t', secret)).toEqual({ ok: true, data: null });
        const before = { active: v.activeKeyId, ids: v.keyIds() };

        const sid = currentUserSid();
        // WD: create files / write data; AD: create folders / append. Applies to the folder only.
        execFileSync('icacls', [dir, '/deny', `*${sid}:(WD,AD)`]);
        try {
          // Precondition: the denial is in force, so a pass below is not vacuous.
          expect(() => writeFileSync(join(dir, 'probe.tmp'), 'x')).toThrow();
          const r = await v.rotateKey();
          expect(r.ok ? 'OK' : r.error.code).toBe('STORAGE_ERROR');
        } finally {
          execFileSync('icacls', [dir, '/remove:d', `*${sid}`]);
        }
        expect({ active: v.activeKeyId, ids: v.keyIds() }).toEqual(before);
        expect(await v.get('t')).toEqual({ ok: true, data: secret });
        v.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
