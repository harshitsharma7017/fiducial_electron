// Runs the United India Overseas Mediclaim e-proposal automation (bundled real code) against the
// local copies of the B&H, SCHENGEN and Studies forms, and checks what was filled, the plan chosen,
// the premium read, what is left to the advisor, that the client's own answers were not touched,
// and that nothing was saved. Exits 0 only if every check passes. Started by run-motor.mjs omp.
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./uiic-omp-proposal.cjs');

const { installNavigationPolicy, createLogger, runUiicOmpProposal, setSessionPolicy } = require(
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
  const html = FIXTURES[new URL(req.url, 'http://x').pathname];
  res.writeHead(typeof html === 'string' ? 200 : 404, {
    'content-type': 'text/html; charset=utf-8',
  });
  res.end(typeof html === 'string' ? html : 'not found');
});

const FULL = {
  customer: { name: 'Synthetic Traveller', phone: '9876543210', email: 'traveller@example.test' },
  pincode: '560001',
  dateOfBirth: '1986-04-12',
  gender: 'male',
  maritalStatus: 'unmarried',
  occupation: 'Professional',
  passport: { issuingAuthority: 'Passport Office, Bengaluru', expiryDate: '2031-06-30' },
  proposal: {
    pan: 'ABCDE1234F',
    address: '12 Synthetic Street',
    state: 'Karnataka',
    city: 'Bengaluru',
    village: 'Koramangala',
    highRiskCustomer: false,
    ckycNumber: '12345678901234',
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'mother',
  },
};
const TRIP = {
  form: 'business-holiday',
  destination: 'worldwide-excluding-usa-canada',
  startDate: '2026-11-20',
  days: 10,
  plan: 2,
};
const SIGNATURE = 'United India says: * Please Upload Signature of Proposer.';
// The fixture's prices: (30 + 10 × place + 15 if including USA) × days + age; GST 18% on top.
const price = (place, days, age, usa = false) => {
  const net = (30 + 10 * (place - 1) + (usa ? 15 : 0)) * days + age;
  return { net: String(net), total: String(net + Math.round(net * 0.18)) };
};

const FILLED = {
  filledBy: 'agent',
  destination: 'World_Wide_Restricted',
  days: '10',
  start: '20/11/2026',
  dob: '12/04/1986',
  plan: 'A-2',
  title: 'Mr',
  gender: 'Male',
  name: 'Synthetic Traveller',
  state: '29',
  district: '1',
  village: 'v1',
  address: '12 Synthetic Street',
  mobile: '9876543210',
  email: 'traveller@example.test',
  aadhaar: '999941057058',
  pan: 'ABCDE1234F',
  ckyc: '12345678901234',
  relation: 'Self',
  insuredTitle: 'Mr',
  insuredName: 'Synthetic Traveller',
  occupation: 'Professional',
  marital: 'Single',
  nationality: 'Indian',
  passport: 'Z1234567',
  issuingAuthority: 'Passport Office, Bengaluru',
  expires: '30/06/2031',
  nomineeName: 'Synthetic Nominee',
  nomineeRelation: 'Mother',
  preExisting: null,
  payMode: null,
  errorsShown: false,
  saved: false,
};
const ALWAYS = [
  'IV. Medical History: the insured’s answers',
  'V. Assignment: the client’s declaration',
  'VIII. Medical Examination report, signatures and documents (uploads)',
  'payment mode (X. Premium Details)',
];

const CASES = [
  {
    name: 'B&H, full client: every field filled, 2nd plan (A-2) chosen, total premium read; not saved',
    trip: TRIP,
    aadhaar: '999941057058',
    expect: FILLED,
    premium: price(2, 10, 40).total,
    plan: 'A-2',
    exactToDo: [...ALWAYS, SIGNATURE],
  },
  {
    name: 'SCHENGEN (another model prefix and page): the same, found by the ends of the models',
    trip: { ...TRIP, form: 'schengen' },
    aadhaar: '999941057058',
    expect: FILLED,
    premium: price(2, 10, 40).total,
    plan: 'A-2',
    exactToDo: [...ALWAYS, SIGNATURE],
  },
  {
    name: 'Studies, worldwide including USA, 4th plan (B-4)',
    trip: { ...TRIP, form: 'studies', destination: 'worldwide', plan: 4 },
    aadhaar: '999941057058',
    expect: { destination: 'World_Wide', plan: 'B-4', saved: false, errorsShown: false },
    premium: price(4, 10, 40, true).total,
    plan: 'B-4',
    exactToDo: [...ALWAYS, SIGNATURE],
  },
  {
    name: 'B&H, sparse client and trip: what is lacking is left to the advisor, the rest filled',
    traveller: {
      customer: { name: 'Synthetic Sparse' },
      pincode: '110001',
      dateOfBirth: '1956-01-31',
      gender: 'female',
      maritalStatus: 'widowed',
    },
    passportNumber: null,
    trip: { ...TRIP, plan: 1 },
    expect: {
      plan: 'A-1',
      dob: '31/01/1956',
      title: '',
      name: 'Synthetic Sparse',
      passport: '',
      occupation: '',
      saved: false,
    },
    premium: price(1, 10, 70).total,
    plan: 'A-1',
    toDo: [
      'title (Mr., Mrs., Miss…)',
      'address',
      'mobile number',
      "insured's occupation",
      'marital status',
      'passport number',
      "nominee's name",
      'United India says: * Please Enter Address of the Proposer.',
    ],
  },
  {
    name: 'a plan place United India does not offer (5th of 3): stops at the plan, nothing saved',
    trip: { ...TRIP, plan: 5 },
    outcome: 'failed',
    step: 'Plan',
    message: 'United India offers 3 choices here for this trip',
    expect: { plan: '', saved: false },
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  let failures = 0;

  for (const c of CASES) {
    const ses = session.fromPartition(`uiic-omp-${Math.random()}`);
    setSessionPolicy(ses, {
      navigate: (url) => url.startsWith(origin + '/'),
      popup: (url) =>
        url.startsWith(origin + '/')
          ? { show: true, webPreferences: { session: ses, sandbox: true, contextIsolation: true } }
          : null,
    });
    const home = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    await home.loadURL(origin + '/GCWebPortal/login/HomeAction.do');
    const windows = () => [
      home,
      ...BrowserWindow.getAllWindows().filter(
        (w) => w !== home && !w.isDestroyed() && w.webContents.session === ses,
      ),
    ];
    const result = await runUiicOmpProposal({
      windows,
      traveller: c.traveller ?? FULL,
      passportNumber: c.passportNumber === undefined ? 'Z1234567' : c.passportNumber,
      trip: c.trip,
      aadhaar: c.aadhaar ?? null,
      today: new Date(2026, 10, 3),
    });
    const page = FIXTURES.PAGES[c.trip.form];
    const form = windows().find((w) => w.webContents.getURL().includes(page));
    const state = form
      ? await form.webContents
          .executeJavaScript(
            `(() => {
        const v = (s) => document.querySelector('#proposal ' + s)?.value;
        const r = (n) => document.querySelector('input[name="' + n + '"]:checked')?.value ?? null;
        return {
          filledBy: r('proposalfilledBy'), destination: v('select[ng-model$=".trvDestGrp"]'),
          days: v('#travelNoOfDays'), start: v('#travelStartDate'), dob: v('#sec1 #insuredDOB'),
          plan: r('plan') ?? '', title: v('#proposerTitle'), gender: v('#proposerGender'),
          name: v('#proposerName'), state: v('#STATE_CODE1'), district: v('#STATE_CODE2'),
          village: v('#villageCode'), address: v('#proposerAddress'), mobile: v('#proposerMobileNo'),
          email: v('#proposerEmail'), aadhaar: v('#aadharNo'), pan: v('#panNo'), ckyc: v('#CKYCNo'),
          relation: v('#insuredRelation'), insuredTitle: v('#Select2'), insuredName: v('#insuredName'),
          occupation: v('#insuredOccupation'), marital: v('#insuredMaritalStatus'),
          nationality: v('#insuredNationality'), passport: v('#insuredPassportNo'),
          issuingAuthority: v('#insuredPassportIssuingAuth'), expires: v('#insuredPassportExpDate'),
          nomineeName: v('#insuredNomineeName'), nomineeRelation: v('#insuredNomineeRelation'),
          preExisting: r('hasPreExistingDis'), payMode: r('premiumpaymodes'),
          errorsShown: !document.getElementById('errors').classList.contains('hidden'), saved: window.__saved,
        };
      })()`,
          )
          .catch((e) => ({ readError: e.message }))
      : null;
    for (const w of windows()) w.destroy();

    const problems = [];
    const outcome = c.outcome ?? 'ready';
    if (result.outcome !== outcome || (c.step && result.step !== c.step))
      problems.push(
        `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.problems)}`,
      );
    for (const [k, v] of Object.entries(c.expect))
      if (!state || !same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state?.[k])} (expected ${JSON.stringify(v)})`);
    if (c.message && !result.message.startsWith(c.message))
      problems.push(`message: ${result.message} (expected ${c.message}…)`);
    if (outcome === 'ready') {
      if (!same(result.premium?.amount ?? null, c.premium))
        problems.push(`premium ${JSON.stringify(result.premium)} (expected ${c.premium})`);
      if (!result.message.includes(`plan ${c.plan}`))
        problems.push(`message lacks the plan ${c.plan}: ${result.message}`);
    }
    if (c.exactToDo && !same(result.toDo, c.exactToDo))
      problems.push(
        `to do ${JSON.stringify(result.toDo)} (expected ${JSON.stringify(c.exactToDo)})`,
      );
    for (const item of c.toDo ?? [])
      if (!(result.toDo ?? []).some((t) => t.startsWith(item)))
        problems.push(`to do lacks "${item}": ${JSON.stringify(result.toDo)}`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  United India Overseas Mediclaim: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }

  console.log(`\n${CASES.length - failures} of ${CASES.length} Overseas Mediclaim checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
