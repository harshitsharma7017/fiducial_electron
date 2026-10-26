import { describe, expect, it } from 'vitest';
import { rendererStateSchema } from '../src/shared/ipc-contract';

const valid = {
  typeofRequire: 'undefined',
  typeofProcess: 'undefined',
  typeofModule: 'undefined',
  hasSpikeBridge: true,
  preloadWorldVisible: false,
  cspMeta: true,
};

describe('rendererStateSchema', () => {
  it('accepts the expected shape', () => {
    expect(rendererStateSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unexpected fields (strict schema)', () => {
    expect(rendererStateSchema.safeParse({ ...valid, unexpectedField: true }).success).toBe(false);
  });

  it('rejects wrong types and values', () => {
    expect(rendererStateSchema.safeParse({ ...valid, typeofRequire: 'nonsense' }).success).toBe(
      false,
    );
    expect(rendererStateSchema.safeParse({ ...valid, cspMeta: 'yes' }).success).toBe(false);
    expect(rendererStateSchema.safeParse(null).success).toBe(false);
  });
});
