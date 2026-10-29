// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): which portal may receive a proposal,
// and the network guard's single-use creation permit.
import { describe, expect, it } from 'vitest';
import { PERMIT_TTL_MS, RequestPolicy } from '../../src/demo/portal-automation/main/network-guard';
import {
  decideMode,
  describeEnvironment,
  isProposalCreation,
  LIVE_PROPOSAL_CREATION,
  sessionEnvironmentProblem,
} from '../../src/demo/portal-automation/shared/environment';
import { portalOrigin } from '../../src/demo/portal-automation/shared/flag';

const LIVE = 'https://fiducial.spirezen.tech';
const LOCAL = 'http://localhost:3100';
const FULL = { PORTAL_AUTOMATION_FULL_WORKFLOW: '1' };

describe('the workflow mode', () => {
  it('is fill-only by default, on every portal', () => {
    for (const origin of [LIVE, LOCAL, 'https://other.example.test']) {
      expect(decideMode({}, origin)).toMatchObject({ mode: 'fill-only', fullRefused: null });
    }
    expect(decideMode({ PORTAL_AUTOMATION_FULL_WORKFLOW: '0' }, LOCAL).mode).toBe('fill-only');
  });

  it('allows the full workflow on the local portal copy', () => {
    expect(decideMode(FULL, LOCAL)).toMatchObject({
      mode: 'full',
      environment: { kind: 'test', name: 'Local portal copy (this computer)', origin: LOCAL },
    });
    expect(decideMode(FULL, 'http://127.0.0.1:3100').mode).toBe('full');
  });

  it('creates on the live portal only in live verification, and only with the flag', () => {
    expect(LIVE_PROPOSAL_CREATION).toBe('verification');
    expect(decideMode({}, portalOrigin({})).mode).toBe('fill-only');
    // Without a URL the demo opens the live portal: the full workflow is allowed there.
    expect(decideMode(FULL, portalOrigin(FULL))).toMatchObject({
      mode: 'full',
      environment: { kind: 'production', creation: 'verification' },
    });
  });

  it('with live creation off, no setting turns it on', () => {
    // The flag, and the live portal named explicitly: still fill-only, and the screen says why.
    const env = { ...FULL, PORTAL_AUTOMATION_DEMO_URL: LIVE };
    const decision = decideMode(env, portalOrigin(env), 'off');
    expect(decision.mode).toBe('fill-only');
    expect(decision.environment).toMatchObject({ kind: 'production', creation: 'off' });
    expect(decision.fullRefused).toMatch(/live portal is off in this release/);
  });

  it('allows the live portal only in the reviewed live verification, and only with the flag', () => {
    expect(decideMode(FULL, LIVE, 'verification')).toMatchObject({
      mode: 'full',
      fullRefused: null,
      environment: {
        kind: 'production',
        name: 'Fiducial portal (live)',
        creation: 'verification',
        sessionCookie: '__Host-erp_session',
      },
    });
    expect(decideMode({}, LIVE, 'verification').mode).toBe('fill-only');
    // Only the exact https origin is the live portal.
    expect(describeEnvironment('http://fiducial.spirezen.tech', 'verification').kind).toBe(
      'unrecognised',
    );
    expect(
      decideMode(FULL, 'https://fiducial.spirezen.tech.example.test', 'verification').mode,
    ).toBe('fill-only');
  });

  it('refuses an unrecognised portal and never switches to another one', () => {
    const decision = decideMode(FULL, 'https://staging.example.test');
    expect(decision).toMatchObject({
      mode: 'fill-only',
      environment: { kind: 'unrecognised', origin: 'https://staging.example.test' },
    });
    expect(decision.fullRefused).toMatch(/not an approved environment/);
    expect(decision.environment).toMatchObject({ creation: 'off', sessionCookie: null });
    // http on another host is not a local copy.
    expect(describeEnvironment('http://192.168.1.20:3100').kind).toBe('unrecognised');
  });
});

describe('the session check after sign-in', () => {
  const local = describeEnvironment(LOCAL);
  const live = describeEnvironment(LIVE, 'verification');

  it('accepts the session cookie each portal should set (cookie names only)', () => {
    expect(sessionEnvironmentProblem(['erp_session'], local)).toBeNull();
    expect(sessionEnvironmentProblem(['__Host-erp_session', 'other'], live)).toBeNull();
  });

  it('refuses a production session on the local copy, or no session', () => {
    expect(sessionEnvironmentProblem(['__Host-erp_session'], local)).toMatch(/production session/);
    expect(sessionEnvironmentProblem(['erp_session', '__Host-erp_session'], local)).toMatch(
      /production/,
    );
    expect(sessionEnvironmentProblem([], local)).toMatch(/sign in/);
  });

  it('refuses a non-production build at the live address, or no session there', () => {
    expect(sessionEnvironmentProblem(['erp_session'], live)).toMatch(/non-production/);
    expect(sessionEnvironmentProblem([], live)).toMatch(/No session for Fiducial portal \(live\)/);
  });

  it('refuses an unrecognised portal', () => {
    const other = describeEnvironment('https://other.example.test');
    expect(sessionEnvironmentProblem(['erp_session'], other)).toMatch(/not a known portal/);
  });
});

describe('the proposal-creation request', () => {
  it('is exactly POST /api/proxy/proposals on the portal', () => {
    expect(isProposalCreation('POST', `${LOCAL}/api/proxy/proposals`, LOCAL)).toBe(true);
    expect(isProposalCreation('post', `${LOCAL}/api/proxy/proposals`, LOCAL)).toBe(true);
  });

  it.each([
    ['GET', `${LOCAL}/api/proxy/proposals`],
    ['PUT', `${LOCAL}/api/proxy/proposals`],
    ['POST', `${LOCAL}/api/proxy/proposals/abc/existing-policy`],
    ['POST', `${LOCAL}/api/proxy/proposals/abc/data-sheet/import`],
    ['POST', `${LOCAL}/api/proxy/proposals?type=new`],
    ['POST', `${LOCAL}/api/proxy/clients`],
    ['POST', `${LIVE}/api/proxy/proposals`],
    ['POST', `http://user:pw@localhost:3100/api/proxy/proposals`],
  ])('is not %s %s', (method, url) => {
    expect(isProposalCreation(method, url, LOCAL)).toBe(false);
  });
});

describe('the creation permit', () => {
  const create = `${LOCAL}/api/proxy/proposals`;

  function policy() {
    let clock = 0;
    const guard = new RequestPolicy(LOCAL, () => clock);
    return { guard, advance: (ms: number) => (clock += ms) };
  }

  it('blocks proposal creation unless armed', () => {
    const { guard } = policy();
    expect(guard.evaluate('POST', create)).toEqual({ allow: false, creation: false });
    expect(guard.creationOutcome()).toEqual({ state: 'not-armed' });
    expect(guard.blocked()).toBe(1);
  });

  it('lets exactly one creation request through once armed, then blocks a duplicate', () => {
    const { guard } = policy();
    expect(guard.armCreation()).toBe(true);
    expect(guard.evaluate('POST', create)).toEqual({ allow: true, creation: true });
    expect(guard.evaluate('POST', create)).toEqual({ allow: false, creation: false });
    expect(guard.armCreation()).toBe(false); // not again while the first is pending
    guard.completed(201);
    expect(guard.creationOutcome()).toEqual({ state: 'completed', status: 201 });
  });

  it('keeps every unrelated write blocked while armed, without using the permit', () => {
    const { guard } = policy();
    guard.armCreation();
    for (const [method, url] of [
      ['POST', `${LOCAL}/api/proxy/clients`],
      ['PUT', `${LOCAL}/api/proxy/proposals/abc/data-sheet`],
      ['DELETE', `${LOCAL}/api/proxy/proposals/abc`],
      ['POST', `${LOCAL}/api/proxy/proposals/abc/existing-policy`],
      ['POST', `${LIVE}/api/proxy/proposals`],
    ] as const) {
      expect(guard.evaluate(method, url).allow).toBe(false);
    }
    expect(guard.creationOutcome()).toEqual({ state: 'armed' });
    // Reads and sign-in still pass, and the permit is still there for the real request.
    expect(guard.evaluate('GET', `${LOCAL}/api/proxy/auth/me`).allow).toBe(true);
    expect(guard.evaluate('POST', create)).toEqual({ allow: true, creation: true });
  });

  it('expires unused, after which creation is blocked again', () => {
    const { guard, advance } = policy();
    guard.armCreation();
    advance(PERMIT_TTL_MS + 1);
    expect(guard.creationOutcome()).toEqual({ state: 'expired' });
    expect(guard.evaluate('POST', create).allow).toBe(false);
  });

  it('records a network failure of the permitted request', () => {
    const { guard } = policy();
    guard.armCreation();
    guard.evaluate('POST', create);
    guard.failed();
    expect(guard.creationOutcome()).toEqual({ state: 'network-error' });
  });
});
