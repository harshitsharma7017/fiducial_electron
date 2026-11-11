// Form recordings keep structure only: the redaction rules every captured string passes through.
import { describe, expect, it, vi } from 'vitest';
import { sanitise } from '../src/main/insurers/form-recorder';
import {
  bodyEmptyFieldNames,
  bodyFieldNames,
  redactChoice,
  redactText,
  redactUrl,
} from '../src/shared/insurers/recording';

vi.mock('electron', () => ({}));

describe('redactText', () => {
  it('masks phone, ID and policy numbers and emails, keeps amounts and ages, bounds length', () => {
    expect(redactText('Minimum sum insured is 300000; maximum 10000000')).toBe(
      'Minimum sum insured is 300000; maximum ########',
    );
    expect(redactText('Age 65, pincode 560001, agent 88812345')).toBe(
      'Age 65, pincode 560001, agent ########',
    );
    expect(redactText('Agent FIDUINSB00 code 9876543210 (policy 1234-5678-90)')).toBe(
      'Agent FIDUINSB00 code ########## (policy ##########)',
    );
    expect(redactText('Mail rk.sharma@example.test now')).toBe('Mail <email> now');
    expect(redactText('Premium ₹ 12,345 for age 42')).toBe('Premium ₹ 12,345 for age 42');
    expect(redactText('  a \n  b  ')).toBe('a b');
    expect(redactText('x'.repeat(500), 10)).toHaveLength(10);
  });
});

describe('redactChoice (the portal’s own option values)', () => {
  it('keeps digits, still masks emails', () => {
    expect(redactChoice('1000000')).toBe('1000000');
    expect(redactChoice('10 Lakh (1000000)')).toBe('10 Lakh (1000000)');
    expect(redactChoice('help@insurer.example')).toBe('<email>');
  });
});

describe('redactUrl', () => {
  it('keeps origin, path and route; parameter names only', () => {
    expect(
      redactUrl(
        'https://www.uiic.in/GCWebPortal/quote/QuoteAction.do?p=health&custId=88812345&name=Ravi',
      ),
    ).toBe('https://www.uiic.in/GCWebPortal/quote/QuoteAction.do?p=…&custId=…&name=…');
    expect(redactUrl('https://nysa.icicilombard.com/#/quote?mobile=9876543210')).toBe(
      'https://nysa.icicilombard.com/#/quote?mobile=…',
    );
    expect(redactUrl('https://x.example/proposal/123456789/view')).toBe(
      'https://x.example/proposal/#####/view',
    );
    expect(redactUrl('https://x.example/a;jsessionid=ABC123/b')).toBe('https://x.example/a/b');
    expect(redactUrl('not a url')).toBe('<invalid>');
  });
});

describe('bodyFieldNames', () => {
  it('lists field names of form and JSON bodies, never values', () => {
    expect(
      bodyFieldNames(
        'name=Ravi+K&dob=01%2F02%2F1980&si=500000',
        'application/x-www-form-urlencoded',
      ),
    ).toEqual(['name', 'dob', 'si']);
    const json = JSON.stringify({
      proposer: { name: 'Ravi', dob: '1980-02-01' },
      members: [{ age: 40 }],
      si: 500000,
    });
    const names = bodyFieldNames(json, 'application/json');
    expect(names).toEqual([
      'proposer',
      'proposer.name',
      'proposer.dob',
      'members',
      'members[].age',
      'si',
    ]);
    expect(JSON.stringify(names)).not.toMatch(/Ravi|1980|500000/);
    expect(bodyFieldNames('\u0000\u0001binary', '')).toBeNull();
  });
});

describe('bodyEmptyFieldNames', () => {
  it('names the fields sent empty, never any value', () => {
    expect(
      bodyEmptyFieldNames(
        'name=Ravi&ynHealthy=&si=500000&note=',
        'application/x-www-form-urlencoded',
      ),
    ).toEqual(['ynHealthy', 'note']);
    const json = JSON.stringify({
      bean: { name: 'Ravi', ynDailyCash: '', age: 0, ok: false, spouse: null },
      members: [{ yn: '' }, { yn: 'No' }],
    });
    const names = bodyEmptyFieldNames(json, 'application/json');
    expect(names).toEqual(['bean.ynDailyCash', 'members[0].yn']);
    expect(JSON.stringify(names)).not.toMatch(/Ravi|No/);
    expect(bodyEmptyFieldNames('\u0000\u0001binary', '')).toBeNull();
  });
});

describe('sanitise (applied to everything the recorder keeps)', () => {
  it('redacts text, addresses and leaves the portal’s choices readable', () => {
    const out = sanitise({
      url: 'https://p.example/q?mobile=9876543210',
      label: 'Mobile 9876543210',
      options: [{ value: '1000000', text: '10 Lakh' }],
      option: { value: '500000', text: '5 Lakh' },
      value: '1000000',
      nested: [{ context: 'Contact rk@example.test' }],
    });
    expect(out).toEqual({
      url: 'https://p.example/q?mobile=…',
      label: 'Mobile ##########',
      options: [{ value: '1000000', text: '10 Lakh' }],
      option: { value: '500000', text: '5 Lakh' },
      value: '1000000',
      nested: [{ context: 'Contact <email>' }],
    });
  });
});
