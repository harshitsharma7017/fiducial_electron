// Secret envelope v1: AES-256-GCM with a random 96-bit nonce and a 128-bit tag.
//
//   offset  size  field
//   0       4     magic "FQSE"
//   4       1     version (1)
//   5       1     algorithm (1 = AES-256-GCM)
//   6       1     key id length L (1..32)
//   7       L     key id (ASCII [a-z0-9-])
//   7+L     12    nonce
//   19+L    n     ciphertext (0..MAX_PLAINTEXT_BYTES)
//   end-16  16    authentication tag
//
// Additional authenticated data = header (magic..nonce) || 0x00 || context, where the context
// names the secret slot, so an envelope cannot be moved to another name or have its header
// edited without failing authentication. Plaintext is only returned after the tag verifies.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { VaultError } from './errors';

export const MAGIC = Buffer.from('FQSE', 'latin1');
export const VERSION = 1;
export const ALG_AES_256_GCM = 1;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;
export const MAX_PLAINTEXT_BYTES = 16 * 1024;
export const KEY_ID_PATTERN = /^[a-z0-9-]{1,32}$/;

const HEADER_FIXED = 7;
const ENCRYPTION_KEY_INFO = 'fqf-vault:v1:aes-256-gcm';

export interface ParsedEnvelope {
  keyId: string;
  header: Buffer;
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

/** Per-purpose subkey, so the data key itself is never used directly by two algorithms. */
export function encryptionKey(dataKey: Buffer): Buffer {
  if (dataKey.length !== KEY_BYTES) throw new VaultError('KEY_CHECK_FAILED');
  return Buffer.from(hkdfSync('sha256', dataKey, Buffer.alloc(0), ENCRYPTION_KEY_INFO, KEY_BYTES));
}

function aad(header: Buffer, context: string): Buffer {
  return Buffer.concat([header, Buffer.from([0]), Buffer.from(context, 'utf8')]);
}

/** Strict structural parse. Throws VaultError; never decrypts. */
export function parseEnvelope(bytes: Buffer): ParsedEnvelope {
  if (bytes.length < HEADER_FIXED + 1 + NONCE_BYTES + TAG_BYTES) {
    throw new VaultError('ENVELOPE_MALFORMED');
  }
  if (!bytes.subarray(0, 4).equals(MAGIC)) throw new VaultError('ENVELOPE_MALFORMED');
  if (bytes[4] !== VERSION) throw new VaultError('ENVELOPE_UNSUPPORTED_VERSION');
  if (bytes[5] !== ALG_AES_256_GCM) throw new VaultError('ENVELOPE_UNSUPPORTED_ALGORITHM');
  const keyIdLength = bytes[6] ?? 0;
  const nonceStart = HEADER_FIXED + keyIdLength;
  const ciphertextStart = nonceStart + NONCE_BYTES;
  const tagStart = bytes.length - TAG_BYTES;
  if (keyIdLength < 1 || keyIdLength > 32 || ciphertextStart > tagStart) {
    throw new VaultError('ENVELOPE_MALFORMED');
  }
  if (tagStart - ciphertextStart > MAX_PLAINTEXT_BYTES) throw new VaultError('ENVELOPE_MALFORMED');
  const keyId = bytes.toString('latin1', HEADER_FIXED, nonceStart);
  if (!KEY_ID_PATTERN.test(keyId)) throw new VaultError('ENVELOPE_MALFORMED');
  return {
    keyId,
    header: bytes.subarray(0, ciphertextStart),
    nonce: bytes.subarray(nonceStart, ciphertextStart),
    ciphertext: bytes.subarray(ciphertextStart, tagStart),
    tag: bytes.subarray(tagStart),
  };
}

export function sealEnvelope(
  dataKey: Buffer,
  keyId: string,
  context: string,
  plaintext: Buffer,
): Buffer {
  if (!KEY_ID_PATTERN.test(keyId)) throw new VaultError('KEY_NOT_FOUND');
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new VaultError('INVALID_VALUE');
  const nonce = randomBytes(NONCE_BYTES);
  const keyIdBytes = Buffer.from(keyId, 'latin1');
  const header = Buffer.concat([
    MAGIC,
    Buffer.from([VERSION, ALG_AES_256_GCM, keyIdBytes.length]),
    keyIdBytes,
    nonce,
  ]);
  const key = encryptionKey(dataKey);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad(header, context));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([header, ciphertext, cipher.getAuthTag()]);
  } finally {
    key.fill(0);
  }
}

/** Verifies the tag before releasing any plaintext. Throws SECRET_AUTH_FAILED on any mismatch. */
export function openEnvelope(dataKey: Buffer, parsed: ParsedEnvelope, context: string): Buffer {
  const key = encryptionKey(dataKey);
  let partial: Buffer | undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, parsed.nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aad(parsed.header, context));
    decipher.setAuthTag(parsed.tag);
    partial = decipher.update(parsed.ciphertext);
    const final = decipher.final(); // throws if the tag does not verify
    const plaintext = Buffer.concat([partial, final]);
    partial.fill(0);
    return plaintext;
  } catch {
    // Unverified bytes from update() are wiped and never returned.
    partial?.fill(0);
    throw new VaultError('SECRET_AUTH_FAILED');
  } finally {
    key.fill(0);
  }
}
