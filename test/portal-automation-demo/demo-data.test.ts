// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the synthetic data and the flag.
import { describe, expect, it } from 'vitest';
import {
  APPROVED_TEST_CLIENTS,
  DemoProposalSchema,
  SYNTHETIC_DEMO_PROPOSAL,
  demoDataErrors,
} from '../../src/demo/portal-automation/shared/demo-data';
import {
  DEFAULT_PORTAL_ORIGIN,
  isPortalDemoEnabled,
  portalOrigin,
} from '../../src/demo/portal-automation/shared/flag';

describe('synthetic demo data', () => {
  it('accepts the prefilled sample', () => {
    expect(DemoProposalSchema.safeParse(SYNTHETIC_DEMO_PROPOSAL).success).toBe(true);
    expect(demoDataErrors(SYNTHETIC_DEMO_PROPOSAL)).toEqual({});
  });

  it('refuses a name that is neither marked as test data nor an approved test client', () => {
    const refused = {
      insuredName:
        'Test data only: the name must contain Demo, Synthetic or Sample, or be an approved test client',
    };
    for (const insuredName of [
      'Acme Mills Pvt Ltd',
      'Deccan Cold Chain Pvt Ltd',
      'deccan cold chain llp',
    ]) {
      expect(demoDataErrors({ ...SYNTHETIC_DEMO_PROPOSAL, insuredName })).toEqual(refused);
    }
  });

  it('accepts an approved test client by its exact name, or a name marked as test data', () => {
    expect(APPROVED_TEST_CLIENTS).toEqual(['Deccan Cold Chain LLP']);
    for (const insuredName of ['Deccan Cold Chain LLP', 'Synthetic Demo Textiles Pvt Ltd']) {
      expect(demoDataErrors({ ...SYNTHETIC_DEMO_PROPOSAL, insuredName })).toEqual({});
    }
  });

  it('refuses a contact address outside example.test', () => {
    expect(
      demoDataErrors({ ...SYNTHETIC_DEMO_PROPOSAL, contactEmail: 'someone@company.com' }),
    ).toHaveProperty('contactEmail');
  });

  it('checks the dates: real, as YYYY-MM-DD, and the policy ending after it starts', () => {
    expect(
      demoDataErrors({ ...SYNTHETIC_DEMO_PROPOSAL, policyStart: '01/12/2026' }),
    ).toHaveProperty('policyStart');
    expect(
      demoDataErrors({ ...SYNTHETIC_DEMO_PROPOSAL, quotesNeededBy: '2026-02-31' }),
    ).toHaveProperty('quotesNeededBy');
    expect(
      demoDataErrors({
        ...SYNTHETIC_DEMO_PROPOSAL,
        policyEnd: SYNTHETIC_DEMO_PROPOSAL.policyStart,
      }),
    ).toEqual({ policyEnd: 'The policy must end after it starts' });
  });

  it('takes sums insured as whole rupees, or blank', () => {
    const risk = { ...SYNTHETIC_DEMO_PROPOSAL.risk, stockSumInsured: '50,00,000' };
    expect(demoDataErrors({ ...SYNTHETIC_DEMO_PROPOSAL, risk })).toHaveProperty(
      'risk.stockSumInsured',
    );
    const blank = { ...SYNTHETIC_DEMO_PROPOSAL.risk, stockSumInsured: '' };
    expect(demoDataErrors({ ...SYNTHETIC_DEMO_PROPOSAL, risk: blank })).toEqual({});
  });

  it('rejects fields it does not know', () => {
    expect(DemoProposalSchema.safeParse({ ...SYNTHETIC_DEMO_PROPOSAL, pan: 'X' }).success).toBe(
      false,
    );
  });
});

describe('the demo flag', () => {
  it('is off unless ENABLE_PORTAL_AUTOMATION_DEMO is 1 or true', () => {
    expect(isPortalDemoEnabled({})).toBe(false);
    expect(isPortalDemoEnabled({ ENABLE_PORTAL_AUTOMATION_DEMO: '' })).toBe(false);
    expect(isPortalDemoEnabled({ ENABLE_PORTAL_AUTOMATION_DEMO: '0' })).toBe(false);
    expect(isPortalDemoEnabled({ ENABLE_PORTAL_AUTOMATION_DEMO: 'yes' })).toBe(false);
    expect(isPortalDemoEnabled({ ENABLE_PORTAL_AUTOMATION_DEMO: '1' })).toBe(true);
    expect(isPortalDemoEnabled({ ENABLE_PORTAL_AUTOMATION_DEMO: 'TRUE' })).toBe(true);
  });

  it('opens the internal portal unless an https address or a local copy is given', () => {
    expect(portalOrigin({})).toBe(DEFAULT_PORTAL_ORIGIN);
    expect(portalOrigin({ PORTAL_AUTOMATION_DEMO_URL: 'http://localhost:3100/x' })).toBe(
      'http://localhost:3100',
    );
    expect(portalOrigin({ PORTAL_AUTOMATION_DEMO_URL: 'https://staging.example.test' })).toBe(
      'https://staging.example.test',
    );
    expect(portalOrigin({ PORTAL_AUTOMATION_DEMO_URL: 'http://portal.example.test' })).toBe(
      DEFAULT_PORTAL_ORIGIN,
    );
    expect(portalOrigin({ PORTAL_AUTOMATION_DEMO_URL: 'not a url' })).toBe(DEFAULT_PORTAL_ORIGIN);
  });
});
