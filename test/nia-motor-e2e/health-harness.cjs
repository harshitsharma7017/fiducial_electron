// Runs the New India health quote automation (bundled real code) against the local copy of New
// India's dashboard and health quote forms, and checks what was filled, what is left to the
// advisor, that open sections were not closed, and that nothing was saved. Contacts no insurer:
// the pages are served from 127.0.0.1. Exits 0 only if every check passes. Started by run.mjs
// health (npm run test:nia -- health).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./health-form.cjs');
const { installNavigationPolicy, createLogger, runNiaHealthQuote, setSessionPolicy } = require(
  process.env.FQF_LOGIN_E2E_BUNDLE,
);

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

const member = (relationship, age, dateOfBirth, gender) => ({
  relationship,
  age,
  dateOfBirth,
  gender,
});
const FAMILY = {
  customer: { name: 'Synthetic Family' },
  pincode: '560001',
  members: [
    member('self', 40, '1986-04-12', 'female'),
    member('spouse', 42, '1984-02-01', 'male'),
    member('daughter', 10, '2016-05-05', 'female'),
    member('son', 7, '2019-07-07', 'male'),
  ],
  proposerMaritalStatus: 'married',
  preferences: { coverType: 'floater', sumInsuredPaise: 15_000_000, tenureYears: 1 },
};
const WITH_ELDERS = {
  ...FAMILY,
  members: [
    ...FAMILY.members,
    member('father', 68, '1958-03-03', 'male'),
    member('mother_in_law', 66, '1960-09-09', 'female'),
  ],
};
const DASHBOARD = '/NIABancsPortal/NonCustomerDashboard.html#/home';
const READ = `(() => {
  const v = (s) => document.querySelector(s)?.value ?? null;
  const r = (n) => document.querySelector('input[name="' + n + '"]:checked')?.value ?? null;
  const c = (s) => document.querySelector(s)?.checked ?? null;
  return {
    heading: document.querySelector('h3')?.textContent ?? null,
    pin: v('#pincodeAdd'), area: document.querySelector('#pincodeAdd')?.dataset.area ?? null,
    cover: window.__cover ?? null, floaterSum: v('#propSumInsuredFloater'),
    period: r('PolicyPeriod'),
    self: v('#proposerDob'), selfAge: v('#propAge'), spouse: v('#spouseDob'),
    child0: v('#childDob0') ?? v('#daughterDob0'), child1: v('#childDob1') ?? v('#daughterDob1'),
    kinds: Array.from(document.querySelectorAll('.kind')).map((k) => k.textContent),
    dep0: v('#childDepType0'), dep1: v('#childDepType1'),
    parent0: v('#parentDob0'), inLaw0: v('#parentInLawDob0'),
    diabetes: [r('propSufferingDiabetes'), r('spouseSufferingDiabetes'), r('childSufferingDiabetes0'), r('childSufferingDiabetes1'), r('parentSufferingDiabetes0'), r('parentInLawSufferingDiabetes0')],
    hypertension: [r('propSufferingHypertension'), r('spouseSufferingHypertension'), r('childSufferingHyperTension0'), r('childSufferingHyperTension1'), r('parentSufferingHyperTension0'), r('parentInLawSufferingHyperTension0')],
    genders: [c('#gender1'), c('#spouseGender0'), c('#childGender10'), c('#childGender01')],
    sums: [v('#propSumInsured'), v('#spouseSumInsured'), v('#childSumInsured0'), v('#childSumInsured1')],
    toggles: window.__toggles, saved: window.__saved, continued: window.__continued,
  };
})()`;

const CASES = [
  {
    name: 'Arogya Sanjeevani from the dashboard: pincode, floater sum insured, six members, health "No"',
    start: DASHBOARD,
    client: WITH_ELDERS,
    policy: 'arogya-sanjeevani',
    goodHealth: true,
    outcome: 'ready',
    expect: {
      pin: '560001',
      area: 'First Area',
      cover: 'FLOAT',
      floaterSum: 'string:150000',
      self: '12/04/1986',
      selfAge: '40',
      spouse: '01/02/1984',
      child0: '05/05/2016',
      child1: '07/07/2019',
      dep0: 'string:NORM',
      dep1: 'string:NORM',
      parent0: '03/03/1958',
      inLaw0: '09/09/1960',
      diabetes: ['N', 'N', 'N', 'N', 'N', 'N'],
      hypertension: ['N', 'N', 'N', 'N', 'N', 'N'],
      // Basic Information and Member Information opened once each, never closed again.
      toggles: 2,
      saved: false,
      continued: false,
    },
    toDo: ['premium payment frequency', "New India's terms", 'Press Save & Calculate Premium'],
  },
  {
    name: 'Arogya Sanjeevani without the good health confirmation: answers left to the advisor',
    start: DASHBOARD,
    client: FAMILY,
    policy: 'arogya-sanjeevani',
    goodHealth: false,
    outcome: 'ready',
    expect: {
      self: '12/04/1986',
      diabetes: [null, null, null, null, null, null],
      saved: false,
    },
    toDo: ['diabetes and hypertension answers of each member'],
  },
  {
    name: 'Jan Arogya Bima (shorter tile name): daughter then son share one numbering',
    start: DASHBOARD,
    client: FAMILY,
    policy: 'jan-arogya-bima',
    goodHealth: false,
    outcome: 'ready',
    expect: {
      heading: 'Jan Arogya Bima Policy (Cashless facility available) Insurance',
      self: '12/04/1986',
      spouse: '01/02/1984',
      child0: '05/05/2016',
      child1: '07/07/2019',
      kinds: ['daughter', 'son'],
      saved: false,
    },
  },
  {
    name: "Premier Mediclaim: New India's health question answered No on the dashboard, form filled",
    start: DASHBOARD,
    client: FAMILY,
    policy: 'premier-mediclaim',
    goodHealth: true,
    outcome: 'ready',
    expect: {
      heading: 'New India Premier Mediclaim Policy (Cashless facility available) Insurance',
      self: '12/04/1986',
      child1: '07/07/2019',
      saved: false,
    },
    toDo: ['plan (A or B), cover type and sum insured'],
  },
  {
    name: 'Premier Mediclaim without the confirmation is refused before anything is touched',
    start: DASHBOARD,
    client: FAMILY,
    policy: 'premier-mediclaim',
    goodHealth: false,
    outcome: 'refused',
    message: 'cannot be filled in automatically',
    expect: { heading: 'Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .' },
  },
  {
    name: 'Cancer Guard: each member’s gender',
    start: DASHBOARD,
    client: FAMILY,
    policy: 'cancer-guard',
    goodHealth: false,
    outcome: 'ready',
    expect: { genders: [true, true, true, true], child0: '05/05/2016', saved: false },
    toDo: ['smoking and tobacco answers of each member'],
  },
  {
    name: 'New India Mediclaim already open: 2-year period and each member’s sum insured',
    start: '/NIABancsPortal/QuoteNonCustomer.html?p=mc',
    client: {
      ...FAMILY,
      preferences: { coverType: 'individual', sumInsuredPaise: 20_000_000, tenureYears: 2 },
    },
    policy: 'mediclaim',
    goodHealth: false,
    outcome: 'ready',
    expect: {
      period: '2',
      sums: ['string:200000', 'string:200000', 'string:200000', 'string:200000'],
      child1: '07/07/2019',
      saved: false,
    },
    toDo: ["each child's dependent type"],
  },
  {
    name: 'a member New India’s form does not take stops with a clear reason (Mediclaim: no in-laws)',
    start: '/NIABancsPortal/QuoteNonCustomer.html?p=mc',
    client: WITH_ELDERS,
    policy: 'mediclaim',
    goodHealth: false,
    outcome: 'refused',
    problem: 'does not cover parents-in-law',
    expect: { self: '' },
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  const today = new Date(2026, 10, 4);
  let failures = 0;
  for (const c of CASES) {
    const ses = session.fromPartition(`nia-health-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    await win.loadURL(origin + c.start);
    const result = await runNiaHealthQuote({
      windows: () => [win],
      client: c.client,
      policy: c.policy,
      goodHealth: c.goodHealth,
      today,
    });
    const state = await win.webContents
      .executeJavaScript(READ)
      .catch((e) => ({ error: e.message }));
    win.destroy();
    const problems = [];
    if (result.outcome !== c.outcome)
      problems.push(
        `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.problems)}`,
      );
    if (c.message && !result.message.includes(c.message))
      problems.push(`message "${result.message}" lacks "${c.message}"`);
    if (c.problem && !result.problems.some((p) => p.includes(c.problem)))
      problems.push(`problems ${JSON.stringify(result.problems)} lack "${c.problem}"`);
    for (const [k, v] of Object.entries(c.expect ?? {}))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    for (const item of c.toDo ?? [])
      if (!(result.toDo ?? []).some((t) => t.startsWith(item)))
        problems.push(`to do lacks "${item}": ${JSON.stringify(result.toDo)}`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  New India health: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} New India health checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
