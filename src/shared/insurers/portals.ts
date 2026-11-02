// Insurer portal registry: where each insurer's portal is, how its advisor signs in, and how the
// app may help. Pure data and pure checks; the main process opens and fills the portals.
//
// Source: the insurer list and login types from Fiducial (2 November 2026), and a read-only
// inspection of each public login page on 2 November 2026 (no credentials, nothing typed, clicked
// or submitted). The selectors below are what those pages showed; a portal can change them at any
// time, in which case the app reports the field as not found and the advisor signs in by hand.
//
// What the app does at sign-in (login automation, phase 1):
// - "autofill": fills the saved user ID and password into the portal's own form. It never clicks
//   the sign-in button and never touches a CAPTCHA: the advisor completes the CAPTCHA (if any) and
//   signs in.
// - "manual": opens the portal; the advisor signs in by hand (HDFC ERGO draws its page on a
//   canvas, so there are no form fields to fill).
// - "later": OTP sign-in (Star Health, Tata AIG), not automated yet; the portal opens for manual
//   sign-in.
// User IDs and passwords are never part of this file: they live in the encrypted vault.
import { z } from 'zod';
import { insurerIdSchema } from '../contracts/insurer';

export const LOGIN_METHODS = ['password', 'otp'] as const;
export const LOGIN_AUTOMATION = ['autofill', 'manual', 'later'] as const;
export const LOGIN_BARRIERS = [
  'none',
  'image-captcha',
  'canvas-captcha',
  'recaptcha',
  'otp',
  'unknown',
] as const;

export type LoginMethod = (typeof LOGIN_METHODS)[number];
export type LoginAutomation = (typeof LOGIN_AUTOMATION)[number];
export type LoginBarrier = (typeof LOGIN_BARRIERS)[number];

/** An https origin with no path, query or credentials, for example `https://portal.example`. */
const httpsOrigin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  } catch {
    return false;
  }
}, 'an https origin');

const httpsUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}, 'an https URL without credentials');

/** True if `value` holds a control character (U+0000 to U+001F, or U+007F). */
export function hasControlCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A CSS selector: printable, short, no braces (never a style block). */
const selector = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !hasControlCharacter(value) && !/[{}]/.test(value), 'a plain selector');

/** Where the login form lives: exact path, and optionally a hash prefix for single-page apps. */
const loginPageSchema = z.strictObject({
  path: z.string().regex(/^\/[^\s?#]*$/),
  hashPrefix: z
    .string()
    .regex(/^#[^\s]*$/)
    .optional(),
});

const loginFormSchema = z.strictObject({
  username: selector,
  password: selector,
  /** The CAPTCHA box, focused after filling so the advisor can type straight away. */
  captcha: selector.optional(),
  /** Pages the form may be filled on. Fill is refused anywhere else on the portal. */
  pages: z.array(loginPageSchema).min(1).max(5),
});

export const insurerPortalSchema = z
  .strictObject({
    id: insurerIdSchema,
    displayName: z.string().min(1).max(80),
    /** The address the portal opens at (may redirect, within allowedOrigins). */
    startUrl: httpsUrl,
    /** The only origin the login form may be filled on. */
    loginOrigin: httpsOrigin,
    /** Origins the portal window may navigate to. */
    allowedOrigins: z.array(httpsOrigin).min(1).max(10),
    /** Extra origins allowed in sub-frames only (for example a CAPTCHA provider). */
    subframeOrigins: z.array(httpsOrigin).max(5),
    loginMethod: z.enum(LOGIN_METHODS),
    automation: z.enum(LOGIN_AUTOMATION),
    barrier: z.enum(LOGIN_BARRIERS),
    form: loginFormSchema.optional(),
    /** Date the login page was last inspected, or null if never. */
    inspectedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    /** Shown to the advisor next to the portal. */
    advisorNote: z.string().max(240),
  })
  .refine((p) => p.allowedOrigins.includes(p.loginOrigin), 'loginOrigin must be allowed')
  .refine((p) => p.allowedOrigins.includes(new URL(p.startUrl).origin), 'startUrl must be allowed')
  .refine((p) => (p.automation === 'autofill') === (p.form !== undefined), 'autofill needs a form')
  .refine((p) => p.loginMethod === 'password' || p.automation !== 'autofill', 'OTP is not filled');

export type InsurerPortal = z.infer<typeof insurerPortalSchema>;

const PORTALS: readonly InsurerPortal[] = [
  {
    id: 'united-india',
    displayName: 'United India',
    startUrl: 'https://www.uiic.in/GCWebPortal/login/LoginAction.do?p=login',
    loginOrigin: 'https://www.uiic.in',
    allowedOrigins: ['https://www.uiic.in'],
    subframeOrigins: [],
    loginMethod: 'password',
    automation: 'autofill',
    barrier: 'image-captcha',
    form: {
      username: '#username',
      password: '#password',
      captcha: '#userCaptcha',
      pages: [{ path: '/GCWebPortal/login/LoginAction.do' }],
    },
    inspectedOn: '2026-11-02',
    advisorNote: 'Type the CAPTCHA shown on the page, then press LOGIN.',
  },
  {
    id: 'new-india',
    displayName: 'New India Assurance',
    startUrl: 'https://web.newindia.co.in/NIABancsPortal/IntermediaryLogin.html',
    loginOrigin: 'https://web.newindia.co.in',
    allowedOrigins: ['https://web.newindia.co.in'],
    subframeOrigins: ['https://www.google.com'],
    loginMethod: 'password',
    automation: 'autofill',
    barrier: 'recaptcha',
    form: {
      username: '#userName',
      password: '#password',
      pages: [{ path: '/NIABancsPortal/IntermediaryLogin.html' }],
    },
    inspectedOn: '2026-11-02',
    advisorNote: 'Tick "I’m not a robot", then press Login.',
  },
  {
    id: 'hdfc-ergo',
    displayName: 'HDFC ERGO',
    startUrl: 'https://1up.hdfcergo.com/',
    loginOrigin: 'https://1up.hdfcergo.com',
    allowedOrigins: ['https://1up.hdfcergo.com'],
    subframeOrigins: [],
    loginMethod: 'password',
    automation: 'manual',
    barrier: 'unknown',
    inspectedOn: '2026-11-02',
    advisorNote:
      'This portal draws its sign-in page as a picture, so it cannot be filled. Sign in by hand.',
  },
  {
    id: 'icici-lombard',
    displayName: 'ICICI Lombard',
    startUrl: 'https://nysa.icicilombard.com/#/login',
    loginOrigin: 'https://nysa.icicilombard.com',
    allowedOrigins: ['https://nysa.icicilombard.com'],
    subframeOrigins: [],
    loginMethod: 'password',
    automation: 'autofill',
    barrier: 'canvas-captcha',
    form: {
      username: 'input[formcontrolname="username"]',
      password: 'input[formcontrolname="password"]',
      captcha: 'input[formcontrolname="captcha"]',
      pages: [{ path: '/', hashPrefix: '#/login' }],
    },
    inspectedOn: '2026-11-02',
    advisorNote: 'Type the CAPTCHA shown on the page, then press LOGIN.',
  },
  {
    id: 'niva-bupa',
    displayName: 'Niva Bupa',
    startUrl: 'https://uno.nivabupa.com/uno/#/login',
    loginOrigin: 'https://uno.nivabupa.com',
    allowedOrigins: ['https://uno.nivabupa.com'],
    subframeOrigins: [],
    loginMethod: 'password',
    automation: 'autofill',
    barrier: 'none',
    form: {
      username: 'input.native-input[type="text"]',
      password: 'input.native-input[type="password"]',
      pages: [{ path: '/uno/', hashPrefix: '#/login' }],
    },
    inspectedOn: '2026-11-02',
    advisorNote: 'Check the "I am an" role (Agent unless told otherwise), then press LOGIN.',
  },
  {
    id: 'bajaj-allianz',
    displayName: 'Bajaj Allianz',
    startUrl: 'https://partner.bajajgeneral.com/',
    loginOrigin: 'https://auth.prod.bajajgeneral.com',
    allowedOrigins: ['https://partner.bajajgeneral.com', 'https://auth.prod.bajajgeneral.com'],
    subframeOrigins: [],
    loginMethod: 'password',
    automation: 'autofill',
    barrier: 'none',
    form: {
      username: '#username',
      password: '#password',
      pages: [
        { path: '/auth/realms/Bagic/protocol/openid-connect/auth' },
        // Keycloak shows the form again here after a failed attempt.
        { path: '/auth/realms/Bagic/login-actions/authenticate' },
      ],
    },
    inspectedOn: '2026-11-02',
    advisorNote: 'Press Sign In.',
  },
  {
    id: 'star-health',
    displayName: 'Star Health',
    startUrl: 'https://atompro.starhealth.in/sso/login',
    loginOrigin: 'https://atompro.starhealth.in',
    allowedOrigins: ['https://atompro.starhealth.in'],
    subframeOrigins: [],
    loginMethod: 'otp',
    automation: 'later',
    barrier: 'otp',
    inspectedOn: null,
    advisorNote: 'OTP sign-in: not automated yet. Sign in by hand with the OTP.',
  },
  {
    id: 'tata-aig',
    displayName: 'Tata AIG',
    startUrl: 'https://sellonline.tataaig.com/ipdsv2/login/#/login',
    loginOrigin: 'https://sellonline.tataaig.com',
    allowedOrigins: ['https://sellonline.tataaig.com'],
    subframeOrigins: [],
    loginMethod: 'otp',
    automation: 'later',
    barrier: 'otp',
    inspectedOn: null,
    advisorNote: 'OTP sign-in: not automated yet. Sign in by hand with the OTP.',
  },
];

/** The registry, validated once at load: a bad entry stops the app rather than misbehave. */
export const INSURER_PORTALS: readonly InsurerPortal[] = Object.freeze(
  z
    .array(insurerPortalSchema)
    .refine((list) => new Set(list.map((p) => p.id)).size === list.length, 'duplicate ids')
    .parse(PORTALS),
);

export function findPortal(id: string): InsurerPortal | undefined {
  return INSURER_PORTALS.find((p) => p.id === id);
}

/** Whether saved sign-in details are useful for this portal (only autofill portals use them). */
export function usesSavedLogin(portal: InsurerPortal): boolean {
  return portal.automation === 'autofill';
}

/**
 * Whether the login form may be filled on `url`: exactly the login origin, on one of the listed
 * login pages. Everything else on the portal (and every other site) is refused.
 */
export function mayFillLogin(portal: InsurerPortal, url: string): boolean {
  if (!portal.form) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin !== portal.loginOrigin || parsed.username || parsed.password) return false;
  return portal.form.pages.some(
    (page) =>
      parsed.pathname === page.path &&
      (page.hashPrefix === undefined || hashMatches(parsed.hash, page.hashPrefix)),
  );
}

/** `#/login` matches `#/login`, `#/login?…` and `#/login/…`, never `#/loginhistory`. */
function hashMatches(hash: string, prefix: string): boolean {
  if (!hash.startsWith(prefix)) return false;
  const next = hash.charAt(prefix.length);
  return next === '' || next === '?' || next === '/';
}

/** Whether a frame may navigate to `url` in this portal's window. */
export function mayNavigate(portal: InsurerPortal, url: string, isMainFrame: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!isMainFrame && (url === 'about:blank' || url === 'about:srcdoc')) return true;
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
  return (
    portal.allowedOrigins.includes(parsed.origin) ||
    (!isMainFrame && portal.subframeOrigins.includes(parsed.origin))
  );
}
