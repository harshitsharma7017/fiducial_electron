// Runs the New India Personal Accident automation (bundled real code) against the local copy of
// its dashboard and three forms, and checks what was filled, what is left to the advisor, New
// India's PAN question, and that nothing was saved. Contacts no insurer: the pages are served from
// 127.0.0.1. Exits 0 only if every check passes. Started by run.mjs pa (npm run test:nia -- pa).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./pa-form.cjs');
const { installNavigationPolicy, createLogger, runNiaPaQuote, setSessionPolicy } = require(
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

const CLIENT = {
  customer: { name: 'Synthetic Insured', phone: '9876543210' },
  pincode: '560001',
  members: [{ relationship: 'self', age: 45, dateOfBirth: '1981-02-20', gender: 'male' }],
  proposerMaritalStatus: 'married',
  proposal: {
    address: '7 Synthetic Lane',
    occupation: 'Service',
    nomineeName: 'Synthetic Spouse',
    nomineeRelationship: 'spouse',
    nomineeAddress: '7 Synthetic Lane',
  },
};
const DASHBOARD = '/NIABancsPortal/NonCustomerDashboard.html#/home';
const READ = `(() => {
  const v = (s) => document.querySelector(s)?.value ?? null;
  return {
    heading: document.querySelector('h3')?.textContent ?? null,
    first: v('#firstNameCreate'), last: v('#lastNameCreate'), title: v('#typeOfOrg'),
    claim: v('#vPreviousClaim'), term: v('#term'), name: v('#vNameInsured_1'), address: v('#vAddressInsured_2'),
    status: v('#vStatusInsured_1'), occupation: v('#vOccupationGramin_1'), dob: v('#vDateBirth_1'),
    gender: v('#vSexInsured_1'), disabilities: v('#vDetailsExistingPhysicalDisabilities_2'),
    nominee: v('#vNomineesName_1'), nomineeAddress: v('#vNomineesAddress_1'),
    relation: v('#vRelationshipNomineeInsured_2'), sum: v('#vSumInsuredRupees_1'), excess: v('#vExcess_2'),
    policyType: v('#PolicyType'), insuredName: v('#insuredName'), pensionDob: v('#dateOfBirth_Pol'),
    pension: v('#lossOfMonthlyPension'), death: v('#sumInsuredForAccidentalDeath'), defects: v('#physicalDefects'),
    organisation: v('#organisationBeforeRetirement'), previousClaim: v('#previousClaim'),
    nominee1: v('#nomineeName1'), relation1: v('#relationWithNominee1'),
    claimAlert: !document.querySelector('#claim')?.classList.contains('hidden'),
    saved: window.__saved,
  };
})()`;

const CASES = [
  {
    name: 'Personal Janta from the dashboard (PERSONAL ACCIDENT): the insured, nominee, sum and excess',
    start: DASHBOARD,
    run: { form: 'janta', sumInsured: '75000', status: 'earning', term: 2, excess: '5' },
    outcome: 'ready',
    expect: {
      heading: 'Personal Janta Insurance Insurance',
      first: 'Synthetic',
      last: 'Insured',
      title: 'string:Mr.',
      claim: 'string:No',
      term: 'string:2',
      name: null,
      status: 'string:Earning Member',
      occupation: 'string:Service',
      dob: '20/02/1981',
      gender: 'string:Male',
      disabilities: 'None',
      nominee: 'Synthetic Spouse',
      nomineeAddress: '7 Synthetic Lane',
      relation: 'string:Spouse',
      sum: 'string:75000',
      excess: 'string:5',
      claimAlert: false,
      saved: false,
    },
    toDo: ['details of relationship', 'Press Save & Calculate yourself'],
  },
  {
    name: "Janata PA Sukshma Bima open, after New India's PAN question is answered",
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=sk',
    run: { form: 'sukshma', sumInsured: '100000', status: 'non-earning', term: 1 },
    noDisabilities: false,
    // The question shows a moment after the form: it stops the first step.
    outcome: 'failed',
    message: 'asks whether the client has a PAN',
    expect: { claim: '' },
    then: {
      answer: `document.querySelector('#no').click()`,
      outcome: 'ready',
      expect: {
        name: 'Synthetic Insured',
        address: '7 Synthetic Lane',
        status: 'string:Non Earning Member',
        disabilities: '',
        sum: 'string:100000',
        saved: false,
      },
      toDo: [
        'type of group',
        'details of existing physical disabilities',
        'name and address of the owner',
      ],
    },
  },
  {
    name: 'Pension Protect: new policy, pension details and nominee',
    start: DASHBOARD,
    run: { form: 'pension', monthlyPensionRupees: 25000, organisation: 'Synthetic Works Ltd' },
    outcome: 'ready',
    expect: {
      heading: 'New India Pension Protect Personal Accident Policy Insurance',
      policyType: 'string:new policy',
      claim: 'string:No',
      insuredName: 'Synthetic Insured',
      pensionDob: '20/02/1981',
      pension: '25000',
      death: '2500000',
      defects: 'string:No',
      organisation: 'Synthetic Works Ltd',
      previousClaim: 'string:No',
      nominee1: 'Synthetic Spouse',
      relation1: 'string:Spouse',
      saved: false,
    },
    toDo: ["nominee's date of birth", 'Press Save & Calculate Premium yourself'],
  },
  {
    name: 'without the no-claims confirmation: refused before anything is touched',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=jt&pan=0',
    run: { form: 'janta', sumInsured: '25000', status: 'earning', term: 1, excess: '0' },
    noClaims: false,
    outcome: 'refused',
    expect: { claim: '', first: '', saved: false },
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

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  let failures = 0;
  for (const c of CASES) {
    const ses = session.fromPartition(`nia-pa-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    await win.loadURL(origin + c.start);
    const run = () =>
      runNiaPaQuote({
        windows: () => [win],
        client: CLIENT,
        run: c.run,
        noClaims: c.noClaims ?? true,
        noDisabilities: c.noDisabilities ?? true,
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
      `${problems.length ? 'FAIL' : 'pass'}  New India PA: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} New India PA checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
