// Runs the New India overseas travel quote automation (bundled real code) against the local copy
// of its dashboard and three travel forms, and checks what was filled, what is left to the
// advisor, New India's two questions (pre-existing illness on the dashboard, PAN on the form), and
// that nothing was saved. Contacts no insurer: the pages are served from 127.0.0.1. Exits 0 only
// if every check passes. Started by run.mjs travel (npm run test:nia -- travel).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./travel-form.cjs');
const { installNavigationPolicy, createLogger, runNiaTravelQuote, setSessionPolicy } = require(
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

const TRAVELLER = {
  customer: {
    name: 'Synthetic Middle Traveller',
    phone: '9876543210',
    email: 'traveller@example.test',
  },
  pincode: '560001',
  dateOfBirth: '1986-04-12',
  gender: 'female',
  maritalStatus: 'married',
  occupation: 'Professional',
  passport: { expiryDate: '2030-01-14' },
  proposal: {
    address: '12 Synthetic Street',
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'spouse',
  },
};
const EASE = {
  form: 'travel-ease',
  destination: 'worldwide',
  purpose: 'holiday',
  leavingDate: '2026-11-20',
  returnDate: '2026-11-29',
  plan: '100000',
};
const DASHBOARD = '/NIABancsPortal/NonCustomerDashboard.html#/home';
const READ = `(() => {
  const v = (s) => document.querySelector(s)?.value ?? null;
  const r = (n) => document.querySelector('input[name="' + n + '"]:checked')?.value ?? null;
  return {
    heading: document.querySelector('h3')?.textContent ?? null,
    destination: r('TravelDestination') ?? v('select[name="TravelDestination"]'), purpose: r('TravelPurpose'),
    plan: r('Plan') ?? v('#Plan'), leaving: v('#leavingIndia'), returning: v('#returningIndia'),
    days: v('#travelDays'), months: v('#travelDuration'), dob: v('#ompDateOfBirth'),
    holder: r('policyHolder'), title: v('#typeOfOrg'), first: v('#firstNameCreate'),
    middle: v('#middleNameCreate'), last: v('#lastNameCreate'), gender: r('g'), holderDob: v('#dob'),
    address: v('#buildingNo'), mobile: v('#mobileInd'), email: v('#emailInd'),
    occupation: v('#occupation'), passport: v('#passport'), expiry: v('#passportExpDt'),
    idType: v('#natureOfId'), idNo: v('#propIdDocNo'), preExisting: r('sufferingPreExDisease'),
    nominee: v('#nameOftheNominee'), nomineeRelation: v('#relationshipNominee'),
    panShown: !document.querySelector('#pan')?.classList.contains('hidden'),
    toggles: window.__toggles, saved: window.__saved,
  };
})()`;

const CASES = [
  {
    name: "Travel Ease from the dashboard: illness question answered No; New India's PAN question stops the run",
    start: DASHBOARD,
    trip: EASE,
    outcome: 'refused',
    message: 'asks whether the client has a PAN',
    expect: {
      heading: 'Overseas Travel Ease Policy (Business & Holiday) Insurance',
      panShown: true,
      leaving: '',
      saved: false,
    },
    // The advisor answers it, then presses Fill again: the run carries on in the open form.
    then: {
      answer: `document.querySelector('#no').click()`,
      outcome: 'ready',
      expect: {
        destination: 'WIUC',
        purpose: 'HOLIDAY',
        leaving: '20/11/2026',
        returning: '29/11/2026',
        days: '10',
        dob: '12/04/1986',
        plan: '100000',
        holder: 'newPolicyHolder',
        title: 'string:Mrs.',
        first: 'Synthetic',
        middle: 'Middle',
        last: 'Traveller',
        gender: 'F',
        holderDob: '12/04/1986',
        address: '12 Synthetic Street',
        mobile: '9876543210',
        email: 'traveller@example.test',
        occupation: 'string:PROFESSION',
        passport: 'Z1234567',
        expiry: '14/01/2030',
        idType: 'string:Passport',
        idNo: 'Z1234567',
        preExisting: 'N',
        nominee: 'Synthetic Nominee',
        nomineeRelation: 'string:SPOUSE',
        // Policy Holder, Traveller and Other Details opened once each.
        toggles: 3,
        saved: false,
      },
      toDo: [
        'whether the traveller holds an active New India policy',
        'state, city and PIN code',
        'bank details',
        'overseas address for correspondence',
        "nominee's date of birth",
        'Press Save & Calculate Premium',
      ],
    },
  },
  {
    name: 'Employment & Studies, form open, PAN answered: studies, the 2nd plan, 6 months',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=se&pan=0',
    trip: {
      form: 'studies-employment',
      destination: 'worldwide-excluding-usa-canada',
      purpose: 'studies',
      leavingDate: '2026-11-20',
      months: 6,
      plan: 2,
    },
    outcome: 'ready',
    message: '(plan D1)',
    expect: {
      destination: 'Area1',
      purpose: 'STUDY',
      plan: 'D1',
      months: 'string:6',
      returning: '19/05/2027',
      dob: '12/04/1986',
      last: 'Traveller',
      passport: 'Z1234567',
      saved: false,
    },
    toDo: ['visa type, sponsor name and address, university name and address'],
  },
  {
    name: 'Employment & Studies: a plan place New India does not offer stops at Plan',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=se&pan=0',
    trip: {
      form: 'studies-employment',
      destination: 'worldwide',
      purpose: 'employment',
      leavingDate: '2026-11-20',
      months: 3,
      plan: 2,
    },
    outcome: 'failed',
    step: 'Plan',
    message: 'offers 1 plans',
    expect: { plan: null, saved: false },
  },
  {
    name: 'Business & Holiday (CFT) from the dashboard: Travel Details only, no PAN question',
    start: DASHBOARD,
    trip: {
      form: 'business-holiday',
      destination: 'E2',
      purpose: 'business',
      leavingDate: '2026-11-20',
    },
    outcome: 'ready',
    expect: {
      heading: 'Overseas Mediclaim Insurance Policy (Business & Holiday) Insurance',
      destination: 'string:E2',
      purpose: 'BUSINESS',
      leaving: '20/11/2026',
      dob: '12/04/1986',
      saved: false,
    },
    toDo: ['Press Calculate Premium'],
  },
  {
    name: 'without the pre-existing illness confirmation: refused, nothing touched',
    start: DASHBOARD,
    trip: EASE,
    noPreExisting: false,
    outcome: 'refused',
    expect: { heading: 'Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .' },
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(c, result, state, problems) {
  if (result.outcome !== c.outcome)
    problems.push(
      `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.problems)}`,
    );
  if (c.step && result.step !== c.step) problems.push(`step ${result.step} (expected ${c.step})`);
  if (c.message && !result.message.includes(c.message))
    problems.push(`message "${result.message}" lacks "${c.message}"`);
  for (const [k, v] of Object.entries(c.expect ?? {}))
    if (!same(state[k], v))
      problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
  for (const item of c.toDo ?? [])
    if (!(result.toDo ?? []).some((t) => t.startsWith(item)))
      problems.push(`to do lacks "${item}": ${JSON.stringify(result.toDo)}`);
}

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  const today = new Date(2026, 10, 4);
  let failures = 0;
  for (const c of CASES) {
    const ses = session.fromPartition(`nia-travel-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    await win.loadURL(origin + c.start);
    const run = () =>
      runNiaTravelQuote({
        windows: () => [win],
        traveller: TRAVELLER,
        trip: c.trip,
        passportNumber: 'Z1234567',
        noPreExisting: c.noPreExisting ?? true,
        today,
      });
    const read = () => win.webContents.executeJavaScript(READ).catch((e) => ({ error: e.message }));
    const problems = [];
    check(c, await run(), await read(), problems);
    if (c.then && problems.length === 0) {
      await win.webContents.executeJavaScript(c.then.answer);
      check(c.then, await run(), await read(), problems);
    }
    win.destroy();
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  New India travel: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} New India travel checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
