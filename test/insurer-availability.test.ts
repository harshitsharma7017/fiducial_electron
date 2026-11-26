// Insurers paused in the app (request of 26 November 2026: New India, Star Health and Tata AIG
// taken out "such that they can be brought back any time"): one list, read everywhere; a paused
// insurer's quote is refused before anything is touched.
import { describe, expect, it } from 'vitest';
import {
  isInsurerNamePaused,
  isInsurerPaused,
  isPagePaused,
  PAUSED_INSURERS,
} from '../src/shared/insurers/availability';
import { INSURER_PORTALS } from '../src/shared/insurers/portals';
import { createQuoteService } from '../src/main/quotes/service';
import { createLogger } from '../src/main/logging/logger';

describe('paused insurers', () => {
  it('are New India, Star Health and Tata AIG, all known insurers', () => {
    expect([...PAUSED_INSURERS].sort()).toEqual(['new-india', 'star-health', 'tata-aig']);
    for (const id of PAUSED_INSURERS) {
      expect(INSURER_PORTALS.some((p) => p.id === id)).toBe(true);
    }
    expect(isInsurerPaused('united-india')).toBe(false);
  });

  it('are known by the names the screens show', () => {
    expect(isInsurerNamePaused('New India Assurance')).toBe(true);
    expect(isInsurerNamePaused('New India')).toBe(true);
    expect(isInsurerNamePaused('Star Health')).toBe(true);
    expect(isInsurerNamePaused('United India')).toBe(false);
    expect(isInsurerNamePaused('ICICI Lombard')).toBe(false);
  });

  it('take the pages quoted with New India only with them', () => {
    expect(isPagePaused('rural')).toBe(true);
    expect(isPagePaused('marine')).toBe(true);
    expect(isPagePaused('properties')).toBe(true);
    expect(isPagePaused('clients')).toBe(false);
    expect(isPagePaused('vehicles')).toBe(false);
  });

  it("refuse a paused insurer's quote before anything is read or touched", async () => {
    const touched: string[] = [];
    const service = createQuoteService({
      enabled: true,
      clients: {
        get: () => {
          touched.push('client');
          return Promise.reject(new Error('not read'));
        },
      } as never,
      windowsOf: () => {
        touched.push('windows');
        return [];
      },
      logger: createLogger([]),
    });
    const result = await service.run({
      product: 'nia-health',
      clientId: '00000000-0000-4000-8000-000000000000',
      insurerId: 'new-india',
      policy: 'arogya-sanjeevani',
      goodHealthConfirmed: true,
    });
    expect(result).toMatchObject({ outcome: 'refused' });
    expect(result.message).toContain('New India Assurance is paused');
    expect(touched).toEqual([]);
  });
});
