// Runs ICICI Lombard's NYSA health-site automation (bundled real code, run-icici-nysa.ts) against
// the local copy of its pages (nysa-page.html, nysa-form.cjs): from NYSA's dashboard, its Health
// tile, the health site, then Elevate (members by NYSA's Adult / Child buttons, relationships and
// dates of birth in its Material dropdowns and calendar, tenure, sum insured, income band, the
// pre-existing disease answer, Generate Quote, the three plans' premiums); International Travel
// and Student Medical Travel (trip, traveller, the plan by its cover, Get quote, the Total
// premium). Checks Elevate's limits refuse at once, a student plan list that never fills hands the
// form over before Get quote, no signed-in tab is refused, and Save & Proceed / Proceed are never
// pressed. Contacts no insurer: served from 127.0.0.1 and localhost. Exits 0 only if every check
// passes. Started by run.mjs nysa (npm run test:nia -- nysa).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./nysa-form.cjs');
const {
  installNavigationPolicy,
  createLogger,
  runIciciElevateQuote,
  runIciciIntlTravelQuote,
  runIciciStudentTravelQuote,
  setSessionPolicy,
} = require(process.env.FQF_LOGIN_E2E_BUNDLE);

app.on('window-all-closed', () => {});
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.on(event, (err) => {
    console.log(`FAIL  harness error: ${err && err.message ? err.message : String(err)}`);
    app.exit(1);
  });
}
setTimeout(() => {
  console.log('FAIL  harness timed out');
  app.exit(1);
}, 420_000).unref();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const render = FIXTURES[url.pathname];
  res.writeHead(render ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(render ? render() : 'not found');
});

const FAMILY = {
  customer: { name: 'Synthetic Insured Person' },
  pincode: '380001',
  members: [
    { relationship: 'self', age: 40, dateOfBirth: '1986-01-25', gender: 'male' },
    { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02', gender: 'female' },
    { relationship: 'son', age: 8, dateOfBirth: '2018-03-14', gender: 'male' },
  ],
};
const ELEVATE = { sumInsured: 1000000, tenure: 2, annualIncome: 800000, preExistingDisease: false };
const TRAVELLER = {
  customer: { name: 'Synthetic Traveller' },
  pincode: '400001',
  dateOfBirth: '1990-02-20',
};
const STATE = '(() => window.__state())()';
const base = Math.round(10 * 900 * 3 * 1.1);

const CASES = [
  {
    name: "Elevate from NYSA's dashboard: Health tile, the form, members, choices, Generate Quote, three plans",
    start: '/#/dashboard',
    onNysa: true,
    run: (w) => runIciciElevateQuote({ ...w, client: FAMILY, run: ELEVATE }),
    outcome: 'ready',
    amount: String(base),
    plans: 3,
    expect: {
      type: 'New',
      pincode: '380001',
      city: 'AHMEDABAD, GUJARAT',
      adults: 2,
      children: 1,
      relations: ['SELF', 'SPOUSE', 'SON'],
      dobs: ['25/01/1986', '02/07/1988', '14/03/2018'],
      tenure: '2',
      sum: '₹ 10 L',
      income: '5,00,000 - 10,00,000',
      ped: 'No',
      generated: 1,
    },
    neverPressed: ['Proceed'],
  },
  {
    name: "Elevate with the tab already on the health site: back to NYSA's dashboard and its Health tile (Elevate's address alone is ICICI's 'page not found')",
    start: '/health/dashboard',
    run: (w) => runIciciElevateQuote({ ...w, client: FAMILY, run: ELEVATE }),
    outcome: 'ready',
    amount: String(base),
    plans: 3,
    expect: { adults: 2, children: 1, tenure: '2', ped: 'No', generated: 1 },
  },
  {
    name: 'Elevate when the health site stays on its dashboard after the Health tile: its Elevate tile (by its hover label), traced',
    start: '/?stay=1#/dashboard',
    onNysa: true,
    run: (w) => runIciciElevateQuote({ ...w, client: FAMILY, run: ELEVATE }),
    outcome: 'ready',
    amount: String(base),
    plans: 3,
    expect: { adults: 2, children: 1, generated: 1 },
    trace: [
      'start',
      "on NYSA's dashboard",
      "press NYSA's Health tile",
      'the health dashboard stayed: press its Elevate tile',
      'reached',
    ],
  },
  {
    name: 'Elevate whose Adult / Child buttons count up only by the "+" icon inside them (never the "−")',
    start: '/?plus=inside#/dashboard',
    onNysa: true,
    run: (w) => runIciciElevateQuote({ ...w, client: FAMILY, run: ELEVATE }),
    outcome: 'ready',
    amount: String(base),
    plans: 3,
    expect: {
      adults: 2,
      children: 1,
      relations: ['SELF', 'SPOUSE', 'SON'],
      minusPressed: 0,
      generated: 1,
    },
  },
  {
    name: 'Elevate whose list names the spouse WIFE (not SPOUSE): chosen by her other name; every list closed after it',
    start: '/?spouse=wife#/dashboard',
    onNysa: true,
    run: (w) => runIciciElevateQuote({ ...w, client: FAMILY, run: ELEVATE }),
    outcome: 'ready',
    amount: String(base),
    plans: 3,
    expect: {
      relations: ['SELF', 'WIFE', 'SON'],
      dobs: ['25/01/1986', '02/07/1988', '14/03/2018'],
      sum: '₹ 10 L',
      income: '5,00,000 - 10,00,000',
      generated: 1,
    },
  },
  {
    name: 'Elevate whose list lacks the relation altogether: left with what ICICI offers, the next lists, dates and toggles still filled',
    start: '/?spouse=wife#/dashboard',
    onNysa: true,
    run: (w) =>
      runIciciElevateQuote({
        ...w,
        client: {
          ...FAMILY,
          members: [
            FAMILY.members[0],
            { relationship: 'mother_in_law', age: 62, dateOfBirth: '1964-05-05', gender: 'female' },
          ],
        },
        run: ELEVATE,
      }),
    outcome: 'handed-over',
    finish: 'Generate Quote',
    toDo: "Adult 2: relationship: fill it in yourself (the insurer's list does not offer the saved value; it offers: SELF; WIFE; HUSBAND",
    expect: {
      relations: ['SELF', null],
      dobs: ['25/01/1986', '05/05/1964'],
      tenure: '2',
      sum: '₹ 10 L',
      income: '5,00,000 - 10,00,000',
      ped: 'No',
      generated: 0,
    },
  },
  {
    name: 'Elevate with three adults: refused at once (Elevate takes two)',
    start: '/#/dashboard',
    onNysa: true,
    run: (w) =>
      runIciciElevateQuote({
        ...w,
        client: {
          ...FAMILY,
          members: [
            ...FAMILY.members.slice(0, 2),
            { relationship: 'father', age: 66, dateOfBirth: '1960-01-01' },
          ],
        },
        run: ELEVATE,
      }),
    outcome: 'refused',
    problem: 'Elevate takes at most 2 adults',
  },
  {
    name: 'International Travel, already on the health site: trip, Asia, traveller, the Asia plan GOLD_A_25 by its exact name (not GOLD_A25), Get quote, Total premium',
    start: '/health/dashboard',
    run: (w) =>
      runIciciIntlTravelQuote({
        ...w,
        traveller: TRAVELLER,
        run: {
          departureDate: '2026-12-10',
          returnDate: '2026-12-30',
          state: 'Maharashtra',
          plan: 'GOLD_A_25',
          destination: 'asia',
        },
      }),
    outcome: 'ready',
    amount: String(21 * 25 * 5 + 1),
    expect: {
      subtype: 'Individual',
      state: 'MAHARASHTRA',
      trip: 'Round Trip',
      where: 'asia',
      visa: 'No',
      leaving: '10/12/2026',
      returning: '30/12/2026',
      dob: '20/02/1990',
      relation: 'Self',
      plan: 'GOLD_A_25',
      quoted: 1,
    },
    neverPressed: ['Save & Proceed'],
  },
  {
    name: 'Student Medical Travel: duration of at least the studies, USA / Canada, plan STUDENT_W100, Get quote, premium',
    start: '/health/dashboard',
    run: (w) =>
      runIciciStudentTravelQuote({
        ...w,
        traveller: TRAVELLER,
        run: {
          departureDate: '2026-12-10',
          returnDate: '2027-02-20',
          state: 'Gujarat',
          plan: 'STUDENT_W100',
          visitingUsaCanada: true,
        },
      }),
    outcome: 'ready',
    amount: String(90 * 100 * 3 + 1),
    expect: {
      state: 'GUJARAT',
      left: 'No',
      leaving: '10/12/2026',
      duration: '90 days',
      usa: 'Yes',
      dob: '20/02/1990',
      relation: 'Self',
      plan: 'STUDENT_W100',
      quoted: 1,
    },
    neverPressed: ['Save & Proceed'],
  },
  {
    name: 'Student Medical Travel without a plan (its list never fills, as recorded): handed over before Get quote',
    start: '/travel/student-medical-travel?noplans=1',
    run: (w) =>
      runIciciStudentTravelQuote({
        ...w,
        traveller: TRAVELLER,
        run: {
          departureDate: '2026-12-10',
          returnDate: '2027-02-20',
          state: 'Gujarat',
          visitingUsaCanada: false,
        },
      }),
    outcome: 'handed-over',
    finish: 'Get quote',
    toDo: "Plan: choose it in ICICI's list",
    expect: { usa: 'No', relation: 'Self', plan: null, quoted: 0 },
  },
  {
    name: "International Travel with a plan ICICI does not list for the destination (Schengen's GOLD_S_50 for the USA): the rest filled, handed over before Get quote",
    start: '/travel/international-travel',
    run: (w) =>
      runIciciIntlTravelQuote({
        ...w,
        traveller: TRAVELLER,
        run: {
          departureDate: '2026-12-10',
          returnDate: '2026-12-30',
          state: 'Maharashtra',
          plan: 'GOLD_S_50',
          destination: 'usa-canada',
        },
      }),
    outcome: 'handed-over',
    finish: 'Get quote',
    toDo: 'Plan: GOLD_S_50: fill it in yourself',
    expect: { where: 'USAorCanada', relation: 'Self', plan: null, quoted: 0 },
  },
  {
    name: "International Travel to Other: GOLD_X50 as spelt, not ICICI's Gold_X50 beside it",
    start: '/travel/international-travel',
    run: (w) =>
      runIciciIntlTravelQuote({
        ...w,
        traveller: TRAVELLER,
        run: {
          departureDate: '2026-12-10',
          returnDate: '2026-12-30',
          state: 'Rajasthan',
          plan: 'GOLD_X50',
          destination: 'other',
        },
      }),
    outcome: 'ready',
    amount: String(21 * 50 * 5 + 1),
    expect: { where: 'otherCountries', state: 'RAJASTHAN', plan: 'GOLD_X50', quoted: 1 },
    neverPressed: ['Save & Proceed'],
  },
  {
    name: 'no tab on NYSA: refused, told to sign in',
    start: null,
    run: (w) => runIciciElevateQuote({ ...w, client: FAMILY, run: ELEVATE }),
    outcome: 'refused',
    message: "Sign in to ICICI Lombard's NYSA first",
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origins = { health: `http://127.0.0.1:${port}`, nysa: `http://localhost:${port}` };
  installNavigationPolicy(createLogger([]));
  const only = process.env.NYSA_ONLY;
  const cases = only ? CASES.filter((c) => c.name.includes(only)) : CASES;
  let failures = 0;
  for (const c of cases) {
    const ses = session.fromPartition(`nysa-${Math.random()}`);
    setSessionPolicy(ses, {
      navigate: (url) => url.startsWith(origins.health + '/') || url.startsWith(origins.nysa + '/'),
      popup: () => null,
    });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    if (c.start) await win.loadURL((c.onNysa ? origins.nysa : origins.health) + c.start);
    let saved = null;
    const diagnose = (_name, data) => {
      saved = data;
      return 'icici-lombard-trace.json';
    };
    const result = await c.run({ windows: () => (c.start ? [win] : []), origins, diagnose });
    const state = c.expect
      ? await win.webContents.executeJavaScript(STATE).catch((e) => ({ error: e.message }))
      : {};
    const problems = [];
    if (result.outcome !== c.outcome)
      problems.push(
        `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.toDo ?? result.problems)}`,
      );
    if (c.message && !result.message.includes(c.message))
      problems.push(`message "${result.message}" lacks "${c.message}"`);
    if (c.problem && !result.problems.some((p) => p.includes(c.problem)))
      problems.push(`problems ${JSON.stringify(result.problems)} lack "${c.problem}"`);
    if (c.amount && result.premium?.amount !== c.amount)
      problems.push(`premium ${JSON.stringify(result.premium)} (expected ${c.amount})`);
    if (c.plans && result.plans?.length !== c.plans)
      problems.push(`plans ${JSON.stringify(result.plans)}`);
    if (c.finish && result.finish?.button !== c.finish)
      problems.push(`finish ${JSON.stringify(result.finish)} (expected ${c.finish})`);
    if (c.toDo && !(result.toDo ?? []).some((t) => t.startsWith(c.toDo)))
      problems.push(`toDo ${JSON.stringify(result.toDo)} lacks "${c.toDo}"`);
    for (const [k, v] of Object.entries(c.expect ?? {}))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    if (c.trace) {
      const moves = (saved?.trace ?? []).map((e) => e.what);
      let from = 0;
      for (const want of c.trace) {
        const at = moves.indexOf(want, from);
        if (at < 0)
          problems.push(`trace lacks "${want}" (after ${from}): ${JSON.stringify(moves)}`);
        else from = at + 1;
      }
      if (JSON.stringify(saved).includes('?'))
        problems.push('trace holds a query string (a token could be in it)');
      if (!(result.toDo ?? []).some((t) => t.includes('icici-lombard-trace.json')))
        problems.push(`result does not name the trace: ${JSON.stringify(result.toDo)}`);
    }
    for (const b of c.neverPressed ?? [])
      if ((state.pressed ?? []).includes(b)) problems.push(`pressed ${b}`);
    win.destroy();
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  ICICI NYSA: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${cases.length - failures} of ${cases.length} ICICI NYSA checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
