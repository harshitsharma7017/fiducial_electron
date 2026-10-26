import { describe, expect, it } from 'vitest';
import { tamperTrials } from '../src/shared/tamper';

describe('tamperTrials', () => {
  const sealed = Buffer.from('v10abcdef');

  it('counts every position after the prefix and classifies the outcomes', async () => {
    // Fake decryptor: rejects tampering in the first payload byte, returns garbage otherwise.
    const summary = await tamperTrials(
      sealed,
      (blob) =>
        blob[3] !== sealed[3] ? Promise.reject(new Error('bad')) : Promise.resolve('garbage'),
      'secret',
      3,
    );
    expect(summary).toEqual({
      trials: 6,
      rejected: 1,
      acceptedWithDifferentValue: 5,
      acceptedWithOriginalValue: 0,
    });
  });

  it('flags a decryptor that ignores tampering entirely', async () => {
    const summary = await tamperTrials(sealed, () => Promise.resolve('secret'), 'secret', 3);
    expect(summary.acceptedWithOriginalValue).toBe(6);
  });
});
