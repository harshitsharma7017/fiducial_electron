import { describe, expect, it } from 'vitest';
import { parseSpikeArgs } from '../src/shared/args';

describe('parseSpikeArgs', () => {
  it('parses known flags and ignores Chromium switches', () => {
    const parsed = parseSpikeArgs([
      '/electron',
      '.',
      '--spike=s3',
      '--out=/tmp/o',
      '--phase=reopen',
      '--no-sandbox-not-ours',
    ]);
    expect(parsed).toEqual({ ok: true, args: { spike: 's3', out: '/tmp/o', phase: 'reopen' } });
  });

  it('rejects an unknown spike id', () => {
    expect(parseSpikeArgs(['--spike=s9', '--out=/tmp/o']).ok).toBe(false);
  });

  it('rejects a phase with unexpected characters', () => {
    expect(parseSpikeArgs(['--spike=s1', '--out=/tmp/o', '--phase=../x']).ok).toBe(false);
  });
});
