// Runs the United India Overseas Travel e-proposal automation (bundled real code) for travel
// clients against the local copy of the form, and checks what was filled, the premium read, what is left to the advisor,
// that the client's own answers were not touched, and that nothing was saved. Exits 0 only if
// every check passes. Started by run-motor.mjs travel.
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./uiic-travel-proposal.cjs');

const { installNavigationPolicy, createLogger, runUiicTravelProposal, setSessionPolicy } = require(
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
  res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html ?? 'not found');
});

// A travel client (the proposer and insured), as saved.
const FULL = {
  customer: { name: 'Synthetic Traveller', phone: '9876543210', email: 'traveller@example.test' },
  pincode: '560001',
  dateOfBirth: '1986-04-12',
  gender: 'female',
  maritalStatus: 'married',
  occupation: 'Salaried',
  passport: {
    issuingAuthority: 'Passport Office, Bengaluru',
    issueDate: '2020-01-15',
    expiryDate: '2030-01-14',
  },
  proposal: {
    pan: 'ABCDE1234F',
    address: '12 Synthetic Street',
    state: 'Karnataka',
    city: 'Bengaluru',
    village: 'Koramangala',
    highRiskCustomer: false,
    landlineStdCode: '080',
    landlineNumber: '22223333',
    ckycNumber: '12345678901234',
    eInsuranceAccountNumber: 'EIA1234567',
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'spouse',
    intermediaryPlace: 'Bengaluru',
  },
};
const TRIP = {
  destination: 'worldwide',
  sumInsured: '100000',
  startDate: '2026-11-20',
  days: 10,
};
const SIGNATURE = 'United India says: * Please Upload Signature of Proposer.';

const CASES = [
  {
    name: 'full client and trip: every field filled, premium read, answers untouched; not saved',
    traveller: FULL,
    passportNumber: 'Z1234567',
    trip: TRIP,
    aadhaar: '999941057058',
    expect: {
      filledBy: 'agent',
      choose: 'new',
      purpose: 'BH',
      destination: 'Worldwide Including USA Or CANADA',
      plan: 'PLAN B2',
      start: '20/11/2026',
      days: '10',
      risk: 'No',
      title: 'Mrs',
      gender: 'Female',
      name: 'Synthetic Traveller',
      pin: '560001',
      state: '29',
      district: '1',
      village: 'v1',
      address: '12 Synthetic Street',
      std: '080',
      landline: '22223333',
      mobile: '9876543210',
      email: 'traveller@example.test',
      eia: 'EIA1234567',
      aadhaar: '999941057058',
      pan: 'ABCDE1234F',
      ckyc: '12345678901234',
      relation: 'Self',
      insuredTitle: 'Mrs',
      insuredName: 'Synthetic Traveller',
      occupation: 'Salaried',
      dob: '12/04/1986',
      marital: 'Married',
      passport: 'Z1234567',
      issuingAuthority: 'Passport Office, Bengaluru',
      issued: '15/01/2020',
      expires: '14/01/2030',
      nomineeName: 'Synthetic Nominee',
      nomineeRelation: 'Spouse',
      place: 'Bengaluru',
      customerPlace: '',
      preExisting: null,
      payMode: null,
      errorsShown: false,
      saved: false,
    },
    premium: String(85 * 10 + Math.round(85 * 10 * 0.18)),
    // The advisor's own part, and United India's message about the signature upload.
    exactToDo: [
      'IV. Medical History: the insured’s answers',
      'V. Declaration: the client’s consent boxes',
      'signature of the proposer and documents (uploads)',
      'payment mode (VIII. Premium Details)',
      SIGNATURE,
    ],
  },
  {
    name: 'excluding USA and Canada, no passport: plan A3, no premium, United India’s reason listed',
    traveller: FULL,
    trip: { ...TRIP, destination: 'worldwide-excluding-usa-canada', sumInsured: '250000' },
    expect: {
      destination: 'Worldwide Excluding USA Or CANADA',
      plan: 'PLAN A3',
      passport: '',
      totalPremium: '',
      errorsShown: false,
      saved: false,
    },
    premium: null,
    toDo: ['passport number', 'United India says: * Please Enter Passport Number.', SIGNATURE],
  },
  {
    name: 'sparse client: what the record lacks is left to the advisor, the rest filled',
    traveller: {
      customer: { name: 'Synthetic Sparse' },
      pincode: '110001',
      dateOfBirth: '1956-01-31',
      gender: 'male',
    },
    passportNumber: 'Z7654321',
    trip: TRIP,
    expect: {
      title: 'Mr',
      name: 'Synthetic Sparse',
      dob: '31/01/1956',
      marital: '',
      occupation: '',
      place: '',
      errorsShown: false,
      saved: false,
    },
    premium: String(85 * 10 + Math.round(85 * 10 * 0.18)),
    toDo: [
      'state, district, village (after the PIN code lookup)',
      'address',
      'mobile number',
      "insured's occupation",
      'marital status',
      "nominee's name",
      "intermediary's place of signing",
      'United India says: * Please Enter Address of the Proposer.',
    ],
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  let failures = 0;

  for (const c of CASES) {
    const ses = session.fromPartition(`uiic-travel-${Math.random()}`);
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
    const result = await runUiicTravelProposal({
      windows,
      traveller: c.traveller,
      trip: c.trip,
      aadhaar: c.aadhaar ?? null,
      passportNumber: c.passportNumber ?? null,
      today: new Date(2026, 10, 3),
    });
    const form = windows().find((w) => w.webContents.getURL().includes('ProposalOTIhome.html'));
    const state = form
      ? await form.webContents
          .executeJavaScript(
            `(() => {
        const v = (s) => document.querySelector('#proposal ' + s)?.value;
        const r = (n) => document.querySelector('input[name="' + n + '"]:checked')?.value ?? null;
        return {
          filledBy: r('proposalfilledBy'), choose: r('chooseProposal'),
          purpose: v('#travelPurpose'), destination: v('#travelDestination'), plan: v('#planType'),
          start: v('#travelStartDate'), days: v('#travelNoOfDays'),
          risk: v('select[ng-model="OTIProposalFormData.ynHighRisk"]'), title: v('#proposerTitle'),
          gender: v('#proposerGender'), name: v('#proposerName'), pin: v('#proposerPINCode'),
          state: v('#STATE_CODE1'), district: v('#STATE_CODE2'), village: v('#Village_Code'),
          address: v('#proposerAddress'), std: v('#proposerSTDCode'), landline: v('#proposerResidenceTelNo'),
          mobile: v('#proposerMobileNo'), email: v('#proposerEmail'), eia: v('#eInsuranceAccNo'),
          aadhaar: v('#aadharNo'), pan: v('#panNo'), ckyc: v('#CKYCNo'),
          relation: v('#insuredRelation'), insuredTitle: v('#Select2'), insuredName: v('#insuredName'),
          occupation: v('#insuredOccupation'), dob: v('#insuredDOB'), marital: v('#insuredMaritalStatus'),
          passport: v('#insuredPassportNo'), issuingAuthority: v('#insuredPassportIssuingAuth'),
          issued: v('#insuredPassportIssueDate'), expires: v('#insuredPassportExpDate'),
          nomineeName: v('#insuredNomineeName'),
          nomineeRelation: v('#insuredNomineeRelation'), place: v('#intmSignPlace'),
          customerPlace: document.querySelector('#customerPart #intmSignPlace').value,
          preExisting: r('hasPreExistingDis'), payMode: r('premiumpaymodes'), totalPremium: v('#totalPremium'),
          errorsShown: !document.getElementById('errors').classList.contains('hidden'), saved: window.__saved,
        };
      })()`,
          )
          .catch((e) => ({ readError: e.message }))
      : null;
    for (const w of windows()) w.destroy();

    const problems = [];
    if (result.outcome !== 'ready')
      problems.push(
        `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.problems)}`,
      );
    for (const [k, v] of Object.entries(c.expect))
      if (!state || !same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state?.[k])} (expected ${JSON.stringify(v)})`);
    if (!same(result.premium?.amount ?? null, c.premium))
      problems.push(`premium ${JSON.stringify(result.premium)} (expected ${c.premium})`);
    if (c.exactToDo && !same(result.toDo, c.exactToDo))
      problems.push(
        `to do ${JSON.stringify(result.toDo)} (expected ${JSON.stringify(c.exactToDo)})`,
      );
    for (const item of c.toDo ?? [])
      if (!(result.toDo ?? []).some((t) => t.startsWith(item)))
        problems.push(`to do lacks "${item}": ${JSON.stringify(result.toDo)}`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  United India Overseas Travel: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }

  console.log(`\n${CASES.length - failures} of ${CASES.length} travel proposal checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
