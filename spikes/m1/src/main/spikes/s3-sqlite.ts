// S3: encrypted SQLite with a random key wrapped by OS-backed safeStorage (DM-02 option B).
// Phase "create" makes the database; phase "reopen" runs in a new process and reads it back.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { app, safeStorage } from 'electron';
import { check, type Check } from '../../shared/result';
import {
  cipherName,
  createPlainControl,
  createSpikeSchema,
  foreignKeysEnforced,
  inspectFile,
  openEncrypted,
  readMarker,
  tryOpen,
} from '../../shared/sqlite-core';
import { tamperTrials } from '../../shared/tamper';
import { plaintextScan } from '../plaintext-scan';
import type { SpikeContext, SpikeOutcome } from '../spike-context';
import { sanitisePath } from '../util';
import { durabilityCreate, durabilityReopen } from './s3-durability';

function locations() {
  const userData = app.getPath('userData');
  // The wrapped key and the database live in different directories.
  const keysDir = join(userData, 'keys');
  const dataDir = join(userData, 'data');
  return {
    userData,
    keysDir,
    dataDir,
    keyFile: join(keysDir, 'db.key.enc'),
    dbPath: join(dataDir, 'spike.db'),
  };
}

function loadedNativeModules(): string[] {
  return Object.keys(require.cache)
    .filter((p) => p.endsWith('.node'))
    .map(sanitisePath);
}

export function runS3(ctx: SpikeContext): Promise<SpikeOutcome> {
  return ctx.args.phase === 'reopen' ? reopen(ctx) : create(ctx);
}

async function create(ctx: SpikeContext): Promise<SpikeOutcome> {
  const checks: Check[] = [];
  const loc = locations();
  rmSync(loc.keysDir, { recursive: true, force: true });
  rmSync(loc.dataDir, { recursive: true, force: true });
  mkdirSync(loc.keysDir, { recursive: true, mode: 0o700 });
  mkdirSync(loc.dataDir, { recursive: true, mode: 0o700 });

  const available = await safeStorage.isAsyncEncryptionAvailable();
  checks.push(
    check(
      's3.safe-storage',
      'OS-backed safeStorage available to wrap the key',
      true,
      available,
      available,
    ),
  );
  if (!available) return { checks, facts: {} };

  const key = randomBytes(32);
  writeFileSync(loc.keyFile, await safeStorage.encryptStringAsync(key.toString('base64')), {
    mode: 0o600,
  });
  const marker = `FQF-S3-MARKER-${randomBytes(8).toString('hex')}`;

  const db = openEncrypted(loc.dbPath, key);
  createSpikeSchema(db, marker);
  const whileOpen = {
    db: inspectFile(loc.dbPath, marker),
    wal: inspectFile(`${loc.dbPath}-wal`, marker),
  };
  const cipher = cipherName(db);
  const fk = foreignKeysEnforced(db);
  const readBack = readMarker(db);
  db.close();
  const afterClose = inspectFile(loc.dbPath, marker);
  const durable = durabilityCreate(loc.dataDir, loc.keysDir, key);

  const keyNeedles = [key, Buffer.from(key.toString('hex')), Buffer.from(key.toString('base64'))];
  const keyScan = plaintextScan(ctx, keyNeedles);
  const keyHits = keyScan.problems;
  const native = loadedNativeModules();

  checks.push(
    check(
      's3.cipher',
      'Cipher scheme reported by SQLite3MultipleCiphers',
      'sqlcipher',
      cipher,
      cipher === 'sqlcipher',
    ),
    check(
      's3.write-read',
      'Row written and read back in the same session',
      marker,
      readBack ?? null,
      readBack === marker,
    ),
    check('s3.foreign-keys', 'Foreign keys enforced', true, fk, fk),
    check(
      's3.db-header-encrypted',
      'Database file has no plaintext SQLite header (while open)',
      false,
      whileOpen.db.plainSqliteHeader,
      whileOpen.db.exists && !whileOpen.db.plainSqliteHeader,
    ),
    check(
      's3.db-marker-hidden',
      'Marker string not readable in database file bytes',
      false,
      whileOpen.db.markerFound || afterClose.markerFound,
      !whileOpen.db.markerFound && !afterClose.markerFound,
    ),
    check(
      's3.wal-marker-hidden',
      'Marker string not readable in the WAL file (WAL mode)',
      false,
      whileOpen.wal.markerFound,
      whileOpen.wal.exists && !whileOpen.wal.markerFound,
    ),
    check(
      's3.key-not-on-disk',
      'Raw key (bytes, hex or base64) not found in any file (the session folder of the running Chromium: post-exit scan)',
      [],
      keyHits,
      keyHits.length === 0,
    ),
    check(
      's3.key-separate-dir',
      'Wrapped key stored outside the database directory',
      'keys/ vs data/',
      `${relative(loc.userData, loc.keyFile)} vs ${relative(loc.userData, loc.dbPath)}`,
      !loc.keyFile.startsWith(loc.dataDir + sep),
    ),
    check(
      's3.native-module-loaded',
      'Native SQLite module loaded',
      'one .node file',
      native,
      native.length === 1,
    ),
    ...durable.checks,
  );

  return {
    checks,
    facts: {
      ...durable.facts,
      marker,
      walFileExistedWhileOpen: whileOpen.wal.exists,
      dbBytesAfterClose: afterClose.size,
      nativeModules: native,
      keyFile: sanitisePath(loc.keyFile),
      dbFile: sanitisePath(loc.dbPath),
      deferredToPostExit: keyScan.deferredToPostExit,
    },
  };
}

async function reopen(ctx: SpikeContext): Promise<SpikeOutcome> {
  const checks: Check[] = [];
  const loc = locations();
  const created = JSON.parse(readFileSync(join(ctx.outDir, 's3-create.json'), 'utf8')) as {
    status: string;
    facts: { marker?: unknown };
  };
  // A failed create phase records no marker; say so instead of failing on a later insert.
  if (typeof created.facts.marker !== 'string') {
    throw new Error(
      `the create phase recorded no marker (its status: ${created.status}); run it successfully first`,
    );
  }
  const marker = created.facts.marker;

  const wrapped = readFileSync(loc.keyFile);
  const key = Buffer.from((await safeStorage.decryptStringAsync(wrapped)).result, 'base64');
  const db = openEncrypted(loc.dbPath, key);
  const readBack = readMarker(db);
  const integrity = db.pragma('integrity_check', { simple: true });
  const fk = foreignKeysEnforced(db);
  db.close();
  const durable = durabilityReopen(loc.dataDir, loc.keysDir, key, join(loc.userData, 'trials'));

  const wrongKey = tryOpen(loc.dbPath, randomBytes(32));
  const noKey = tryOpen(loc.dbPath, null);

  // Flip one bit at every position after the "v10" prefix. safeStorage may or may not reject a
  // tampered blob; whatever it returns must never open the database.
  let tamperedKeysThatOpenedDb = 0;
  const tamper = await tamperTrials(
    wrapped,
    async (blob) => (await safeStorage.decryptStringAsync(blob)).result,
    key.toString('base64'),
    3,
    (value) => {
      if (tryOpen(loc.dbPath, Buffer.from(value, 'base64')).opened) tamperedKeysThatOpenedDb += 1;
    },
  );

  // Positive control: the same inspection does see data in an unencrypted database.
  const controlPath = join(loc.dataDir, 'control-plain.db');
  createPlainControl(controlPath, marker);
  const control = inspectFile(controlPath, marker);
  rmSync(controlPath, { force: true });
  rmSync(`${controlPath}-wal`, { force: true });
  rmSync(`${controlPath}-shm`, { force: true });

  checks.push(
    check(
      's3.reopen-read',
      'New process unwraps the key and reads the row',
      marker,
      readBack ?? null,
      readBack === marker,
    ),
    check('s3.integrity', 'PRAGMA integrity_check', 'ok', integrity, integrity === 'ok'),
    check('s3.reopen-foreign-keys', 'Foreign keys enforced after reopen', true, fk, fk),
    check(
      's3.wrong-key-rejected',
      'Random wrong key cannot open the database',
      'SQLITE_NOTADB',
      wrongKey.errorCode,
      !wrongKey.opened && wrongKey.errorCode === 'SQLITE_NOTADB',
    ),
    check(
      's3.no-key-rejected',
      'Opening without a key fails',
      'SQLITE_NOTADB',
      noKey.errorCode,
      !noKey.opened && noKey.errorCode === 'SQLITE_NOTADB',
    ),
    check(
      's3.tampered-wrapped-key',
      'No bit-flipped wrapped key (any position) opens the database (fail closed at DB level)',
      { openedDb: 0, returnedOriginalKey: 0 },
      { openedDb: tamperedKeysThatOpenedDb, returnedOriginalKey: tamper.acceptedWithOriginalValue },
      tamperedKeysThatOpenedDb === 0 && tamper.acceptedWithOriginalValue === 0,
    ),
    check(
      's3.control-plain-visible',
      'Positive control: plain database shows header and marker',
      { header: true, marker: true },
      { header: control.plainSqliteHeader, marker: control.markerFound },
      control.plainSqliteHeader && control.markerFound,
    ),
    ...durable.checks,
  );

  return {
    checks,
    facts: { nativeModules: loadedNativeModules(), safeStorageTamperTrials: { ...tamper } },
  };
}
