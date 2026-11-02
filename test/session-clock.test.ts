// The 12-hour insurer session clock: when sessions start and end, and what survives a restart.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSessionClock, SESSION_HOURS, SESSION_MS } from '../src/main/insurers/session-clock';

const root = mkdtempSync(join(tmpdir(), 'fqf-session-clock-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let counter = 0;
const freshFile = (): string => join(root, `c${++counter}`, 'insurer-sessions.json');

const T0 = new Date('2026-11-02T09:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function clockAt(file: string) {
  let now = T0;
  const clock = createSessionClock(file, () => now);
  return { clock, set: (ms: number) => void (now = new Date(T0.getTime() + ms)) };
}

describe('the insurer session clock', () => {
  it('ends a session exactly 12 hours after it started', () => {
    expect(SESSION_HOURS).toBe(12);
    const { clock, set } = clockAt(freshFile());
    clock.start('bajaj-allianz');
    expect(clock.endsAt('bajaj-allianz')?.toISOString()).toBe('2026-11-02T21:00:00.000Z');
    set(SESSION_MS - 1);
    expect(clock.expired()).toEqual([]);
    set(SESSION_MS);
    expect(clock.expired()).toEqual(['bajaj-allianz']);
  });

  it('does not restart a running session when the portal is opened again', () => {
    const { clock, set } = clockAt(freshFile());
    clock.start('new-india');
    set(5 * HOUR);
    clock.start('new-india'); // opened again later: the 12 hours still count from the first open
    expect(clock.startedAt('new-india')).toEqual(T0);
  });

  it('keeps each insurer’s session separate', () => {
    const { clock, set } = clockAt(freshFile());
    clock.start('united-india');
    set(3 * HOUR);
    clock.start('icici-lombard');
    set(12 * HOUR);
    expect(clock.expired()).toEqual(['united-india']);
    clock.stop('united-india');
    expect(clock.startedAt('united-india')).toBeNull();
    expect(clock.endsAt('icici-lombard')?.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });

  it('survives an app restart, holding only insurer ids and times', () => {
    const file = freshFile();
    clockAt(file).clock.start('niva-bupa');
    const reopened = clockAt(file).clock;
    expect(reopened.startedAt('niva-bupa')).toEqual(T0);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      version: 1,
      started: { 'niva-bupa': '2026-11-02T09:00:00.000Z' },
    });
  });

  it('trusts no session from an unreadable or edited file', () => {
    const file = freshFile();
    clockAt(file).clock.start('niva-bupa');
    writeFileSync(file, '{"version":1,"started":{"niva-bupa":"tomorrow"}}');
    expect(clockAt(file).clock.startedAt('niva-bupa')).toBeNull();
    writeFileSync(file, 'not json');
    expect(clockAt(file).clock.startedAt('niva-bupa')).toBeNull();
    writeFileSync(file, '{"version":1,"started":{"evil-insurer":"2026-11-02T09:00:00.000Z"}}');
    expect(clockAt(file).clock.startedAt('evil-insurer')).toBeNull();
  });

  it('treats a start time in the future (clock moved back) as expired', () => {
    const file = freshFile();
    const later = createSessionClock(file, () => new Date(T0.getTime() + 5 * HOUR));
    later.start('tata-aig');
    expect(clockAt(file).clock.expired()).toEqual(['tata-aig']);
  });
});
