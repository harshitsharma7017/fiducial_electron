// Runs the New India Marine Specific Voyage automation (bundled real code) against the local copy
// of its dashboard and form, and checks what was filled, what is left to the advisor, that open
// sections were not closed, and that nothing was saved. Contacts no insurer: the pages are served
// from 127.0.0.1. Exits 0 only if every check passes. Started by run.mjs marine
// (npm run test:nia -- marine).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./marine-form.cjs');
const { installNavigationPolicy, createLogger, runNiaMarineQuote, setSessionPolicy } = require(
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

const BUSINESS = {
  kind: 'organization',
  customer: { name: 'Synthetic Exports Pvt Ltd', phone: '9876543210', email: 'ops@example.test' },
  pincode: '400001',
  address: '5 Synthetic Dock Road',
  pan: 'ABCDE1234F',
  registrationNo: 'U12345MH2020PTC000001',
  registrationDate: '2020-05-01',
  msme: true,
  organisationType: 'Private Limited Company',
};
const PERSON = {
  kind: 'individual',
  customer: { name: 'Synthetic Trader', phone: '9876543211' },
  pincode: '560001',
  address: '9 Synthetic Market',
  dateOfBirth: '1980-07-07',
  gender: 'female',
  maritalStatus: 'unmarried',
};
const SHIPMENT = {
  voyageType: 'inland',
  startDate: '2026-11-10',
  transitType: 'road',
  mode: 'road',
  fromCountry: 'India',
  toCountry: 'India',
  portOfLoading: 'Mumbai',
  portOfDischarge: 'Pune',
  billType: 'lr',
  billNumber: 'LR-1001',
  billDate: '2026-11-09',
  markNo: 'SYN/01',
  showPremium: false,
  cargoType: 'steel',
  sumInsuredRupees: 2500000,
  ratePercent: '0.05',
  extraPercent: '10',
  invoiceNumber: 'INV-77',
  invoiceDate: '2026-11-08',
  excessOn: 'claim',
  excessPercent: '5',
  minimumExcessRupees: 10000,
  clause: 'B',
};
const DASHBOARD = '/NIABancsPortal/NonCustomerDashboard.html#/home';
const READ = `(() => {
  const v = (s) => document.querySelector(s)?.value ?? null;
  const c = (s) => document.querySelector(s)?.checked ?? null;
  const shown = (s) => Array.from(document.querySelectorAll(s)).find((e) => e.offsetParent)?.value ?? null;
  return {
    heading: document.querySelector('h3')?.textContent ?? null,
    org: c('#Organization'), business: v('#businessNameNewOrg'), reg: v('#registrationNo'),
    msme: v('#isMSME'), regDate: v('#regDate'), orgType: shown('#typeOfOrg'),
    busAddress: v('#businessAddress1'), busMobile: v('#mobileBus'), busEmail: v('#emailBus'),
    pan: shown('input[name="panNumber"]'),
    first: v('#firstNameCreate'), last: v('#lastNameCreate'), title: shown('#typeOfOrg'),
    dob: v('#dob'), female: c('#gender1'),
    sv: v('#typeOfSV'), start: v('#fromDate'), transit: v('#TransitType'), mode: v('#ModeOfTransport'),
    from: document.querySelector('#fromCountry').dataset.picked ?? null,
    to: document.querySelector('#ToCountry').dataset.picked ?? null,
    loading: v('#portOfLoading'), discharge: v('#portOfDischarge'), bill: v('#Billtype'),
    billNo: v('#BillNumber'), billDate: v('#BillDate'), mark: v('#Markno'), showPremium: v('#showPremiumAmount'),
    cargo: v('#CargoType'), sum: v('#CargoSumInsured'), rate: v('#CargoRatept'), extra: v('#ExtraPt'),
    invoice: v('#invoiceNumber'), invoiceDate: v('#Invoicedate'), excessOn: v('#ExcessApplicableOn'),
    excess: v('#Excess'), minimum: v('#minimumExcessAmount'),
    clauses: [c('#coverageDet0'), c('#coverageDet1'), c('#coverageDet2')],
    holderOpen: !document.querySelector('#holder').classList.contains('hidden'),
    toggles: window.__toggles, saved: window.__saved,
  };
})()`;

const CASES = [
  {
    name: 'a business from the dashboard (MARINE, Specific Voyage): organisation and the whole shipment',
    start: DASHBOARD,
    holder: BUSINESS,
    shipment: SHIPMENT,
    outcome: 'ready',
    expect: {
      heading: 'Specific Voyage Insurance',
      org: true,
      business: 'Synthetic Exports Pvt Ltd',
      reg: 'U12345MH2020PTC000001',
      msme: 'string:Yes',
      regDate: '01/05/2020',
      orgType: 'string:Private Limited Company',
      busAddress: '5 Synthetic Dock Road',
      busMobile: '9876543210',
      busEmail: 'ops@example.test',
      pan: 'ABCDE1234F',
      sv: 'string:Inland',
      start: '10/11/2026',
      transit: 'string:Road',
      mode: 'string:Road',
      from: 'India',
      to: 'India',
      loading: 'Mumbai',
      discharge: 'Pune',
      bill: 'string:Lorry Receipt(LR)',
      billNo: 'LR-1001',
      billDate: '09/11/2026',
      mark: 'SYN/01',
      showPremium: 'string:No',
      cargo: 'string:Steel - Sheets/Coils/Pipes/Wire Rods',
      sum: '2500000',
      rate: '0.05',
      extra: '10',
      invoice: 'INV-77',
      invoiceDate: '08/11/2026',
      excessOn: 'string:Claim amount',
      excess: '5',
      minimum: '10000',
      clauses: [false, true, false],
      // Policy Holder was open and stays open; Transit and Cargo opened once each.
      holderOpen: true,
      toggles: 2,
      saved: false,
    },
    toDo: [
      'state, city and PIN code',
      'GST registration type and GSTIN',
      'from city and to city',
      'packaging',
      'Press Save & Calculate Premium',
    ],
  },
  {
    name: 'a person, form already open: the individual policy holder; a country New India does not list is left',
    start: '/NIABancsPortal/QuoteNonCustomer.html',
    holder: PERSON,
    shipment: { ...SHIPMENT, toCountry: 'Atlantis', mode: 'vessel', clause: 'A' },
    outcome: 'ready',
    expect: {
      org: false,
      first: 'Synthetic',
      last: 'Trader',
      title: 'string:Ms.',
      dob: '07/07/1980',
      female: true,
      from: 'India',
      to: null,
      mode: 'string:Vessel',
      clauses: [true, false, false],
      saved: false,
    },
    toDo: ['to country (and its city)', 'Vessel Details', 'bank details'],
  },
  {
    name: 'a start date that has passed is refused before anything is touched',
    start: '/NIABancsPortal/QuoteNonCustomer.html',
    holder: BUSINESS,
    shipment: { ...SHIPMENT, startDate: '2026-11-01' },
    outcome: 'refused',
    expect: { sv: 'string:Export', saved: false },
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
    const ses = session.fromPartition(`nia-marine-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    await win.loadURL(origin + c.start);
    const result = await runNiaMarineQuote({
      windows: () => [win],
      holder: c.holder,
      shipment: c.shipment,
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
    for (const [k, v] of Object.entries(c.expect ?? {}))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    for (const item of c.toDo ?? [])
      if (!(result.toDo ?? []).some((t) => t.startsWith(item)))
        problems.push(`to do lacks "${item}": ${JSON.stringify(result.toDo)}`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  New India marine: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} New India marine checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
