// Runs the bundled login agent in real Electron against the synthetic sign-in pages
// (fixtures.cjs), served from 127.0.0.1, in a sandboxed window with an in-memory session and the
// agent in an isolated world, as the portal windows do. Checks, for every page:
// - the agent's result (field states only, never a value);
// - the values the page's own scripts see, and that their input events fired;
// - that nothing was submitted or clicked, and no request other than GET reached the server;
// - where there is a CAPTCHA box, that it has the focus.
// Exits 0 only if every check passes. Started by run.mjs.
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./fixtures.cjs');

const { AGENT_SOURCE } = require(process.env.FQF_LOGIN_E2E_BUNDLE);
const WORLD_ID = 1801;
const USER = 'SYNTHETIC.USER01';
const PASS = 'Synthetic-Pw-9f3a';

app.on('window-all-closed', () => {});

const CASES = [
  {
    name: 'United India: unlocks the read-only boxes by focus, fills both, focuses the CAPTCHA',
    path: '/GCWebPortal/login/LoginAction.do?p=login',
    selectors: { username: '#username', password: '#password', captcha: '#userCaptcha' },
    result: { ok: true, username: 'filled', password: 'filled', captchaFocused: true },
    values: { '#username': USER, '#password': PASS, '#pwaStatus': '', '#userCaptcha': '' },
    model: { userName: USER, userPaWord: PASS },
    focused: 'userCaptcha',
  },
  {
    name: 'New India: fills both beside the reCAPTCHA frame',
    path: '/NIABancsPortal/IntermediaryLogin.html',
    selectors: { username: '#userName', password: '#password' },
    result: { ok: true, username: 'filled', password: 'filled', captchaFocused: false },
    values: { '#userName': USER, '#password': PASS },
    model: { userName: USER, password: PASS },
  },
  {
    name: 'ICICI Lombard: waits for the late form, fills, focuses the CAPTCHA',
    path: '/icici/#/login',
    selectors: {
      username: 'input[formcontrolname="username"]',
      password: 'input[formcontrolname="password"]',
      captcha: 'input[formcontrolname="captcha"]',
    },
    result: { ok: true, username: 'filled', password: 'filled', captchaFocused: true },
    values: {
      'input[formcontrolname="username"]': USER,
      'input[formcontrolname="password"]': PASS,
      'input[formcontrolname="captcha"]': '',
    },
    model: { username: USER, password: PASS },
    focused: 'captcha',
  },
  {
    name: 'Niva Bupa: fills the Ionic native inputs',
    path: '/uno/#/login',
    selectors: {
      username: 'input.native-input[type="text"]',
      password: 'input.native-input[type="password"]',
    },
    result: { ok: true, username: 'filled', password: 'filled', captchaFocused: false },
    values: { '#ion-input-0': USER, '#ion-input-1': PASS },
    model: { 'ion-input-0': USER, password: PASS },
  },
  {
    name: 'Bajaj Allianz: fills the Keycloak form and does not sign in',
    path: '/auth/realms/Bagic/protocol/openid-connect/auth?client_id=PartnerPortal',
    selectors: { username: '#username', password: '#password' },
    result: { ok: true, username: 'filled', password: 'filled', captchaFocused: false },
    values: { '#username': USER, '#password': PASS, '#rememberMe': 'on' },
    model: { username: USER, password: PASS },
  },
  {
    name: 'refuses two matching user fields and fills nothing',
    path: '/ambiguous',
    selectors: { username: '#username', password: '#password' },
    result: { ok: true, username: 'ambiguous', password: 'kept', captchaFocused: false },
    values: { '#password': '' },
  },
  {
    name: 'refuses a password field that is not a password input',
    path: '/wrong-type',
    selectors: { username: '#username', password: '#password' },
    result: { ok: true, username: 'kept', password: 'wrong-type', captchaFocused: false },
    values: { '#username': '', '#password': '' },
  },
  {
    name: 'refuses boxes that stay read-only, and never removes the lock itself',
    path: '/readonly-locked',
    selectors: { username: '#username', password: '#password' },
    result: { ok: true, username: 'wrong-type', password: 'wrong-type', captchaFocused: false },
    values: { '#username': '', '#password': '' },
  },
  {
    name: 'keeps what the advisor typed and fills only the empty field',
    path: '/advisor-typed',
    selectors: { username: '#username', password: '#password' },
    result: { ok: true, username: 'kept', password: 'filled', captchaFocused: false },
    values: { '#username': 'TYPED.BY.ADVISOR', '#password': PASS },
  },
  {
    name: 'reports a page without the form, after waiting',
    path: '/no-form',
    selectors: { username: '#username', password: '#password' },
    waitMs: 1000,
    result: { ok: false, reason: 'form-not-found' },
    values: {},
  },
  {
    name: 'refuses to fill on any other origin',
    path: '/auth/realms/Bagic/protocol/openid-connect/auth',
    selectors: { username: '#username', password: '#password' },
    expectedOrigin: 'https://auth.prod.bajajgeneral.com',
    result: { ok: false, reason: 'wrong-origin' },
    values: { '#username': '', '#password': '' },
  },
];

const writes = [];
const server = http.createServer((req, res) => {
  if (req.method !== 'GET') writes.push(`${req.method} ${req.url}`);
  const path = new URL(req.url, 'http://x').pathname;
  const html = FIXTURES[path];
  res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html ?? 'not found');
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ses = session.fromPartition('insurer-login-e2e'); // in memory
  ses.setPermissionRequestHandler((_c, _p, cb) => cb(false));
  let failures = 0;

  for (const c of CASES) {
    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await win.loadURL(origin + c.path);
    const command = {
      op: 'fill',
      expectedOrigin: c.expectedOrigin ?? origin,
      selectors: c.selectors,
      username: USER,
      password: PASS,
      waitMs: c.waitMs ?? 5000,
    };
    const result = await win.webContents.executeJavaScriptInIsolatedWorld(WORLD_ID, [
      { code: `(${AGENT_SOURCE})(${JSON.stringify(command)})` },
    ]);
    await new Promise((r) => setTimeout(r, 300)); // let any (wrong) submit or navigation happen
    const page = await win.webContents.executeJavaScript(`(() => {
      const values = {};
      for (const sel of ${JSON.stringify(Object.keys(c.values))}) {
        const el = document.querySelector(sel);
        values[sel] = el ? (el.type === 'checkbox' ? (el.checked ? 'checked' : el.value) : el.value) : null;
      }
      const a = document.activeElement;
      return {
        url: location.pathname,
        values,
        seen: window.__seen,
        model: window.__model ?? null,
        focused: a ? (a.getAttribute('formcontrolname') || a.id || a.name || a.tagName) : null,
      };
    })()`);

    const problems = [];
    if (!same(result, c.result)) problems.push(`result ${JSON.stringify(result)}`);
    if (JSON.stringify(result).includes(PASS) || JSON.stringify(result).includes(USER)) {
      problems.push('result carries a value');
    }
    if (!same(page.values, c.values)) problems.push(`values ${JSON.stringify(page.values)}`);
    if (c.model && !same(page.model, c.model))
      problems.push(`page model ${JSON.stringify(page.model)}`);
    if (page.seen.submit !== 0 || page.seen.click !== 0) {
      problems.push(`submitted ${page.seen.submit}, clicked ${page.seen.click}`);
    }
    if (page.url !== new URL(origin + c.path).pathname) problems.push(`navigated to ${page.url}`);
    if (c.focused && page.focused !== c.focused) problems.push(`focus on ${page.focused}`);
    if (result.ok && result.username === 'filled' && !page.seen.input.length) {
      problems.push('no input events reached the page');
    }

    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
    win.destroy();
  }

  if (writes.length) {
    console.log(`FAIL  requests other than GET reached the server: ${writes.join(', ')}`);
    failures += 1;
  } else {
    console.log('pass  no request other than GET reached the server');
  }
  console.log(`\n${CASES.length + 1 - failures} of ${CASES.length + 1} checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
