// LOG-01: forbidden fields and free text can never be logged.
import { describe, expect, it } from 'vitest';
import {
  createLogger,
  type LogEvent,
  type LogFields,
  type LogRecord,
} from '../src/main/logging/logger';

function capture() {
  const records: LogRecord[] = [];
  const logger = createLogger([(r) => records.push(r)], () => new Date('2026-10-27T00:00:00Z'));
  return { logger, records };
}

const SECRETS = ['hunter2', '123456', 'sessionid=abc', 'Bearer eyJ', 'Asha Verma', '9876543210'];

describe('allowlist logger', () => {
  it('records allowed fields with valid values', () => {
    const { logger, records } = capture();
    logger.info('ipc.call', {
      channel: 'app:get-info',
      outcome: 'ok',
      durationMs: 3,
      correlationId: 'abcdef12-34',
    });
    expect(records).toEqual([
      {
        ts: '2026-10-27T00:00:00.000Z',
        level: 'info',
        event: 'ipc.call',
        channel: 'app:get-info',
        outcome: 'ok',
        durationMs: 3,
        correlationId: 'abcdef12-34',
      },
    ]);
  });

  it('drops forbidden field names and counts them without writing their values', () => {
    const { logger, records } = capture();
    const smuggled = {
      password: 'hunter2',
      otp: '123456',
      cookie: 'sessionid=abc',
      authorization: 'Bearer eyJ',
      customerName: 'Asha Verma',
      phone: '9876543210',
      message: 'free text',
    } as unknown as LogFields;
    logger.warn('ipc.call', smuggled);
    expect(records[0]!.droppedFields).toBe(7);
    const text = JSON.stringify(records);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it('drops allowed field names carrying free text, URLs or wrong types', () => {
    const { logger, records } = capture();
    logger.info('security.navigation-blocked', {
      targetScheme: 'https://bank.example/?token=hunter2',
      permission: 'media please',
      correlationId: 'not a correlation id',
      durationMs: -5,
    });
    expect(records[0]!.droppedFields).toBe(4);
    expect(JSON.stringify(records)).not.toMatch(/hunter2|bank\.example|please/);
  });

  it('replaces an unknown event name instead of writing it', () => {
    const { logger, records } = capture();
    logger.info('user typed: hunter2' as LogEvent);
    expect(records[0]!.event).toBe('log.invalid-event');
    expect(JSON.stringify(records)).not.toContain('hunter2');
  });

  it('survives a failing sink', () => {
    const records: LogRecord[] = [];
    const logger = createLogger([
      () => {
        throw new Error('disk full');
      },
      (r) => records.push(r),
    ]);
    expect(() => logger.info('app.ready')).not.toThrow();
    expect(records).toHaveLength(1);
  });
});
