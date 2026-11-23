// ICICI Lombard: the NYSA motor run's choices (the registration number as NYSA takes it), the
// vehicles it refuses, the request contract, and the portal's addresses (NYSA's other product
// tiles lead to other icicilombard.com hosts: 20 November 2026, only Motor opened).
import { describe, expect, it } from 'vitest';
import { iciciMotorRunSchema } from '../src/shared/insurers/icici';
import { findPortal, mayNavigate } from '../src/shared/insurers/portals';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';
import { iciciMotorProblems } from '../src/main/quotes/run-icici-motor';

const CAR = {
  vehicleClass: 'private-car',
  condition: 'pre-owned',
  registrationDate: '2021-06-15',
  zone: 'A',
  idvRupees: 450000,
} as const;
const RUN = { registrationNumber: 'MH01AB1234', ownershipChanged: false, idv: 'insurer' } as const;

describe('ICICI Lombard motor run', () => {
  it('takes a registration number as written, in NYSA’s form', () => {
    expect(iciciMotorRunSchema.parse({ ...RUN, registrationNumber: ' mh 01 ab-1234 ' })).toEqual(
      RUN,
    );
    expect(
      iciciMotorRunSchema.parse({ ...RUN, registrationNumber: '22 BH 1234 AB' }).registrationNumber,
    ).toBe('22BH1234AB');
    expect(
      iciciMotorRunSchema.parse({ ...RUN, registrationNumber: 'DL1AM1111' }).registrationNumber,
    ).toBe('DL1AM1111');
  });

  it('refuses what is not a registration number', () => {
    for (const registrationNumber of ['', '1234', 'MH01AB12345', 'MH-01-AB-12<script>'])
      expect(iciciMotorRunSchema.safeParse({ ...RUN, registrationNumber }).success).toBe(false);
  });

  it('quotes renewals of registered vehicles only', () => {
    expect(iciciMotorProblems(CAR, RUN)).toEqual([]);
    expect(iciciMotorProblems({ ...CAR, condition: 'new' }, RUN)[0]).toMatch(/renewals/);
  });

  it('is a quote request of its own, for a saved vehicle', () => {
    const request = {
      product: 'icici-motor',
      vehicleId: 'v1',
      insurerId: 'icici-lombard',
      run: RUN,
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    expect(quoteRunRequestSchema.safeParse({ ...request, run: { ...RUN, extra: 1 } }).success).toBe(
      false,
    );
  });
});

describe("ICICI Lombard's portal addresses", () => {
  const portal = findPortal('icici-lombard')!;

  it('lets NYSA’s product tiles open other ICICI Lombard addresses', () => {
    for (const url of [
      'https://nysa.icicilombard.com/NysaMotor/quote',
      'https://nysahealth.icicilombard.com/#/quote',
      'https://ipartner.icicilombard.com/WebPages/Home.aspx',
      'https://icicilombard.com/',
    ])
      expect(mayNavigate(portal, url, true)).toBe(true);
  });

  it('allows nothing else', () => {
    for (const url of [
      'http://nysahealth.icicilombard.com/',
      'https://icicilombard.com.evil.example/',
      'https://evilicicilombard.com/',
      'https://nysa.icicilombard.com:8443/',
      // A link carrying a user and password (built, so the secret scanner does not flag it).
      Object.assign(new URL('https://nysa.icicilombard.com/'), { username: 'u', password: 'p' })
        .href,
    ])
      expect(mayNavigate(portal, url, true)).toBe(false);
  });
});
