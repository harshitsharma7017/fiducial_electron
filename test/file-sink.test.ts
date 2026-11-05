// The support log file (src/main/logging/file-sink.ts): one JSON line per allowlisted record,
// owner-only, rotated by size keeping a few old files, and never throwing.
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileSink, LOG_FILE } from '../src/main/logging/file-sink';
import { createLogger } from '../src/main/logging/logger';

describe('the support log file', () => {
  it('writes the logger’s allowlisted records as JSON lines, owner-only', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'fqf-log-')), 'logs');
    const logger = createLogger([fileSink(dir)]);
    logger.info('app.start', { appVersion: '1.0.0', packaged: true });
    logger.error('app.unhandled-error', { errorKind: 'exception', errorName: 'TypeError' });
    // A field outside the allowlist never reaches the file.
    logger.info('client.saved', { name: 'Synthetic Client' } as never);
    const lines = readFileSync(join(dir, LOG_FILE), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.map((l) => l.event)).toEqual(['app.start', 'app.unhandled-error', 'client.saved']);
    expect(lines[1]).toMatchObject({ errorKind: 'exception', errorName: 'TypeError' });
    expect(JSON.stringify(lines)).not.toContain('Synthetic Client');
    if (process.platform !== 'win32') {
      expect(statSync(join(dir, LOG_FILE)).mode & 0o777).toBe(0o600);
      expect(statSync(dir).mode & 0o777).toBe(0o700);
    }
  });

  it('rotates by size, keeping a few old files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fqf-log-'));
    const sink = fileSink(dir, { maxBytes: 200, keep: 2 });
    for (let i = 0; i < 40; i += 1) sink({ ts: `t${i}`, level: 'info', event: 'app.start' });
    expect(readdirSync(dir).sort()).toEqual(['fqf.1.log', 'fqf.2.log', 'fqf.log']);
    expect(statSync(join(dir, LOG_FILE)).size).toBeLessThan(400);
  });

  it('never throws when the log cannot be written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fqf-log-'));
    const blocker = join(dir, 'not-a-folder');
    writeFileSync(blocker, 'x');
    const sink = fileSink(join(blocker, 'logs'));
    expect(() => sink({ ts: 't', level: 'info', event: 'app.start' })).not.toThrow();
  });
});
