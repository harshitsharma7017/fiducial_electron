// A health client's quote choices (request of 24 November 2026: a quote asks only the product,
// everything else is saved in the client's details). Each insurer's request is built from the
// saved choices: a choice never saved takes the quote screens' old default, a declaration is never
// assumed, and what is required but not saved is named with where to add it. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { clientInputSchema } from '../src/shared/contracts/client';
import {
  hdfcMstFromChoices,
  hdfcRetailFromChoices,
  iciciHealthFromChoices,
  niaPaFromChoices,
  nivaRunFromChoices,
  type ClientQuoteChoices,
} from '../src/shared/contracts/client-quote';
import { nivaRunSchema } from '../src/shared/insurers/niva-health';
import { niaPaRunSchema } from '../src/shared/insurers/nia-pa';
import { hdfcMstRunSchema, hdfcRetailRunSchema } from '../src/shared/insurers/hdfc';
import { iciciApiHealthRunSchema } from '../src/shared/insurers/icici-api';

const BASE = {
  customer: { name: 'Synthetic Insured' },
  pincode: '380001',
  members: [{ relationship: 'self', age: 40 }],
} as const;

describe("a client's quote choices", () => {
  it('are saved with the client, per insurer, and refuse unknown ones', () => {
    const quoteChoices: ClientQuoteChoices = {
      'niva-bupa': { sumInsured: 2000000, years: 2, addOns: ['Safeguard'], tieredNetwork: true },
      'icici-lombard': { preExistingDisease: false },
    };
    expect(clientInputSchema.parse({ ...BASE, quoteChoices }).quoteChoices).toEqual(quoteChoices);
    expect(
      clientInputSchema.safeParse({ ...BASE, quoteChoices: { 'niva-bupa': { colour: 'red' } } })
        .success,
    ).toBe(false);
  });

  it("build Niva Bupa's run from the saved choices, with the old defaults for the rest", () => {
    const saved = nivaRunFromChoices('reassure-3', {
      'niva-bupa': { sumInsured: 2000000, years: 2, previousPolicyEndDate: '2026-12-31' },
    });
    expect(saved.ok && saved.value).toEqual({
      plan: 'reassure-3',
      sumInsured: 2000000,
      years: 2,
      addOns: [],
      tieredNetwork: false,
      medicalPractitioner: false,
      previousPolicyEndDate: '2026-12-31',
    });
    const none = nivaRunFromChoices('reassure-2', undefined);
    expect(none.ok && nivaRunSchema.parse(none.value)).toMatchObject({
      sumInsured: 500000,
      years: 1,
    });
  });

  it("build New India's PA run; never assume its declarations; Pension needs its two details", () => {
    const janta = niaPaFromChoices('janta', { 'new-india': { paSumInsured: '50000' } });
    expect(janta.ok && niaPaRunSchema.parse(janta.value.run)).toEqual({
      form: 'janta',
      sumInsured: '50000',
      status: 'earning',
      term: 1,
      excess: '0',
    });
    expect(janta.ok && [janta.value.noClaims, janta.value.noDisabilities]).toEqual([false, false]);
    const pension = niaPaFromChoices('pension', undefined);
    expect(!pension.ok && pension.missing).toEqual([
      'the monthly pension (Edit client, Additional details, New India)',
      'the organisation before retirement (Edit client, Additional details, New India)',
    ]);
    const given = niaPaFromChoices('pension', {
      'new-india': {
        monthlyPensionRupees: 20000,
        pensionOrganisation: 'Synthetic Works',
        noClaims: true,
      },
    });
    expect(given.ok && given.value.run).toEqual({
      form: 'pension',
      monthlyPensionRupees: 20000,
      organisation: 'Synthetic Works',
    });
    expect(given.ok && given.value.noClaims).toBe(true);
  });

  it("build HDFC ERGO's MST and retail runs; retail needs the advisor's SP/POSP code", () => {
    expect(hdfcMstRunSchema.parse(hdfcMstFromChoices({ 'hdfc-ergo': { mstYears: 3 } }))).toEqual({
      cover: 'family-floater',
      years: 3,
    });
    const energy = hdfcRetailFromChoices(
      'energy',
      { 'hdfc-ergo': { cover: 'family', energyPlan: 'Gold', existingSumInsured: 300000 } },
      'SYNTHETIC POSP',
    );
    // Energy is individual only, and has no sum insured in lakh.
    expect(energy.ok && hdfcRetailRunSchema.parse(energy.value)).toEqual({
      product: 'energy',
      cover: 'individual',
      years: 1,
      city: 'Mumbai',
      posp: 'SYNTHETIC POSP',
      plan: 'Gold',
      existingSumInsured: 300000,
    });
    const noPosp = hdfcRetailFromChoices('optima-secure', undefined, ' ');
    expect(!noPosp.ok && noPosp.missing[0]).toMatch(/SP\/POSP/);
  });

  it("build ICICI's health run only once the pre-existing disease question is answered", () => {
    const unanswered = iciciHealthFromChoices('elevate', undefined);
    expect(!unanswered.ok && unanswered.missing[0]).toMatch(/pre-existing disease/);
    const elevate = iciciHealthFromChoices('elevate', {
      'icici-lombard': { preExistingDisease: false, sumInsured: 1000000 },
    });
    expect(elevate.ok && iciciApiHealthRunSchema.parse(elevate.value)).toEqual({
      product: 'elevate',
      sumInsured: 1000000,
      tenure: 1,
      preExistingDisease: false,
      paymentOption: 'annual',
    });
    // Elevate is ₹5, 10 or 25 lakh only.
    const wrongSum = iciciHealthFromChoices('elevate', {
      'icici-lombard': { preExistingDisease: false, sumInsured: 2000000 },
    });
    expect(wrongSum.ok).toBe(false);
    const booster = iciciHealthFromChoices('activate-booster', {
      'icici-lombard': { preExistingDisease: true, sumInsured: 2000000, deductible: 300000 },
    });
    expect(booster.ok && iciciApiHealthRunSchema.parse(booster.value)).toMatchObject({
      deductible: 300000,
      preExistingDisease: true,
    });
  });
});
