// Runs the Niva Bupa premium calculator automation (bundled real code) against the local copy of
// the calculator (niva-page.html), by "I Know My Plan", and checks the plan, counters, dates picked
// in the Material calendars, city, phone and questions, the sum insured, policy period, add-ons and
// Tiered Network, that Calculate Premium is pressed and the premium read is the one shown, and that
// the Continue after it is not pressed. Then it drains the form recorder on Customize Your Plan, to
// check it sees Ionic's dropdowns and a click on one. Contacts no insurer: the pages are served
// from 127.0.0.1. Exits 0 only if every check passes.
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
const RUN = {
  plan: 'reassure-2',
  sumInsured: 2000000,
  years: 2,
  addOns: ['Safeguard', 'Prolonged treatment assistance cover'],
  tieredNetwork: true,
  medicalPractitioner: false,
};
const CALCULATOR = '/uno/#/new-premiumcalculator';
const READ = `(() => {
  const q = (s) => document.querySelector(s);
  const values = (kind) => Array.from(document.querySelectorAll('[data-kind="' + kind + '"] input[placeholder]')).map((i) => i.value);
  const answer = (key) => q('[data-q="' + key + '"] ion-radio[aria-checked="true"]')?.textContent ?? '';
  const chosen = q('#premium ion-radio[aria-checked="true"]');
  return {
    mode: q('#mode').textContent, plan: window.__plan,
    adults: q('[data-kind="adult"] input[readonly]').value,
    children: q('[data-kind="child"] input[readonly]').value,
    adultDobs: values('adult'), childDobs: values('child'),
    city: q('#mat-input-6').value, phone: q('#ion-input-4').value,
    answers: [answer('transfer'), answer('practitioner'), answer('child')],
    previousEnd: q('#previous-end').value,
    route: location.hash,
    sum: q('#sum').value, period: chosen ? chosen.parentElement.textContent.trim() : null,
    addOns: window.__addOns, tier: window.__tier,
    alertsOpen: document.querySelectorAll('ion-alert, app-tier-network').length,
    calculated: window.__calculated, summary: window.__summary,
  };
})()`;

const CASES = [
  {
    name: "family from UNO's home page: ReAssure 2.0 floater, ₹20 lakh, 2 years, add-ons, Tiered Network",
    start: '/uno/#/landing-page',
    client: FAMILY,
    run: RUN,
    outcome: 'ready',
    message: 'Niva Bupa worked the premium out: ₹',
    premiumLabel: 'ReAssure2.0 Family Floater, ₹ 2,000,000, 2 Year',
    expect: {
      mode: 'Plan Recommendation',
      plan: 'ReAssure2.0 Family Floater',
      adults: '2',
      children: '1',
      // A family floater asks the eldest member's date of birth only.
      adultDobs: ['1/25/1986'],
      childDobs: [],
      city: 'Ahmedabad',
      phone: '9876543210',
      answers: ['NO', 'NO', 'NO'],
      route: '#/new-premiumcalculator/third-step',
      sum: '₹ 2,000,000',
      addOns: ['Safeguard', 'Prolonged treatment assistance cover'],
      tier: true,
      alertsOpen: 0,
      calculated: true,
      summary: false,
    },
    toDo: ['check the ReAssure 2.0 options'],
  },
  {
    name: 'one adult, ReAssure 2.0 Individual, porting with the previous end date, a practitioner',
    start: CALCULATOR,
    client: SINGLE,
    run: {
      ...RUN,
      sumInsured: 500000,
      years: 1,
      addOns: ['Hospital Cash Plus'],
      tieredNetwork: false,
      medicalPractitioner: true,
      previousPolicyEndDate: '2026-11-18',
    },
    outcome: 'ready',
    premiumLabel: 'ReAssure2.0 Individual, ₹ 500,000, 1 Year',
    expect: {
      plan: 'ReAssure2.0 Individual',
      adultDobs: ['1/25/1986'],
      answers: ['YES', 'YES', 'NO'],
      previousEnd: '11/18/2026',
      sum: '₹ 500,000',
      addOns: [],
      tier: false,
      calculated: true,
      summary: false,
    },
    toDo: ['add-on "Hospital Cash Plus" (not found'],
  },
  {
    name: 'one adult for ReAssure 3.0: the plan box does not offer it, nothing else touched',
    start: CALCULATOR,
    client: SINGLE,
    run: { ...RUN, plan: 'reassure-3' },
    outcome: 'failed',
    message: 'plan list does not offer ReAssure 3.0 for these members (it offers: ',
    expect: { plan: '', route: '#/new-premiumcalculator', calculated: false },
  },
  {
    name: 'a sum insured Niva Bupa does not offer: stops at the sum insured, lists its own',
    start: CALCULATOR,
    client: FAMILY,
    run: { ...RUN, plan: 'reassure-3', sumInsured: 300000 },
    outcome: 'failed',
    message: 'does not offer a sum insured of ₹ 300,000 here (it offers: ₹ 500,000;',
    expect: { plan: 'ReAssure3.0 Family Floater', alertsOpen: 0, calculated: false },
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
    run: RUN,
    outcome: 'failed',
    message: 'stops at 4 adults',
    expect: { adults: '4', route: '#/new-premiumcalculator' },
  },
  {
    name: 'on another calculator step: refused before anything is touched',
    start: '/uno/#/new-premiumcalculator/third-step',
    client: FAMILY,
    run: RUN,
    outcome: 'refused',
    message: "Go to UNO's home page",
    expect: { mode: 'I Know My Plan', adultDobs: [''], city: '' },
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
  if (c.premiumLabel) {
    const p = result.premium;
    if (!p || p.label !== c.premiumLabel || !/^₹[\d,]+$/.test(p.amount))
      problems.push(`premium ${JSON.stringify(p)} (expected ${c.premiumLabel} and an amount)`);
    else if (state.period !== `${p.label.split(', ').at(-1)} ${p.amount}`)
      problems.push(`premium ${p.amount} is not what the page shows: ${state.period}`);
  }
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
      run: c.run,
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

  // The recorder on Customize Your Plan: Ionic's dropdowns are listed with their captions, and a
  // click inside one's shadow root is noted as a click on the dropdown.
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
      document.querySelector('#step3').classList.remove('hidden');
      document.querySelector('#sum').shadowRoot.querySelector('button').click();
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const out = await drain();
    const problems = [];
    const selects = (out.snapshot?.controls ?? []).filter((c) => c.tag === 'ion-select');
    const labels = Object.fromEntries(selects.map((s) => [s.id, s.label]));
    if (
      !same(labels, {
        sum: 'RECOMMENDED',
        acute: 'Acute Care Option',
        room: 'Room Category',
        deductible: 'Deductable',
      })
    )
      problems.push(`labels: ${JSON.stringify(labels)}`);
    if (!selects.some((s) => s.id === 'sum' && s.text?.startsWith('₹ 500,000')))
      problems.push(`no sum insured dropdown showing ₹ 500,000: ${JSON.stringify(selects)}`);
    const click = out.events.find((e) => e.kind === 'click' && e.target.tag === 'ion-select');
    if (!click || click.target.id !== 'sum')
      problems.push(`click on the dropdown not noted: ${JSON.stringify(out.events)}`);
    if (!(out.snapshot?.messages ?? []).some((m) => m.includes('₹ 10,000,000')))
      problems.push(
        `the open list is not among the messages: ${JSON.stringify(out.snapshot?.messages)}`,
      );
    win.destroy();
    report('the recorder sees Ionic dropdowns with their captions and a click on one', problems);
  }

  console.log(`\n${total - failures} of ${total} Niva Bupa checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
