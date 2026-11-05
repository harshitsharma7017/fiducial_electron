// Runs the HDFC ERGO PIE automation (bundled real code, src/main/quotes/run-hdfc.ts) against the
// local copy of PIE's Private Car, Two Wheeler, MST, Optima Secure and Retail Travel forms (pie-page.html), and checks what is
// filled, that Calculate Premium is pressed and the premium read is the one shown, PIE's own
// complaint (IDV out of range) stops the run with its words, a tab not signed in to PIE is
// refused, and Generate Quote is never pressed. Contacts no insurer: served from 127.0.0.1.
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
}, 240_000).unref();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const render = FIXTURES[url.pathname];
  res.writeHead(render ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(render ? render() : 'not found');
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
    name: "an IDV out of PIE's range: stopped with PIE's own words",
    start: '/PrivateCar/CreateQuote',
    kind: 'motor',
    vehicle: { ...CAR, idvRupees: 2000000 },
    run: RUN,
    outcome: 'failed',
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
    name: 'no tab signed in to PIE: refused, told to open a product from 1up',
    start: null,
    kind: 'motor',
    vehicle: CAR,
    run: RUN,
    outcome: 'refused',
    message: "Open any product from HDFC's 1up",
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
  installNavigationPolicy(createLogger([]));
  let failures = 0;
  for (const c of CASES) {
    const ses = session.fromPartition(`pie-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    if (c.start) await win.loadURL(origin + c.start);
    const windows = () => [win];
    const today = new Date(2026, 10, 5);
    const result =
      c.kind === 'mst'
        ? await runHdfcMstQuote({ windows, client: c.client, run: c.run, origin })
        : c.kind === 'retail'
          ? await runHdfcRetailQuote({ windows, client: c.client, run: c.run, today, origin })
          : c.kind === 'travel'
            ? await runHdfcTravelQuote({
                windows,
                traveller: c.traveller,
                run: c.run,
                today,
                origin,
              })
            : await runHdfcMotorQuote({ windows, vehicle: c.vehicle, run: c.run, origin });
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
    for (const [k, v] of Object.entries(c.expect ?? {}))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    win.destroy();
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  HDFC PIE: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} HDFC PIE checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
