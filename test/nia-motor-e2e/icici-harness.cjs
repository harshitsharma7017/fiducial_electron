// Runs the ICICI Lombard NYSA motor automation (bundled real code) against the local copy of NYSA
// (icici-form.cjs): from the dashboard's Motor tile or another NYSA Motor screen, Rollover, the
// ownership question on the car flow, the registration number, Fetch Vehicle Data, ICICI's
// "Switching to the Two Wheeler buying flow" answered OK, and the Total Premium read at ICICI's
// IDV or the vehicle's (kept within ICICI's limits). Checks that Buy Now and Share Quote are never
// pressed, that a vehicle Vahan does not know stops with ICICI's message, and that a new vehicle
// is refused before anything is touched. Contacts no insurer: the pages are served from
// 127.0.0.1. Exits 0 only if every check passes. Started by run.mjs icici
// (npm run test:nia -- icici).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./icici-form.cjs');
const { installNavigationPolicy, createLogger, runIciciMotorQuote, setSessionPolicy } = require(
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

const CAR = {
  vehicleClass: 'private-car',
  condition: 'pre-owned',
  registrationDate: '2021-06-15',
  zone: 'A',
  idvRupees: 450000,
};
const BIKE = { ...CAR, vehicleClass: 'two-wheeler', idvRupees: 15000 };
const RUN = { registrationNumber: 'MH01AB1234', ownershipChanged: false, idv: 'insurer' };
const premium = (idv) => Math.round(400 + idv * 0.115);
const inr = (n) => n.toLocaleString('en-IN');

const CASES = [
  {
    name: "a car from the dashboard's Motor tile: Rollover, ownership No, ICICI's IDV",
    start: '/',
    vehicle: CAR,
    run: RUN,
    outcome: 'ready',
    message: `ICICI Lombard worked the premium out: ₹${inr(premium(18568))} (Total Premium).`,
    premium: {
      label: 'ICICI Lombard motor, MH01AB1234, IDV ₹18,568',
      amount: String(premium(18568)),
    },
    expect: {
      policyType: 'Rollover',
      ownership: 'no',
      registration: 'MH01AB1234',
      flow: 'car',
      fetched: 1,
      idv: 18568,
    },
  },
  {
    name: "a two-wheeler's number from My Quote: ICICI switches flow (OK), the vehicle's IDV is used",
    start: '/NysaMotor/dashboard/my-quote',
    vehicle: BIKE,
    run: { ...RUN, registrationNumber: 'DL3SAB1234', ownershipChanged: true, idv: 'vehicle' },
    outcome: 'ready',
    message: `₹${inr(premium(15000))} (Total Premium).`,
    premium: {
      label: 'ICICI Lombard motor, DL3SAB1234, IDV ₹15,000',
      amount: String(premium(15000)),
    },
    expect: {
      policyType: 'Rollover',
      // The question is asked on the car flow only, before ICICI switches to the two-wheeler one:
      // answered as the advisor chose.
      ownership: 'yes',
      registration: 'DL3SAB1234',
      flow: 'tw',
      switched: true,
      idv: 15000,
    },
  },
  {
    name: "the vehicle's IDV above ICICI's limit: ICICI keeps its highest, and the advisor is told",
    start: '/NysaMotor/quote',
    vehicle: CAR,
    run: { ...RUN, idv: 'vehicle' },
    outcome: 'ready',
    message: "ICICI kept the IDV at ₹27,750 (the vehicle's ₹4,50,000 is outside what it allows).",
    premium: {
      label: 'ICICI Lombard motor, MH01AB1234, IDV ₹27,750',
      amount: String(premium(27750)),
    },
    expect: { idv: 27750 },
  },
  {
    // Request of 20 November 2026: the advisor enters the details on NYSA and gets the premium;
    // the app then reads it and saves the PDF.
    name: "a number Vahan does not know: hands the form over with ICICI's message",
    start: '/NysaMotor/quote',
    vehicle: CAR,
    run: { ...RUN, registrationNumber: 'ZZ01AB1234' },
    outcome: 'handed-over',
    message:
      'stopped at "Fetch Vehicle Data": ICICI says: Vehicle details not found. Please enter the vehicle details manually. Finish the form',
    expect: { registration: 'ZZ01AB1234', premium: undefined },
  },
  {
    name: 'a new vehicle: refused before anything is touched',
    start: '/NysaMotor/quote',
    vehicle: { ...CAR, condition: 'new' },
    run: RUN,
    outcome: 'refused',
    message: 'cannot be quoted on ICICI Lombard automatically',
    expect: { policyType: undefined, registration: undefined },
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function newWindow(origin) {
  const ses = session.fromPartition(`icici-${Math.random()}`);
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
  for (const c of CASES) {
    const win = await newWindow(origin);
    await win.loadURL(origin + c.start);
    const result = await runIciciMotorQuote({
      windows: () => [win],
      vehicle: c.vehicle,
      run: c.run,
    });
    const state = await win.webContents
      .executeJavaScript(`JSON.parse(sessionStorage.getItem('fqf') || '{}')`)
      .catch((e) => ({ error: e.message }));
    const problems = [];
    if (result.outcome !== c.outcome)
      problems.push(
        `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.problems)}`,
      );
    if (!result.message.includes(c.message) && !result.problems.join(' ').includes(c.message))
      problems.push(`message "${result.message}" lacks "${c.message}"`);
    if (c.premium && !same(result.premium, c.premium))
      problems.push(
        `premium ${JSON.stringify(result.premium)} (expected ${JSON.stringify(c.premium)})`,
      );
    if (c.premium && result.premium && Number(result.premium.amount) !== state.premium)
      problems.push(
        `premium ${result.premium.amount} is not what the page shows: ${state.premium}`,
      );
    for (const [k, v] of Object.entries(c.expect))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    if (state.bought || state.shared) problems.push('Buy Now or Share Quote was pressed');
    win.destroy();
    failures += problems.length ? 1 : 0;
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  ICICI Lombard: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} ICICI Lombard checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
