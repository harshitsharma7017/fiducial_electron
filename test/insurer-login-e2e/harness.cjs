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
const FIXTURES = { ...require('./fixtures.cjs'), ...require('./uiic-calculator.cjs') };

const {
  AGENT_SOURCE,
  createFormRecorder,
  createLogger,
  installNavigationPolicy,
  keyboardFill,
  keyboardTargetFor,
  runUiicHealthQuote,
  setSessionPolicy,
} = require(process.env.FQF_LOGIN_E2E_BUNDLE);
const fs = require('node:fs');
const os = require('node:os');
const nodePath = require('node:path');
const WORLD_ID = 1801;
const USER = 'SYNTHETIC.USER01';
const PASS = 'Synthetic-Pw-9f3a';
const PASS_WITH_SYMBOLS = 'Synth@Pass#9! x';

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
  if (req.method === 'POST' && req.url === '/api/quote') {
    // The synthetic quote form's own "get quote" call (used by the recorder check only).
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ premium: '\u20b9 12,345' }));
    return;
  }
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

  // Keyboard fill: real key events (sendInputEvent) through the app's own target.
  const KEYBOARD = [
    {
      name: 'keyboard fill: user ID, Tab, password, when the advisor clicked the user ID box',
      path: '/kbd',
      focus: '#u',
      outcome: 'filled',
      values: { '#u': USER, '#p': PASS_WITH_SYMBOLS },
    },
    {
      name: 'keyboard fill: types nothing when no box has the cursor',
      path: '/kbd',
      focus: null,
      outcome: 'click-username-first',
      values: { '#u': '', '#p': '' },
    },
    {
      name: 'keyboard fill: types nothing when the cursor is in the password box',
      path: '/kbd',
      focus: '#p',
      outcome: 'click-username-first',
      values: { '#u': '', '#p': '' },
    },
    {
      name: 'keyboard fill: no password typed when Tab does not land in a password box',
      path: '/kbd-two-text',
      focus: '#u',
      outcome: 'field-wrong-type',
      values: { '#u': USER, '#p': '', '#x': '' },
    },
  ];
  const portal = {
    automation: 'shortcut',
    loginOrigin: origin,
    shortcutPages: [{ path: '/kbd' }, { path: '/kbd-two-text' }],
  };
  for (const c of KEYBOARD) {
    const win = new BrowserWindow({
      show: true,
      width: 800,
      height: 600,
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await win.loadURL(origin + c.path);
    win.focus();
    if (c.focus)
      await win.webContents.executeJavaScript(`document.querySelector('${c.focus}').focus(); true`);
    const outcome = await keyboardFill(keyboardTargetFor(win.webContents, WORLD_ID), portal, {
      username: USER,
      password: PASS_WITH_SYMBOLS,
    });
    await new Promise((r) => setTimeout(r, 300));
    const page = await win.webContents.executeJavaScript(`(() => {
      const values = {};
      for (const sel of ${JSON.stringify(Object.keys(c.values))}) values[sel] = document.querySelector(sel).value;
      return { values, seen: window.__seen };
    })()`);
    const problems = [];
    if (outcome !== c.outcome) problems.push(`outcome ${outcome}`);
    if (!same(page.values, c.values))
      problems.push(
        `values ${JSON.stringify(Object.fromEntries(Object.entries(page.values).map(([k, v]) => [k, v.length])))}`,
      );
    if (page.seen.submit !== 0 || page.seen.click !== 0)
      problems.push(`submitted ${page.seen.submit}, clicked ${page.seen.click}`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
    win.destroy();
  }

  // Form recorder: record a walk-through with real typing; nothing typed may reach the file.
  {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'fqf-recorder-e2e-'));
    const recorder = createFormRecorder({ dir, logger: createLogger([]) });
    const win = new BrowserWindow({
      show: true,
      width: 900,
      height: 700,
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await win.loadURL(origin + '/quote');
    win.focus();
    recorder.start('united-india', () => [win]);
    const typed = {
      '#nm': 'Synthetic Ravikumar',
      '#dob': '14/03/1981',
      '#mob': '9876501234',
      '#em': 'ravi.synthetic@example.test',
    };
    for (const [sel, text] of Object.entries(typed)) {
      await win.webContents.executeJavaScript(`document.querySelector('${sel}').focus(); true`);
      for (const ch of text) {
        const keyCode = ch === ' ' ? 'Space' : ch;
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
        win.webContents.sendInputEvent({ type: 'char', keyCode });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
      }
      await new Promise((r) => setTimeout(r, 150));
      await win.webContents.executeJavaScript(
        `document.querySelector('${sel}').blur(); document.querySelector('${sel}').dispatchEvent(new Event('change', { bubbles: true })); true`,
      );
    }
    await win.webContents.executeJavaScript(`(() => {
      for (const [id, v] of [['rel', 'SPOUSE'], ['si', '1000000']]) { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }
      document.querySelector('input[name=gender][value=F]').click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 900));
    await win.webContents.executeJavaScript(`document.getElementById('next').click(); true`);
    await new Promise((r) => setTimeout(r, 1800));
    const file = await recorder.stop('united-india');
    const text = file ? fs.readFileSync(file, 'utf8') : '';
    const rec = text ? JSON.parse(text) : { pages: [], timeline: [] };
    const problems = [];
    if (!file) problems.push('no file written');
    else if (process.platform !== 'win32' && (fs.statSync(file).mode & 0o077) !== 0)
      problems.push('file not owner-only');
    for (const value of [
      ...Object.values(typed),
      'Ravikumar',
      '1981',
      '9876501234',
      'example.test',
    ]) {
      if (text.includes(value)) problems.push(`typed value leaked: ${value.slice(0, 3)}…`);
    }
    const changes = rec.timeline.filter((e) => e.kind === 'change');
    const lengthOf = (id) => changes.find((e) => e.field.id === id)?.length;
    if (lengthOf('nm') !== typed['#nm'].length || lengthOf('mob') !== 10)
      problems.push('typed lengths not recorded');
    if (!changes.some((e) => e.field.id === 'si' && e.option?.value === '1000000'))
      problems.push('dropdown choice missing');
    if (!changes.some((e) => e.field.name === 'gender' && e.value === 'F' && e.checked))
      problems.push('radio choice missing');
    const req = rec.timeline.find((e) => e.kind === 'request' && e.method === 'POST');
    if (!req || !req.url.endsWith('/api/quote')) problems.push('quote request missing');
    else if (
      JSON.stringify(req.bodyFields) !==
      JSON.stringify([
        'proposer',
        'proposer.name',
        'proposer.dob',
        'proposer.mobile',
        'proposer.email',
        'relation',
        'si',
      ])
    )
      problems.push(`body fields ${JSON.stringify(req.bodyFields)}`);
    const fields = rec.pages[0]?.snapshot?.fields ?? [];
    const si = fields.find((f) => f.id === 'si');
    if (!si || JSON.stringify(si.options.map((o) => o.value)) !== '["500000","1000000"]')
      problems.push('sum insured options missing');
    if (fields.find((f) => f.id === 'nm')?.label !== 'Proposer name')
      problems.push('field label missing');
    if (!rec.pages.some((p) => p.snapshot.money.some((m) => m.text.includes('12,345'))))
      problems.push('premium location missing');
    if (
      !rec.pages.some((p) =>
        p.snapshot.messages.includes('Minimum sum insured for floater is 300000. Ref ##########'),
      )
    )
      problems.push(
        `error message missing: ${JSON.stringify(rec.pages.map((p) => p.snapshot.messages))}`,
      );
    if (!rec.timeline.some((e) => e.kind === 'page' && e.url.endsWith('#/result')))
      problems.push('page change missing');
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  form recorder: structure, choices, request field names and premium kept; typed values never${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
    win.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Pop-ups and navigation, through the app's own navigation policy (installed last, so the
  // earlier windows are unaffected): same-origin pop-ups open in the same session, others are
  // blocked and reported, and so is navigation to another origin.
  {
    installNavigationPolicy(createLogger([]));
    const pses = session.fromPartition('popup-e2e');
    const reported = [];
    setSessionPolicy(pses, {
      navigate: (url) => url.startsWith(origin + '/'),
      popup: (url) =>
        url.startsWith(origin + '/')
          ? { show: true, webPreferences: { session: pses, sandbox: true, contextIsolation: true } }
          : null,
      onBlocked: (kind, url) => reported.push(`${kind} ${new URL(url).origin}`),
    });
    const before = BrowserWindow.getAllWindows().length;
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: pses, sandbox: true, contextIsolation: true },
    });
    await win.loadURL(origin + '/tiles');
    await win.webContents.executeJavaScript(`document.getElementById('calc').click(); true`, true);
    await new Promise((r) => setTimeout(r, 1500));
    const popup = BrowserWindow.getAllWindows().find(
      (w) => w !== win && w.webContents.getURL().endsWith('/calc'),
    );
    const sharedCookie = popup ? await popup.webContents.executeJavaScript('document.cookie') : '';
    await win.webContents.executeJavaScript(`document.getElementById('away').click(); true`, true);
    await new Promise((r) => setTimeout(r, 800));
    const otherOrigin = origin.replace('127.0.0.1', 'localhost');
    await win.webContents.executeJavaScript(`location.href = '${otherOrigin}/calc'; true`, true);
    await new Promise((r) => setTimeout(r, 800));
    const problems = [];
    if (!popup) problems.push('same-origin pop-up did not open');
    if (!sharedCookie.includes('sid=signed-in'))
      problems.push('pop-up does not share the signed-in session');
    if (BrowserWindow.getAllWindows().length !== before + 2)
      problems.push(`windows: ${BrowserWindow.getAllWindows().length - before}`);
    if (!reported.includes('popup https://evil.example'))
      problems.push('other-site pop-up not reported');
    if (!reported.includes(`navigation ${otherOrigin}`))
      problems.push('other-origin navigation not reported');
    if (!win.webContents.getURL().startsWith(origin + '/tiles'))
      problems.push('portal navigated away');
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  pop-ups: own-origin calculator opens in the same session; other sites blocked and reported${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
    popup?.destroy();
    win.destroy();
  }

  // The recorder follows pop-ups: started on the portal home, it records the quote form the
  // home page opens in a new window.
  {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'fqf-recorder-popup-'));
    const recorder = createFormRecorder({ dir, logger: createLogger([]) });
    const qses = session.fromPartition('recorder-popup-e2e');
    setSessionPolicy(qses, {
      navigate: (url) => url.startsWith(origin + '/'),
      popup: (url) =>
        url.startsWith(origin + '/')
          ? { show: true, webPreferences: { session: qses, sandbox: true, contextIsolation: true } }
          : null,
    });
    const home = new BrowserWindow({
      show: true,
      webPreferences: { session: qses, sandbox: true, contextIsolation: true },
    });
    await home.loadURL(origin + '/tiles-quote');
    recorder.start('united-india', () =>
      BrowserWindow.getAllWindows().filter(
        (w) => !w.isDestroyed() && w.webContents.session === qses,
      ),
    );
    await new Promise((r) => setTimeout(r, 800));
    await home.webContents.executeJavaScript(
      `document.getElementById('health').click(); true`,
      true,
    );
    await new Promise((r) => setTimeout(r, 2000));
    const file = await recorder.stop('united-india');
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    const quotePage = rec.pages.find((p) => p.window === 1 && p.url.endsWith('/quote'));
    const problems = [];
    if (!rec.pages.some((p) => p.window === 0 && p.url.endsWith('/tiles-quote')))
      problems.push('home page missing');
    if (!quotePage) problems.push('pop-up page missing');
    else if (!quotePage.snapshot.fields.some((f) => f.id === 'si'))
      problems.push('pop-up form fields missing');
    if (
      !rec.timeline.some((e) => e.kind === 'click' && e.text === 'Health Policy Premium Calculator')
    )
      problems.push('tile click missing');
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  form recorder follows a quote form opened in a pop-up${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
    for (const w of BrowserWindow.getAllWindows()) if (w.webContents.session === qses) w.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // United India health calculator automation, against the local copy of the calculator.
  {
    const uses = session.fromPartition('uiic-e2e');
    setSessionPolicy(uses, {
      navigate: (url) => url.startsWith(origin + '/'),
      popup: (url) =>
        url.startsWith(origin + '/')
          ? { show: true, webPreferences: { session: uses, sandbox: true, contextIsolation: true } }
          : null,
    });
    const home = new BrowserWindow({
      show: true,
      webPreferences: { session: uses, sandbox: true, contextIsolation: true },
    });
    await home.loadURL(origin + '/GCWebPortal/login/HomeAction.do');
    const windows = () => [
      home,
      ...BrowserWindow.getAllWindows().filter(
        (w) => w !== home && !w.isDestroyed() && w.webContents.session === uses,
      ),
    ];
    const couple = {
      customer: { name: 'Synthetic Couple' },
      pincode: '560001',
      proposerMaritalStatus: 'married',
      members: [
        { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
        { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02', gender: 'female' },
        { relationship: 'son', age: 12, dateOfBirth: '2014-05-20', gender: 'male' },
        { relationship: 'daughter', age: 8, dateOfBirth: '2018-09-09', gender: 'female' },
        { relationship: 'son', age: 4, dateOfBirth: '2022-01-31', gender: 'male' },
      ],
      preferences: { coverType: 'floater', sumInsuredPaise: 500000_00, tenureYears: 1 },
    };
    const today = new Date(2026, 10, 2);

    const result = await runUiicHealthQuote({ windows, client: couple, goodHealth: true, today });
    const calc = windows().find((w) =>
      w.webContents.getURL().includes('HealthPolicyNewQuote.html'),
    );
    const state = calc
      ? await calc.webContents.executeJavaScript(`(() => {
          const M = 'healthPolicyData.HealthPolicyFormBean';
          const v = (s) => document.querySelector(s)?.value;
          const shown = (id) => !document.getElementById(id).classList.contains('hidden');
          return {
            product: v('#selectProductType'), cover: v('#selectCoverType'), si: v('#selectCoverReq'),
            pincode: v('#pincodeString'), zone: v('input[name=pincodeZone]'),
            dob: v('input#proposerDOBId'), age: v('#proposerAgeId'),
            gender: v('select[data-ng-model="' + M + '.proposerGender"]'),
            marital: v('select[ng-model="' + M + '.proposerMaritalStatus"]'),
            health: document.querySelector('input[name=ynProposerHyperDiaChol][value=No]').checked,
            spouseDob: v('#spouseDOBId'), spouseGender: v('select[ng-model="' + M + '.spouseGender"]'),
            children: [...document.querySelectorAll('#savedChildren input')].map((i) => i.value),
            userDetails: shown('userDetails'), checkPremium: window.__checkPremium === true,
          };
        })()`)
      : null;
    const problems = [];
    if (result.outcome !== 'ready')
      problems.push(`outcome ${result.outcome} at ${result.step}: ${result.message}`);
    const expected = {
      product: 'Base',
      cover: 'familyFloater',
      si: '500000',
      pincode: '560001',
      zone: 'Zone A',
      dob: '14/03/1985',
      age: '41',
      gender: 'Male',
      marital: 'Married',
      health: true,
      spouseDob: '02/07/1988',
      spouseGender: 'Female',
      children: [
        '20/05/2014|Male|Son|Unmarried',
        '09/09/2018|Female|Daughter|Unmarried',
        '31/01/2022|Male|Son|Unmarried',
      ],
      userDetails: true,
      checkPremium: false,
    };
    if (!same(state, expected)) problems.push(`calculator ${JSON.stringify(state)}`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  United India health: fills the flow for a family of five (couple + 3 children) and stops at User Details${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
    calc?.destroy();

    // United India's own ERRORS pop-up stops the run, with its message.
    const low = {
      ...couple,
      preferences: { coverType: 'floater', sumInsuredPaise: 50000_00, tenureYears: 1 },
    };
    const refused = await runUiicHealthQuote({ windows, client: low, goodHealth: true, today });
    const errProblems = [];
    if (
      refused.outcome !== 'failed' ||
      refused.step !== 'Get Quote' ||
      !refused.message.includes('Minimum sum insured for floater cover is 100000')
    ) {
      errProblems.push(JSON.stringify(refused));
    }
    console.log(
      `${errProblems.length ? 'FAIL' : 'pass'}  United India health: stops with United India's ERRORS message${errProblems.length ? `\n      ${errProblems.join('\n      ')}` : ''}`,
    );
    failures += errProblems.length ? 1 : 0;
    for (const w of windows()) w.destroy();
  }

  if (writes.length) {
    console.log(`FAIL  requests other than GET reached the server: ${writes.join(', ')}`);
    failures += 1;
  } else {
    console.log('pass  no request other than GET reached the server');
  }
  const total = CASES.length + KEYBOARD.length + 6;
  console.log(`\n${total - failures} of ${total} checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
