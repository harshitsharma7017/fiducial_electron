// Normalises an insurer result from an adapter or manual entry. Deterministic and pure. Amount
// texts are parsed strictly; a failure is recorded as a reason code and the amount stays null.
// Nothing missing is filled in: absent amounts stay null and absent terms become `unknown`.
import { COVERAGE_TERM_NAMES, type CoverageTerms } from '../contracts/coverage';
import { type Validated, parseWith } from '../contracts/issues';
import {
  type AmountInput,
  type NormalizedResult,
  insurerResultInputSchema,
} from '../contracts/quote';
import { parseInrAmount } from '../money';

type AmountField = NormalizedResult['amountIssues'][number]['field'];

export function normalizeResult(input: unknown): Validated<NormalizedResult> {
  const parsed = parseWith(insurerResultInputSchema, input);
  if (!parsed.ok) return parsed;
  const raw = parsed.value;

  const amountIssues: NormalizedResult['amountIssues'] = [];
  const amount = (field: AmountField, value: AmountInput | undefined): number | null => {
    if (value === undefined) return null;
    if ('paise' in value) return value.paise;
    const result = parseInrAmount(value.text);
    if (result.ok) return result.paise;
    amountIssues.push({ field, reason: result.reason });
    return null;
  };

  const inputTerms = raw.coverage?.terms ?? {};
  const terms = Object.fromEntries(
    COVERAGE_TERM_NAMES.map((name) => [name, inputTerms[name] ?? { status: 'unknown' }]),
  ) as CoverageTerms;
  if (terms.addOns.status === 'known') {
    terms.addOns = { status: 'known', value: [...new Set(terms.addOns.value)].sort() };
  }

  return {
    ok: true,
    value: {
      resultId: raw.resultId,
      insurerId: raw.insurerId,
      status: raw.status,
      source: raw.source,
      retrievedAt: raw.retrievedAt,
      planLabel: raw.planLabel ?? null,
      currency: raw.currency ?? null,
      premium: {
        totalPaise: amount('premium.total', raw.premium?.total),
        basePaise: amount('premium.base', raw.premium?.base),
        gstPaise: amount('premium.gst', raw.premium?.gst),
        basis: raw.premium?.basis ?? 'unknown',
      },
      sumInsuredPaise: amount('coverage.sumInsured', raw.coverage?.sumInsured),
      coverType: raw.coverage?.coverType ?? null,
      tenureYears: raw.coverage?.tenureYears ?? null,
      members: raw.coverage?.members ?? null,
      terms,
      reviewFlags: [...new Set(raw.reviewFlags ?? [])].sort(),
      amountIssues,
      errorCode: raw.errorCode ?? null,
      evidenceRef: raw.evidenceRef ?? null,
    },
  };
}
