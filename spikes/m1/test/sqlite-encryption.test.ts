// S3 core checks under plain Node (the same native prebuild Electron loads; N-API is ABI-stable).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cipherName,
  createPlainControl,
  createSpikeSchema,
  foreignKeysEnforced,
  inspectFile,
  openEncrypted,
  readMarker,
  tryOpen,
} from '../src/shared/sqlite-core';

const dir = mkdtempSync(join(tmpdir(), 'fqf-s3-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('encrypted SQLite (SQLite3MultipleCiphers, SQLCipher v4 mode)', () => {
  const key = randomBytes(32);
  const marker = `MARKER-${randomBytes(6).toString('hex')}`;
  const dbPath = join(dir, 'enc.db');

  it('creates, writes and reads with the cipher actually enabled', () => {
    const db = openEncrypted(dbPath, key);
    createSpikeSchema(db, marker);
    expect(cipherName(db)).toBe('sqlcipher');
    expect(readMarker(db)).toBe(marker);
    expect(foreignKeysEnforced(db)).toBe(true);
    const wal = inspectFile(`${dbPath}-wal`, marker);
    expect(wal.exists).toBe(true);
    expect(wal.markerFound).toBe(false);
    db.close();
  });

  it('stores no plaintext header or data on disk', () => {
    const file = inspectFile(dbPath, marker);
    expect(file).toMatchObject({ exists: true, plainSqliteHeader: false, markerFound: false });
  });

  it('reopens with the right key and refuses wrong or missing keys', () => {
    const db = openEncrypted(dbPath, key);
    expect(readMarker(db)).toBe(marker);
    db.close();
    expect(tryOpen(dbPath, randomBytes(32))).toEqual({ opened: false, errorCode: 'SQLITE_NOTADB' });
    expect(tryOpen(dbPath, null)).toEqual({ opened: false, errorCode: 'SQLITE_NOTADB' });
  });

  it('positive control: the same inspection sees data in an unencrypted database', () => {
    const plain = join(dir, 'plain.db');
    createPlainControl(plain, marker);
    expect(inspectFile(plain, marker)).toMatchObject({
      plainSqliteHeader: true,
      markerFound: true,
    });
  });
});
