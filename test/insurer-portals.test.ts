// Insurer portal registry and its pure rules: where a login form may be filled, and where a
// portal window may navigate.
import { describe, expect, it } from 'vitest';
import {
  findPortal,
  INSURER_PORTALS,
  insurerPortalSchema,
  mayFillLogin,
  mayNavigate,
  usesSavedLogin,
  type InsurerPortal,
} from '../src/shared/insurers/portals';

function portal(id: string): InsurerPortal {
  const found = findPortal(id);
  if (!found) throw new Error(`no portal ${id}`);
  return found;
}

describe('the insurer portal registry', () => {
  it('lists the eight insurers Fiducial named, once each', () => {
    expect(INSURER_PORTALS.map((p) => p.id).sort()).toEqual([
      'bajaj-allianz',
      'hdfc-ergo',
      'icici-lombard',
      'new-india',
      'niva-bupa',
      'star-health',
      'tata-aig',
      'united-india',
    ]);
  });

  it('uses saved sign-in details for the six password portals', () => {
    expect(
      INSURER_PORTALS.filter(usesSavedLogin)
        .map((p) => p.id)
        .sort(),
    ).toEqual([
      'bajaj-allianz',
      'hdfc-ergo',
      'icici-lombard',
      'new-india',
      'niva-bupa',
      'united-india',
    ]);
    // HDFC ERGO draws its page on a canvas: filled by keyboard after the advisor's click.
    expect(portal('hdfc-ergo')).toMatchObject({ loginMethod: 'password', automation: 'shortcut' });
    expect(portal('hdfc-ergo').form).toBeUndefined();
  });

  it('leaves the OTP portals (Star Health, Tata AIG) for later', () => {
    for (const id of ['star-health', 'tata-aig']) {
      expect(portal(id)).toMatchObject({ loginMethod: 'otp', automation: 'later', barrier: 'otp' });
      expect(portal(id).form).toBeUndefined();
    }
  });

  it('holds no sign-in details, only addresses and selectors', () => {
    const text = JSON.stringify(INSURER_PORTALS);
    // The user IDs Fiducial shared must never be written into the registry.
    for (const fragment of [
      'FIDU',
      'BR_FID',
      'FIDUCIAL.POS',
      'LC00000',
      'IM-80',
      'BR039',
      '@fiducial',
      '@brbajaj',
    ]) {
      expect(text.toUpperCase()).not.toContain(fragment.toUpperCase());
    }
  });

  it('rejects inconsistent entries', () => {
    const good = portal('bajaj-allianz');
    const bad: unknown[] = [
      { ...good, startUrl: 'http://partner.bajajgeneral.com/' },
      { ...good, startUrl: 'https://user:pw@partner.bajajgeneral.com/' },
      { ...good, loginOrigin: 'https://evil.example' },
      { ...good, allowedOrigins: ['https://auth.prod.bajajgeneral.com'] },
      { ...good, automation: 'manual' }, // has a form but would not use it
      { ...portal('hdfc-ergo'), automation: 'autofill' }, // autofill without a form
      { ...portal('hdfc-ergo'), shortcutPages: undefined }, // shortcut without its pages
      { ...portal('star-health'), automation: 'shortcut', shortcutPages: [{ path: '/' }] }, // OTP
      { ...good, loginMethod: 'otp' }, // OTP is never filled
      { ...good, form: { ...good.form, username: 'input{color:red}' } },
      { ...good, extra: true },
    ];
    for (const entry of bad) expect(insurerPortalSchema.safeParse(entry).success).toBe(false);
    expect(insurerPortalSchema.safeParse(good).success).toBe(true);
  });
});

describe('mayFillLogin', () => {
  it.each([
    ['united-india', 'https://www.uiic.in/GCWebPortal/login/LoginAction.do?p=login'],
    ['united-india', 'https://www.uiic.in/GCWebPortal/login/LoginAction.do'],
    ['new-india', 'https://web.newindia.co.in/NIABancsPortal/IntermediaryLogin.html'],
    ['icici-lombard', 'https://nysa.icicilombard.com/#/login'],
    ['icici-lombard', 'https://nysa.icicilombard.com/#/login?returnUrl=%2Fhome'],
    ['hdfc-ergo', 'https://1up.hdfcergo.com/'],
    ['niva-bupa', 'https://uno.nivabupa.com/uno/#/login'],
    [
      'bajaj-allianz',
      'https://auth.prod.bajajgeneral.com/auth/realms/Bagic/protocol/openid-connect/auth?client_id=PartnerPortal&state=x',
    ],
    [
      'bajaj-allianz',
      'https://auth.prod.bajajgeneral.com/auth/realms/Bagic/login-actions/authenticate?session_code=x',
    ],
  ])('fills on the login page of %s', (id, url) => {
    expect(mayFillLogin(portal(id), url)).toBe(true);
  });

  it.each([
    // Another page of the same portal (after sign-in, for example a change-password page).
    ['united-india', 'https://www.uiic.in/GCWebPortal/home/HomeAction.do'],
    ['icici-lombard', 'https://nysa.icicilombard.com/#/dashboard'],
    ['icici-lombard', 'https://nysa.icicilombard.com/#/loginhistory'],
    ['niva-bupa', 'https://uno.nivabupa.com/uno/#/home'],
    ['bajaj-allianz', 'https://partner.bajajgeneral.com/'],
    // Look-alike and downgraded origins.
    ['united-india', 'http://www.uiic.in/GCWebPortal/login/LoginAction.do'],
    ['united-india', 'https://uiic.in/GCWebPortal/login/LoginAction.do'],
    ['united-india', 'https://www.uiic.in.evil.example/GCWebPortal/login/LoginAction.do'],
    ['united-india', 'https://www.uiic.in:8443/GCWebPortal/login/LoginAction.do'],
    ['united-india', 'https://x:y@www.uiic.in/GCWebPortal/login/LoginAction.do'],
    ['icici-lombard', 'https://evil.example/#/login'],
    // Other pages of the canvas portal, and portals without a fillable form.
    ['hdfc-ergo', 'https://1up.hdfcergo.com/home'],
    ['star-health', 'https://atompro.starhealth.in/sso/login'],
    ['tata-aig', 'https://sellonline.tataaig.com/ipdsv2/login/#/login'],
    ['united-india', 'not a url'],
  ])('refuses %s at %s', (id, url) => {
    expect(mayFillLogin(portal(id), url)).toBe(false);
  });
});

describe('mayNavigate', () => {
  it('keeps the main frame on the insurer’s own origins', () => {
    const bajaj = portal('bajaj-allianz');
    expect(mayNavigate(bajaj, 'https://partner.bajajgeneral.com/home', true)).toBe(true);
    expect(mayNavigate(bajaj, 'https://auth.prod.bajajgeneral.com/auth/x', true)).toBe(true);
    expect(mayNavigate(bajaj, 'https://evil.example/', true)).toBe(false);
    expect(mayNavigate(bajaj, 'http://partner.bajajgeneral.com/', true)).toBe(false);
    expect(mayNavigate(bajaj, 'file:///etc/hosts', true)).toBe(false);
    expect(mayNavigate(bajaj, 'about:blank', true)).toBe(false);
  });

  it('lets only sub-frames reach the CAPTCHA provider, and only for that insurer', () => {
    const recaptcha = 'https://www.google.com/recaptcha/api2/anchor?k=x';
    expect(mayNavigate(portal('new-india'), recaptcha, false)).toBe(true);
    expect(mayNavigate(portal('new-india'), recaptcha, true)).toBe(false);
    expect(mayNavigate(portal('united-india'), recaptcha, false)).toBe(false);
  });

  it('allows blank sub-frames, which pages create for their own use', () => {
    expect(mayNavigate(portal('new-india'), 'about:blank', false)).toBe(true);
    expect(mayNavigate(portal('new-india'), 'about:srcdoc', false)).toBe(true);
    expect(mayNavigate(portal('new-india'), 'javascript:alert(1)', false)).toBe(false);
    expect(mayNavigate(portal('new-india'), 'data:text/html,x', false)).toBe(false);
  });
});
