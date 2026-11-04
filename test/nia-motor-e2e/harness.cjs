// Runs the New India motor automation (bundled real code) against the local copy of New India's
// Private Car and Two Wheeler quote forms, and checks what was filled. Contacts no insurer: the
// pages are served from 127.0.0.1. Exits 0 only if every check passes. Started by run.mjs (npm run test:nia).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./form.cjs');
const { installNavigationPolicy, createLogger, runNiaMotorQuote, setSessionPolicy } = require(
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

const OBJ = 'detailQuote.detailQuoteTWPCObj';
const CAR = {
  vehicleClass: 'private-car',
  condition: 'new',
  registrationDate: '2026-11-01',
  zone: 'A',
  idvRupees: 610000,
  seatingCapacity: 5,
  make: 'Maruti',
  model: 'swift',
  variant: 'VXI',
  manufactureYear: 2026,
  fuelType: 'petrol',
  bodyType: 'hatch-back',
  colour: 'Pearl White',
  engineNumber: 'K12NE1234567',
  chassisNumber: 'MA3EZDE1S00123456',
  invoiceValueRupees: 680000,
};
const BIKE = {
  vehicleClass: 'two-wheeler',
  condition: 'new',
  registrationDate: '2026-10-20',
  zone: 'B',
  idvRupees: 85000,
  make: 'HONDA',
  model: 'ACTIVA',
  variant: 'DLX',
  manufactureYear: 2026,
  fuelType: 'petrol',
  colour: 'Cherry Red',
  engineNumber: 'JF50E1234567',
  chassisNumber: 'ME4JF501234567890',
  invoiceValueRupees: 92000,
};
const READ = `(() => {
  const M = (n) => document.querySelector('[ng-model="${OBJ}.' + n + '"]');
  const v = (n) => M(n)?.value ?? null;
  return {
    year: v('manufactureYear'), make: v('vehicleMake'), model: v('vehicleModel'),
    modelPicked: M('vehicleModel')?.dataset.picked ?? null, variant: v('vehicleVariant'),
    variantPicked: M('vehicleVariant')?.dataset.picked ?? null, engine: v('engineNo'),
    chassis: v('chasisNo'), seats: v('seatingCapacity'), typePC: v('typePC'),
    date: v('firstPurchaseDate'), zone: v('vehicleZone'), invoice: v('vehInvoiceVal'),
    idv: v('vehicleIDV'), colour: v('vehicleColor'), rcColour: v('colorAsPerRCbook'),
    body: v('bodyType'), ncbNo: document.querySelector('#preNCB1')?.checked ?? null,
    fuel: v('fuelType'), calculated: window.__calculated,
  };
})()`;

const CASES = [
  {
    name: 'new private car from the dashboard (MOTOR, Private Car): every detail, advisor IDV kept',
    start: '/NIABancsPortal/NonCustomerDashboard.html#/home',
    vehicle: CAR,
    outcome: 'ready',
    expect: {
      year: 'number:2026',
      make: 'string:MARUTI',
      model: 'SWIFT',
      modelPicked: 'SWIFT',
      variant: 'VXI',
      variantPicked: 'VXI',
      engine: 'K12NE1234567',
      chassis: 'MA3EZDE1S00123456',
      seats: '5',
      typePC: 'Private',
      date: '01/11/2026',
      zone: 'string:A',
      invoice: '680000',
      idv: '610000',
      colour: 'string:PEARLWHITE',
      rcColour: 'Pearl White',
      body: 'string:HATCH-BACK',
      ncbNo: true,
      fuel: 'string:Petrol',
      calculated: false,
    },
  },
  {
    name: 'new two-wheeler, Motor Products already shown: unlisted colour goes in as Other Color',
    start: '/NIABancsPortal/NonCustomerDashboard.html?motor=1#/home',
    vehicle: BIKE,
    outcome: 'ready',
    expect: {
      make: 'string:HONDA',
      model: 'ACTIVA',
      variant: 'DLX',
      typePC: null,
      body: null,
      date: '20/10/2026',
      zone: 'string:B',
      idv: '85000',
      colour: 'string:OTHERCOLOR',
      rcColour: 'Cherry Red',
      fuel: 'string:Petrol',
      calculated: false,
    },
  },
  {
    name: 'with the form already open: a model New India does not suggest stops at Model',
    start: '/NIABancsPortal/QuoteNonCustomer.html',
    vehicle: { ...CAR, model: 'ALTO' },
    outcome: 'failed',
    step: 'Model',
    message: 'suggests no model',
  },
  {
    name: "New India's alert stops the run with its message",
    start: '/NIABancsPortal/QuoteNonCustomer.html',
    vehicle: { ...CAR, make: 'BROKEN' },
    outcome: 'failed',
    step: 'Make',
    message: 'presently our services are not available',
  },
  {
    name: 'a two-wheeler with the Private Car form open (no dashboard) is refused, nothing filled',
    start: '/NIABancsPortal/QuoteNonCustomer.html',
    vehicle: BIKE,
    outcome: 'refused',
    message: 'go to its dashboard',
    expect: { year: null, calculated: false },
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  const today = new Date(2026, 10, 2);
  let failures = 0;
  for (const c of CASES) {
    const ses = session.fromPartition(`nia-motor-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    await win.loadURL(origin + c.start);
    const result = await runNiaMotorQuote({ windows: () => [win], vehicle: c.vehicle, today });
    const state = await win.webContents
      .executeJavaScript(READ)
      .catch((e) => ({ error: e.message }));
    win.destroy();
    const problems = [];
    if (result.outcome !== c.outcome)
      problems.push(`outcome ${result.outcome} at ${result.step}: ${result.message}`);
    if (c.step && result.step !== c.step) problems.push(`step ${result.step} (expected ${c.step})`);
    if (c.message && !result.message.includes(c.message))
      problems.push(`message "${result.message}" lacks "${c.message}"`);
    for (const [k, v] of Object.entries(c.expect ?? {}))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  New India motor: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} New India motor checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
