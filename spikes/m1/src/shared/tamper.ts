// Deterministic tamper experiment: flip one bit at every byte position after the format prefix
// and record whether the decryptor rejects the result, returns a different value, or (worst)
// returns the original value.

export interface TamperSummary {
  trials: number;
  rejected: number;
  acceptedWithDifferentValue: number;
  acceptedWithOriginalValue: number;
}

export async function tamperTrials(
  sealed: Buffer,
  decrypt: (tampered: Buffer) => Promise<string>,
  original: string,
  prefixLength: number,
  onAccepted?: (value: string) => void,
): Promise<TamperSummary> {
  const summary: TamperSummary = {
    trials: 0,
    rejected: 0,
    acceptedWithDifferentValue: 0,
    acceptedWithOriginalValue: 0,
  };
  for (let i = prefixLength; i < sealed.length; i++) {
    const tampered = Buffer.from(sealed);
    tampered[i] = (tampered[i] ?? 0) ^ 0x01;
    summary.trials += 1;
    let value: string;
    try {
      value = await decrypt(tampered);
    } catch {
      summary.rejected += 1;
      continue;
    }
    if (value === original) summary.acceptedWithOriginalValue += 1;
    else summary.acceptedWithDifferentValue += 1;
    onAccepted?.(value);
  }
  return summary;
}
