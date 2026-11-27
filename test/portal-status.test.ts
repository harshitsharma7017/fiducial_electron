// How a portal's connection is described (shared/insurers/portal-status.ts, 27 November 2026): saved sign-in
// details are not a session, and a session's clock runs from the moment the portal opens, so
// "Signed in" waits until the page has left the insurer's sign-in page.
import { describe, expect, it } from 'vitest';
import { portalStatus } from '../src/shared/insurers/portal-status';
import type { InsurerPortalView } from '../src/shared/ipc/contract';

const PORTAL: InsurerPortalView = {
  id: 'united-india',
  displayName: 'United India',
  loginMethod: 'password-captcha',
  automation: 'autofill',
  barrier: 'captcha',
  advisorNote: '',
  loginSaved: true,
  windowOpen: false,
  lastFill: null,
  sessionEndsAt: null,
  signInPending: false,
  lastSessionEnd: null,
  blockedOrigins: [],
  recording: null,
} as unknown as InsurerPortalView;

const at = (patch: Partial<InsurerPortalView>) => portalStatus({ ...PORTAL, ...patch });
const END = '2026-11-27T18:00:00.000Z';

describe('portal status', () => {
  it('is not connected with sign-in details saved but nothing open', () => {
    expect(at({})).toEqual({ tone: 'neutral', label: 'Not connected' });
  });

  it('waits for the advisor while the page is still on the sign-in page', () => {
    expect(at({ windowOpen: true, sessionEndsAt: END, signInPending: true })).toEqual({
      tone: 'warning',
      label: 'Waiting for sign-in',
    });
  });

  it('is signed in once the page has left the sign-in page', () => {
    expect(at({ windowOpen: true, sessionEndsAt: END, signInPending: false })).toEqual({
      tone: 'success',
      label: 'Signed in',
    });
  });

  it('keeps a session whose page is not open in this window yet', () => {
    expect(at({ sessionEndsAt: END })).toEqual({ tone: 'info', label: 'Session kept' });
  });

  it('is open, without a session running (its clock not started)', () => {
    expect(at({ windowOpen: true })).toEqual({ tone: 'info', label: 'Portal open' });
  });

  it('says an expired session, and a sign-out, apart', () => {
    expect(at({ lastSessionEnd: 'expired' })).toEqual({
      tone: 'warning',
      label: 'Session expired',
    });
    expect(at({ lastSessionEnd: 'signed-out' })).toEqual({ tone: 'neutral', label: 'Signed out' });
  });

  it('a running session outranks how the last one ended', () => {
    expect(at({ windowOpen: true, sessionEndsAt: END, lastSessionEnd: 'expired' }).label).toBe(
      'Signed in',
    );
  });
});
