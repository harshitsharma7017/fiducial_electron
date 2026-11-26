// Runs the HDFC ERGO PIE automation (bundled real code, src/main/quotes/run-hdfc.ts) against the
// local copy of PIE's Private Car, Two Wheeler, MST, Optima Secure and Retail Travel forms (pie-page.html), and checks what is
// filled, that Calculate Premium is pressed and the premium read is the one shown, PIE's own
// complaint (IDV out of range) stops the run with its words, a tab on 1up's home page (oneup-page.html,
// served from localhost: another origin) is taken to PIE by Issue Quotes & Policy and Private Car,
// without a tap on the canvas, a tab on neither is refused, and Generate Quote is never pressed.
// Contacts no insurer: served from 127.0.0.1 and localhost.
// Started by run.mjs pie (npm run test:nia -- pie).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./pie-form.cjs');
const {
  installNavigationPolicy,
  createLogger,
  runHdfcMotorQuote,
  runHdfcMstQuote,
  runHdfcRetailQuote,
  runHdfcTravelQuote,
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
}, 600_000).unref();
const hanging = new Set();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // A request PIE's page keeps open (the page never finishes loading).
  if (url.pathname === '/hang') {
    hanging.add(res);
    return;
  }
  const render = FIXTURES[url.pathname];
  const answer = () => {
    res.writeHead(render ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(render ? render(url.searchParams) : 'not found');
  };
  // PIE's forms answer slowly (seconds, live): a form asked for while PIE's own redirect is under
  // way is overtaken by it unless the run waits for that redirect.
  if (/\/CreateQuote$/i.test(url.pathname)) setTimeout(answer, 2500);
  else answer();
});

const CAR = {
  vehicleClass: 'private-car',
  condition: 'new',
  registrationDate: '2026-11-03',
  zone: 'A',
  idvRupees: 900000,
  make: 'Maruti',
  model: 'Swift',
  variant: 'VXI',
  manufactureYear: 2026,
  engineNumber: 'ENG12345',
};
const USED = {
  ...CAR,
  condition: 'pre-owned',
  registrationDate: '2022-04-10',
  manufactureYear: 2022,
  claimLastYear: false,
  previousNcbPercent: 25,
};
const BIKE = {
  ...CAR,
  vehicleClass: 'two-wheeler',
  make: 'Honda',
  model: 'Activa 6G',
  variant: 'STD',
  idvRupees: 70000,
};
const CUSTOMER = {
  name: 'Synthetic Insured',
  email: 'synthetic@example.test',
  mobile: '9876543210',
};
const RUN = {
  product: 'private-car',
  cover: 'comprehensive',
  customerType: 'individual',
  rtoCity: 'Ahmedabad',
  customer: CUSTOMER,
};
const RENEWAL = {
  ...RUN,
  registrationNumber: 'GJ01AB1234',
  previous: { endDate: '2026-11-20', policyType: 'tp', insurer: 'ICICI LOMBARD' },
};
const FAMILY = {
  customer: { name: 'Synthetic Insured' },
  pincode: '380001',
  members: [
    { relationship: 'son', age: 8, dateOfBirth: '2018-03-14' },
    { relationship: 'self', age: 40, dateOfBirth: '1986-01-25' },
    { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02' },
  ],
};
const READ_MOTOR = `(() => {
  const v = (s) => document.querySelector(s)?.value ?? null;
  return {
    path: location.pathname, ...window.__form,
    reg: [29, 30, 31, 32].map((n) => v('#RegistrationNumber' + n)),
    regDate: v('#Risk1'), year: v('#YearOfManufacturer'), idv: v('#IDV_SumInsured'), engine: v('#EngineNumber'),
    company: v('#Company'), prevEnd: v('#PolicyEffectiveFromDate'), prevType: v('[name="PrevPolicyType"]'), prevNcb: v('[name="PrevNcbPercentage"]'),
    name: v('#CustomerName'), email: v('#CustomerEmailMask'), mobile: v('#CustomerMobileMask'),
    total: document.querySelector('#total')?.textContent ?? '', calculated: window.__calculated, saved: window.__saved,
  };
})()`;
const READ_MST = `(() => ({
  ...window.__plan,
  adults: document.querySelector('#adultCount').value, children: document.querySelector('#childCount').value,
  dobs: Array.from(document.querySelectorAll('[id^="Info02_"]')).map((i) => i.value),
  relations: Array.from(document.querySelectorAll('[id^="Info12_"]')).map((s) => s.value),
  total: document.querySelector('#total').textContent, saved: window.__saved,
}))()`;

const CASES = [
  {
    name: 'new private car, starting on another PIE page: every detail, Calculate Premium, premium read',
    start: '/WrapperApi/RedirectToDashboardGet',
    kind: 'motor',
    vehicle: CAR,
    run: RUN,
    outcome: 'ready',
    amount: '24072',
    read: READ_MOTOR,
    expect: {
      path: '/PrivateCar/CreateQuote',
      cover: 'Comprehensive',
      customer: 'Individual',
      business: 'new',
      make: 'MARUTI',
      model: 'SWIFT - VXI',
      rto: 'AHMEDABAD - GUJARAT',
      regDate: '03/11/2026',
      year: '2026',
      idv: '900000',
      engine: 'ENG12345',
      name: 'Synthetic Insured',
      email: 'synthetic@example.test',
      mobile: '9876543210',
      total: 'Rs24072',
      calculated: 1,
      saved: false,
    },
  },
  {
    name: 'pre-owned car renewed from another insurer: registration number and previous policy',
    start: '/PrivateCar/CreateQuote',
    kind: 'motor',
    vehicle: USED,
    run: RENEWAL,
    outcome: 'ready',
    amount: '22302',
    read: READ_MOTOR,
    expect: {
      business: 'renewal',
      reg: ['GJ', '01', 'AB', '1234'],
      regDate: '10/04/2022',
      year: '2022',
      company: 'ICICI LOMBARD',
      prevEnd: '20/11/2026',
      prevType: 'string:TP',
      prevNcb: '25',
      prevClaims: 'No',
      saved: false,
    },
  },
  {
    name: "an IDV out of PIE's range: handed over with PIE's own words",
    start: '/PrivateCar/CreateQuote',
    kind: 'motor',
    vehicle: { ...CAR, idvRupees: 2000000 },
    run: RUN,
    outcome: 'handed-over',
    message: 'PIE says: User Idv should be in between 700000 - 1300000',
    read: READ_MOTOR,
    expect: { total: '', saved: false },
  },
  {
    name: 'new two-wheeler, liability only, on the Blaze form (no IDV)',
    start: '/WrapperApi/RedirectToDashboardGet',
    kind: 'motor',
    vehicle: BIKE,
    run: { ...RUN, product: 'two-wheeler', cover: 'liability' },
    outcome: 'ready',
    amount: '4031',
    read: READ_MOTOR,
    expect: {
      path: '/TwoWheelerBlaze/CreateQuote',
      cover: 'Liability',
      model: 'ACTIVA 6G - STD',
      idv: '',
      saved: false,
    },
  },
  {
    name: "on 1up's home page: Issue Quotes & Policy, PIE Dashboard, PIE, then the car form and premium",
    start: '/dashBoardScreen',
    on1up: true,
    kind: 'motor',
    vehicle: CAR,
    run: RUN,
    outcome: 'ready',
    amount: '24072',
    read: READ_MOTOR,
    // Tapped by their labels (not the saved quote also reading Private Car), never on the canvas.
    redirect:
      'tapped=Issue%20Quotes%20%26%20Policy%0ANew%20business%20and%20renewals%7CPIE%20Dashboard&canvasTaps=0',
    expect: { path: '/PrivateCar/CreateQuote', make: 'MARUTI', calculated: 1, saved: false },
  },
  {
    name: "1up without PIE Dashboard: its Private Car quick quote opens 1up's own screen, not PIE; refused, saying what 1up shows",
    start: '/dashBoardScreen?nodash=1',
    on1up: true,
    kind: 'mst',
    client: FAMILY,
    run: { cover: 'family-floater', years: 2 },
    outcome: 'refused',
    message: '1up\'s "Private Car" did not lead to PIE within 20 seconds.',
    trace: [
      'tap PIE Dashboard',
      'tap Medisure Super Top Up',
      'tap Private Car',
      'Private Car did not lead to PIE in time',
    ],
  },
  {
    name: '1up covered by a message: Issue Quotes & Policy not found, told to open PIE by hand',
    start: '/dashBoardScreen?popup=1',
    on1up: true,
    kind: 'motor',
    vehicle: CAR,
    run: RUN,
    outcome: 'refused',
    message: 'The app could not open PIE from 1up: 1up\'s "Issue Quotes & Policy" was not found',
  },
  {
    name: 'no tab on 1up or PIE: refused, told to sign in to 1up',
    start: null,
    kind: 'motor',
    vehicle: CAR,
    run: RUN,
    outcome: 'refused',
    message: "Sign in to HDFC ERGO's 1up first",
  },
  {
    name: 'MST family floater, 2 years: members adults first, Cover Detail, premium read',
    start: '/WrapperApi/RedirectToDashboardGet',
    kind: 'mst',
    client: FAMILY,
    run: { cover: 'family-floater', years: 2 },
    outcome: 'ready',
    amount: '6900',
    read: READ_MST,
    expect: {
      business: 'New Business',
      cover: 'Family Floater',
      term: '2 Years',
      adults: '2',
      children: '1',
      dobs: ['25/01/1986', '02/07/1988', '14/03/2018'],
      relations: ['string:Self', 'string:Spouse', 'string:Dependent Son'],
      total: 'Rs6900',
      saved: false,
    },
  },
  {
    name: "MST from 1up as it is now: PIE Dashboard (not the Private Car quick quote), PIE's dashboard, then the MST form",
    trace: [
      'start',
      '1up home shows',
      'trying PIE Dashboard',
      'tap Issue Quotes & Policy',
      '1up shows',
      'tap PIE Dashboard',
      'PIE Dashboard led to PIE',
      'PIE settled',
      'loading the form',
      'the form is ready',
    ],
    start: '/dashBoardScreen',
    on1up: true,
    kind: 'mst',
    client: FAMILY,
    run: { cover: 'family-floater', years: 2 },
    outcome: 'ready',
    amount: '6900',
    read: READ_MST,
    expect: {
      business: 'New Business',
      cover: 'Family Floater',
      term: '2 Years',
      adults: '2',
      children: '1',
      dobs: ['25/01/1986', '02/07/1988', '14/03/2018'],
      relations: ['string:Self', 'string:Spouse', 'string:Dependent Son'],
      total: 'Rs6900',
      saved: false,
    },
  },
  {
    name: 'Optima Secure family, 2 years, 10 lakh: lists, eldest age, members, POSP, premium after BASIC DETAILS',
    start: '/WrapperApi/RedirectToDashboardGet',
    kind: 'retail',
    client: FAMILY,
    run: {
      product: 'optima-secure',
      cover: 'family',
      years: 2,
      sumInsuredLacs: 10,
      city: 'Mumbai',
      posp: 'Synthetic POSP',
    },
    outcome: 'ready',
    amount: '25000',
    read: `(() => ({
      ...window.__plan,
      business: document.querySelector('#BusinessType').value, planType: document.querySelector('#OptimaSecurePlanType').value,
      age: document.querySelector('#AgeOfIndividual').value, period: document.querySelector('[name="PolicyPeriod"]').value,
      lacs: document.querySelector('[name="SumInsuredInLacs"]').value, members: document.querySelector('[name="IndividualFamilyPlan"]').value,
      pospType: document.querySelector('#PospType').value, saved: window.__saved,
    }))()`,
    expect: {
      cover: 'Family',
      business: 'New Business',
      planType: 'Optima Secure',
      age: '40',
      period: '2 Year',
      lacs: '10',
      members: '2Adult+1Child',
      pospType: 'POSP',
      posp: 'SYNTHETIC POSP - 1234',
      saved: false,
    },
  },
  {
    name: 'older 1up without PIE Dashboard: Optima Secure by its own tile ("my:Optima Secure"), PIE opens that form, never Private Car',
    start: '/dashBoardScreen?old=1',
    on1up: true,
    kind: 'retail',
    client: FAMILY,
    run: {
      product: 'optima-secure',
      cover: 'family',
      years: 2,
      sumInsuredLacs: 10,
      city: 'Mumbai',
      posp: 'Synthetic POSP',
    },
    outcome: 'ready',
    amount: '25000',
    redirect:
      'tapped=Issue%20Quotes%20%26%20Policy%0ANew%20business%20and%20renewals%7Cmy%3AOptima%20Secure&canvasTaps=0',
    notVisited: '/PrivateCar/',
    trace: [
      'start',
      '1up home shows',
      'trying PIE Dashboard',
      'tap PIE Dashboard',
      'trying Optima Secure',
      'tap Optima Secure',
      'Optima Secure led to PIE',
      'PIE settled',
      'the form is ready',
    ],
    read: `(() => ({ planType: document.querySelector('#OptimaSecurePlanType').value, saved: window.__saved }))()`,
    expect: { planType: 'Optima Secure', saved: false },
  },
  {
    name: 'health from 1up, PIE never finishing loading: PIE Dashboard, then the Optima Secure form itself, premium',
    start: '/dashBoardScreen?hang=1',
    on1up: true,
    kind: 'retail',
    client: FAMILY,
    run: {
      product: 'optima-secure',
      cover: 'family',
      years: 2,
      sumInsuredLacs: 10,
      city: 'Mumbai',
      posp: 'Synthetic POSP',
    },
    outcome: 'ready',
    amount: '25000',
    read: `(() => ({
      ...window.__plan,
      business: document.querySelector('#BusinessType').value, planType: document.querySelector('#OptimaSecurePlanType').value,
      age: document.querySelector('#AgeOfIndividual').value, period: document.querySelector('[name="PolicyPeriod"]').value,
      lacs: document.querySelector('[name="SumInsuredInLacs"]').value, members: document.querySelector('[name="IndividualFamilyPlan"]').value,
      pospType: document.querySelector('#PospType').value, saved: window.__saved,
    }))()`,
    expect: {
      cover: 'Family',
      business: 'New Business',
      planType: 'Optima Secure',
      age: '40',
      period: '2 Year',
      lacs: '10',
      members: '2Adult+1Child',
      pospType: 'POSP',
      posp: 'SYNTHETIC POSP - 1234',
      saved: false,
    },
  },
  {
    name: 'Retail Travel: new, individual, dates, plan, traveller, Calculate Premium, premium',
    start: '/Travel/CreateQuote',
    kind: 'travel',
    traveller: {
      customer: { name: 'Synthetic Traveller' },
      pincode: '380001',
      dateOfBirth: '1990-05-06',
    },
    run: { departureDate: '2026-12-01', returnDate: '2026-12-10', plan: 'Gold' },
    outcome: 'ready',
    amount: '1888',
    read: `(() => ({
      ...window.__plan,
      from: document.querySelector('#PolicyEffectiveFromDate').value, to: document.querySelector('#PolicyEffectiveToDate').value,
      dob: document.querySelector('#Info02_0').value, relation: document.querySelector('#Info12_0').value, saved: window.__saved,
    }))()`,
    expect: {
      business: 'New',
      cover: 'Individual',
      plan: 'Gold',
      from: '01/12/2026',
      to: '10/12/2026',
      dob: '06/05/1990',
      relation: 'string:Self',
      saved: false,
    },
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // 1up's copy, on another origin than PIE's (as 1up.hdfcergo.com and pie.hdfcergo.com are).
  const oneUpOrigin = `http://localhost:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  let failures = 0;
  // PIE_ONLY=<words>: only the cases whose name holds them (when looking into one).
  const only = process.env.PIE_ONLY;
  for (const c of only ? CASES.filter((x) => x.name.includes(only)) : CASES) {
    const ses = session.fromPartition(`pie-${Math.random()}`);
    setSessionPolicy(ses, {
      navigate: (url) => url.startsWith(origin + '/') || url.startsWith(oneUpOrigin + '/'),
      popup: () => null,
    });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    const visited = [];
    win.webContents.on('did-navigate', (_e, url) => visited.push(url));
    if (c.start) await win.loadURL((c.on1up ? oneUpOrigin : origin) + c.start);
    const windows = () => [win];
    const today = new Date(2026, 10, 5);
    // The run's trace (diagnostics), as the app would save it.
    let saved = null;
    const diagnose = (_name, data) => {
      saved = data;
      return 'hdfc-ergo-trace.json';
    };
    const result =
      c.kind === 'mst'
        ? await runHdfcMstQuote({
            windows,
            client: c.client,
            run: c.run,
            origin,
            oneUpOrigin,
            diagnose,
          })
        : c.kind === 'retail'
          ? await runHdfcRetailQuote({
              windows,
              client: c.client,
              run: c.run,
              today,
              origin,
              oneUpOrigin,
              diagnose,
            })
          : c.kind === 'travel'
            ? await runHdfcTravelQuote({
                windows,
                traveller: c.traveller,
                run: c.run,
                today,
                origin,
                diagnose,
              })
            : await runHdfcMotorQuote({
                windows,
                vehicle: c.vehicle,
                run: c.run,
                origin,
                oneUpOrigin,
                diagnose,
              });
    const state = c.read
      ? await win.webContents.executeJavaScript(c.read).catch((e) => ({ error: e.message }))
      : {};
    const problems = [];
    if (result.outcome !== c.outcome)
      problems.push(
        `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.toDo ?? result.problems)}`,
      );
    if (c.message && !result.message.includes(c.message))
      problems.push(`message "${result.message}" lacks "${c.message}"`);
    if (c.amount && result.premium?.amount !== c.amount)
      problems.push(`premium ${JSON.stringify(result.premium)} (expected ${c.amount})`);
    if (c.redirect && !visited.some((u) => u.includes('/WrapperApi/') && u.includes(c.redirect)))
      problems.push(`no PIE redirect with ${c.redirect}: ${JSON.stringify(visited)}`);
    // The trace: saved, named in the result, holding these moves in this order, no query string.
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
      if (!(result.toDo ?? []).some((t) => t.includes('hdfc-ergo-trace.json')))
        problems.push(`result does not name the trace: ${JSON.stringify(result.toDo)}`);
    }
    if (c.notVisited && visited.some((u) => u.includes(c.notVisited)))
      problems.push(`went to ${c.notVisited}: ${JSON.stringify(visited)}`);
    for (const [k, v] of Object.entries(c.expect ?? {}))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    win.destroy();
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  HDFC PIE: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  const ran = only ? CASES.filter((x) => x.name.includes(only)).length : CASES.length;
  console.log(`\n${ran - failures} of ${ran} HDFC PIE checks passed`);
  for (const res of hanging) res.destroy();
  server.close();
  app.exit(failures ? 1 : 0);
});
