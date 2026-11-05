// Runs the Niva Bupa premium calculator automation (bundled real code) against the local copy of
// the calculator (niva-page.html), and checks the counters, the dates picked in the Material
// calendars, the city and mobile, the plan chosen in the Ionic dropdowns, what is left to the
// advisor, and that neither the plans step's Continue nor Calculate Premium is pressed. Then it
// drains the form recorder on the plans step, to check it now sees Ionic's dropdowns and a click on
// one. Contacts no insurer: the pages are served from 127.0.0.1. Exits 0 only if every check passes.
// Started by run.mjs niva (npm run test:nia -- niva).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./niva-form.cjs');
const {
  installNavigationPolicy,
  createLogger,
  formRecorderAgent,
  runNivaHealthQuote,
  setSessionPolicy,
} = require(process.env.FQF_LOGIN_E2E_BUNDLE);

app.on('window-all-closed', () => {});
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.on(event, (err) => {
    console.log(`FAIL  harness error: ${err && err.message ? err.message : String(err)}`);
    app.exit(1);
  });
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const render = FIXTURES[url.pathname];
  res.writeHead(render ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(render ? render(url.searchParams) : 'not found');
});

const FAMILY = {
  customer: { name: 'Synthetic Insured', phone: '9876543210' },
  pincode: '380001',
  members: [
    { relationship: 'son', age: 8, dateOfBirth: '2018-03-14' },
    { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02' },
    { relationship: 'self', age: 40, dateOfBirth: '1986-01-25' },
  ],
  proposal: { city: 'Ahmedabad' },
};
const SINGLE = { ...FAMILY, members: [FAMILY.members[2]] };
const CALCULATOR = '/uno/#/new-premiumcalculator';
const READ = `(() => {
  const values = (kind) => Array.from(document.querySelectorAll('[data-kind="' + kind + '"] input[placeholder]')).map((i) => i.value);
  return {
    adults: document.querySelector('[data-kind="adult"] input[readonly]')?.value ?? null,
    children: document.querySelector('[data-kind="child"] input[readonly]')?.value ?? null,
    adultDobs: values('adult'), childDobs: values('child'),
    city: document.querySelector('#mat-input-7').value,
    mobile: document.querySelector('#ion-input-8').value,
    route: location.hash,
    compare: window.__chosen.compare ?? [],
    alertsOpen: document.querySelectorAll('ion-alert').length,
    step3: window.__step3, calculated: window.__calculated,
  };
})()`;

const CASES = [
  {
    name: 'family (self, spouse, son) for ReAssure 2.0, over counts left from an earlier run',
    start: '/uno/?a=3&c=2#/new-premiumcalculator',
    client: FAMILY,
    plan: 'reassure-2',
    outcome: 'ready',
    message: '"ReAssure2.0 Family Floater" is chosen',
    expect: {
      adults: '2',
      children: '1',
      adultDobs: ['25/01/1986', '02/07/1988'],
      childDobs: ['14/03/2018'],
      city: 'Ahmedabad',
      mobile: '9876543210',
      route: '#/new-premiumcalculator/second-step',
      compare: ['ReAssure2.0 Family Floater'],
      alertsOpen: 0,
      step3: false,
      calculated: false,
    },
    toDo: ['the ReAssure 2.0 card', 'policy period, add-ons', 'Press Calculate Premium yourself'],
  },
  {
    name: 'family for ReAssure 3.0 (the floater list offers it)',
    start: CALCULATOR,
    client: FAMILY,
    plan: 'reassure-3',
    outcome: 'ready',
    expect: { compare: ['ReAssure3.0 Family Floater'], step3: false, calculated: false },
  },
  {
    name: 'one adult for ReAssure 3.0: the individual list does not offer it, both lists closed',
    start: CALCULATOR,
    client: SINGLE,
    plan: 'reassure-3',
    outcome: 'failed',
    message:
      'does not offer ReAssure 3.0 for these members (it offers: Aspire Individual; GoActive',
    expect: { adults: '1', children: '0', alertsOpen: 0, compare: [], step3: false },
  },
  {
    name: 'Health Recharge with the top-up product chosen first',
    start: '/uno/?topup=1#/new-premiumcalculator',
    client: SINGLE,
    plan: 'health-recharge',
    outcome: 'ready',
    expect: { compare: ['HealthRechargeV2 Individual'], step3: false, calculated: false },
  },
  {
    name: 'Health Recharge without the top-up product: told to choose it first',
    start: CALCULATOR,
    client: SINGLE,
    plan: 'health-recharge',
    outcome: 'failed',
    message: 'choose the top-up product at the top of the calculator first',
  },
  {
    name: 'six adults: the calculator stops counting at four',
    start: CALCULATOR,
    client: {
      ...FAMILY,
      members: ['self', 'spouse', 'father', 'mother', 'father_in_law', 'mother_in_law'].map(
        (relationship, i) => ({ relationship, age: 40 + i, dateOfBirth: `${1986 - i}-05-10` }),
      ),
    },
    plan: 'reassure-2',
    outcome: 'failed',
    message: 'stops at 4 adults',
    expect: { adults: '4', route: '#/new-premiumcalculator' },
  },
  {
    name: 'not on the first step (landing page): refused before anything is touched',
    start: '/uno/?a=2#/landing-page',
    client: FAMILY,
    plan: 'reassure-2',
    outcome: 'refused',
    message: "Open Niva Bupa's premium calculator at its first step",
    expect: { adults: '2', adultDobs: ['', ''], city: '' },
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(c, result, state, problems) {
  if (result.outcome !== c.outcome)
    problems.push(
      `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.problems)}`,
    );
  if (c.message && !result.message.includes(c.message))
    problems.push(`message "${result.message}" lacks "${c.message}"`);
  for (const [k, v] of Object.entries(c.expect ?? {}))
    if (!same(state[k], v))
      problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
  for (const item of c.toDo ?? [])
    if (!(result.toDo ?? []).some((t) => t.startsWith(item)))
      problems.push(`to do lacks "${item}": ${JSON.stringify(result.toDo)}`);
}

async function newWindow(origin, label) {
  const ses = session.fromPartition(`niva-${label}-${Math.random()}`);
  setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
  return new BrowserWindow({
    show: true,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true },
  });
}

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  let failures = 0;
  let total = 0;
  const report = (name, problems) => {
    total += 1;
    failures += problems.length ? 1 : 0;
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  Niva Bupa: ${name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
  };
  for (const c of CASES) {
    const win = await newWindow(origin, 'run');
    await win.loadURL(origin + c.start);
    const result = await runNivaHealthQuote({
      windows: () => [win],
      client: c.client,
      plan: c.plan,
      today: new Date(2026, 10, 5),
    });
    const state = await win.webContents
      .executeJavaScript(READ)
      .catch((e) => ({ error: e.message }));
    const problems = [];
    check(c, result, state, problems);
    win.destroy();
    report(c.name, problems);
  }

  // The recorder on the plans step: Ionic's dropdowns are listed, and a click inside one's shadow
  // root is noted as a click on the dropdown.
  {
    const win = await newWindow(origin, 'recorder');
    await win.loadURL(origin + '/uno/#/new-premiumcalculator');
    const drain = () =>
      win.webContents.executeJavaScriptInIsolatedWorld(1099, [
        { code: `(${formRecorderAgent.toString()})()` },
      ]);
    await drain();
    await win.webContents.executeJavaScript(`(() => {
      document.querySelector('#step1').classList.add('hidden');
      document.querySelector('#step2').classList.remove('hidden');
      document.querySelector('#compare').shadowRoot.querySelector('button').click();
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const out = await drain();
    const problems = [];
    const selects = (out.snapshot?.controls ?? []).filter((c) => c.tag === 'ion-select');
    if (selects.length !== 2) problems.push(`controls: ${JSON.stringify(out.snapshot?.controls)}`);
    const labels = Object.fromEntries(selects.map((s) => [s.id, s.label]));
    if (!same(labels, { recommended: 'Recommended', compare: 'Compare' }))
      problems.push(`labels: ${JSON.stringify(labels)}`);
    if (!selects.some((s) => s.id === 'compare' && s.text?.startsWith('Select')))
      problems.push(`no compare dropdown showing "Select": ${JSON.stringify(selects)}`);
    const click = out.events.find((e) => e.kind === 'click' && e.target.tag === 'ion-select');
    if (!click || click.target.id !== 'compare')
      problems.push(`click on the dropdown not noted: ${JSON.stringify(out.events)}`);
    if (!(out.snapshot?.messages ?? []).some((m) => m.includes('ReAssure2.0 Individual')))
      problems.push(
        `the open list is not among the messages: ${JSON.stringify(out.snapshot?.messages)}`,
      );
    win.destroy();
    report('the recorder sees Ionic dropdowns and a click on one', problems);
  }

  console.log(`\n${total - failures} of ${total} Niva Bupa checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
