import { describe, expect, it } from 'vitest';
import { findUnsafeLaunchOptions } from '../src/shared/launch-guard';

describe('findUnsafeLaunchOptions', () => {
  it('accepts a normal launch', () => {
    expect(findUnsafeLaunchOptions(['/app', '--spike=s1', '--out=/tmp/x'], {}, 'darwin')).toEqual(
      [],
    );
  });

  it.each([
    ['--remote-debugging-port=9222', '--remote-debugging-port'],
    ['--remote-debugging-pipe', '--remote-debugging-pipe'],
    ['-remote-debugging-port=9222', '--remote-debugging-port'],
    ['--inspect', '--inspect'],
    ['--inspect=9229', '--inspect'],
    ['--inspect-brk=0', '--inspect-brk'],
    ['--js-flags=--expose-gc', '--js-flags'],
  ])('rejects %s', (arg, name) => {
    expect(findUnsafeLaunchOptions(['/app', arg], {}, 'darwin')).toEqual([name]);
  });

  it('treats Windows-style and mixed-case switches as unsafe on win32 only', () => {
    expect(findUnsafeLaunchOptions(['/Remote-Debugging-Port=1'], {}, 'win32')).toEqual([
      '--remote-debugging-port',
    ]);
    expect(findUnsafeLaunchOptions(['/remote-debugging-port=1'], {}, 'darwin')).toEqual([]);
  });

  it('rejects an inspector requested through NODE_OPTIONS without echoing its value', () => {
    const found = findUnsafeLaunchOptions(
      ['/app'],
      { NODE_OPTIONS: '--max-old-space-size=4096 --inspect=9230' },
      'darwin',
    );
    expect(found).toEqual(['NODE_OPTIONS(--inspect*)']);
  });

  it('does not confuse similarly named safe switches', () => {
    expect(findUnsafeLaunchOptions(['--inspector-theme=dark', '--spike=s1'], {}, 'darwin')).toEqual(
      [],
    );
  });
});
