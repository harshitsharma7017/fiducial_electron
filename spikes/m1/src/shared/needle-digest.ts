// Needle digests for the post-exit plaintext scan (scripts/scan-after-exit.mjs).
//
// While the spike runs, Chromium on Windows keeps some of its session files open without read
// sharing, so the in-app scan cannot read them. After the app has exited those files are readable,
// but the secrets are no longer known. So each scan records a digest of every needle it searched
// for, never the needle itself: its length, a 32-bit polynomial rolling hash (a fast filter) and
// its SHA-256 (the confirmation). The post-exit scan slides a window over every file and confirms
// each rolling-hash candidate with SHA-256, so it reports exactly the files that contain a needle.
//
// Needles are random test secrets of at least MIN_NEEDLE_BYTES; neither digest makes recovering
// one easier than guessing it. Self-contained (node:crypto only) so plain Node can load it.
import { createHash } from 'node:crypto';

export const MIN_NEEDLE_BYTES = 16;
const BASE = 0x01000193;

export interface NeedleDigest {
  length: number;
  /** Polynomial rolling hash of the needle bytes, mod 2^32. */
  rolling: number;
  /** SHA-256 of the needle bytes, hex. */
  sha256: string;
}

function rollingHash(bytes: Uint8Array, start: number, length: number): number {
  let h = 0;
  for (let i = 0; i < length; i += 1) h = (Math.imul(h, BASE) + bytes[start + i]!) >>> 0;
  return h;
}

/** BASE^(length-1) mod 2^32: the weight of the byte that leaves the window. */
function leadingWeight(length: number): number {
  let p = 1;
  for (let i = 1; i < length; i += 1) p = Math.imul(p, BASE) >>> 0;
  return p;
}

export function digestNeedle(needle: Buffer): NeedleDigest {
  if (needle.length < MIN_NEEDLE_BYTES) {
    throw new Error(`needles must be at least ${MIN_NEEDLE_BYTES} bytes`);
  }
  return {
    length: needle.length,
    rolling: rollingHash(needle, 0, needle.length),
    sha256: createHash('sha256').update(needle).digest('hex'),
  };
}

/** The digests whose needle occurs anywhere in `bytes` (each digest reported once). */
export function findDigests(bytes: Buffer, digests: readonly NeedleDigest[]): NeedleDigest[] {
  const found = new Set<NeedleDigest>();
  const byLength = new Map<number, NeedleDigest[]>();
  for (const d of digests) byLength.set(d.length, [...(byLength.get(d.length) ?? []), d]);
  for (const [length, group] of byLength) {
    if (length > bytes.length) continue;
    const candidates = new Map<number, NeedleDigest[]>();
    for (const d of group) candidates.set(d.rolling, [...(candidates.get(d.rolling) ?? []), d]);
    const weight = leadingWeight(length);
    let h = rollingHash(bytes, 0, length);
    for (let start = 0; ; start += 1) {
      const hit = candidates.get(h);
      if (hit) {
        const sha = createHash('sha256')
          .update(bytes.subarray(start, start + length))
          .digest('hex');
        for (const d of hit) if (d.sha256 === sha) found.add(d);
      }
      const next = start + length;
      if (next >= bytes.length) break;
      h = (Math.imul((h - Math.imul(bytes[start]!, weight)) >>> 0, BASE) + bytes[next]!) >>> 0;
    }
  }
  return digests.filter((d) => found.has(d));
}
