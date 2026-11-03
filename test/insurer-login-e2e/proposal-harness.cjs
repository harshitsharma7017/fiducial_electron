// Runs the United India health e-proposal automation (bundled real code) against local copies of
// the Family Medicare, Individual Health, Arogya Sanjeevani and Super Top-up forms, and checks what was filled, what is left to the
// advisor, and that nothing was saved. Exits 0 only if every check passes. Started by
// run-motor.mjs proposals.
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./uiic-health-proposal.cjs');

const { installNavigationPolicy, createLogger, runUiicHealthProposal, setSessionPolicy } = require(
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

const FULL = {
  customer: { name: 'Synthetic Proposer', phone: '9876543210', email: 'proposer@example.test' },
  pincode: '560001',
  proposerMaritalStatus: 'married',
  members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-04-12', gender: 'female' }],
  proposal: {
    pan: 'ABCDE1234F',
    address: '12 Synthetic Street',
    state: 'Karnataka',
    city: 'Bengaluru',
    village: 'Koramangala',
    occupation: 'Software Professional',
    highRiskCustomer: false,
    landlineStdCode: '080',
    landlineNumber: '22223333',
    ckycNumber: '12345678901234',
    eInsuranceAccountNumber: 'EIA1234567',
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'spouse',
    nomineeAddress: '12 Synthetic Street',
    nomineeContact: '9876500000',
    intermediaryPlace: 'Bengaluru',
  },
};

const CASES = [
  {
    name: 'full client with Aadhaar: every field filled, only United India’s own later-section message left; not saved',
    client: FULL,
    // UIDAI's published test number (sandbox), passed in as the vault would.
    aadhaar: '999941057058',
    expect: {
      risk: 'No',
      customerPartShown: false,
      name: 'Synthetic Proposer',
      filledBy: 'agent',
      choose: 'new',
      dob: '12/04/1986',
      gender: 'Female',
      marital: 'Married',
      occupation: '30',
      pan: 'ABCDE1234F',
      aadhaar: '999941057058',
      pin: '560001',
      state: '29',
      city: '1',
      address: '12 Synthetic Street',
      mobile: '9876543210',
      email: 'proposer@example.test',
      nominee: 'Spouse',
      village: 'v1',
      std: '080',
      landline: '22223333',
      ckyc: '12345678901234',
      eia: 'EIA1234567',
      nomineeName: 'Synthetic Nominee',
      nomineeAddress: '12 Synthetic Street',
      nomineeContact: '9876500000',
      place: 'Bengaluru',
      errorsShown: false,
      saved: false,
    },
    // Nothing left from sections I, II and XI: only what United India says about section III.
    exactToDo: ['United India says: * Please Select Policy Type.'],
    toDo: [],
  },
  {
    name: 'sparse client: what the record lacks is left to the advisor, the rest filled',
    client: {
      customer: { name: 'Synthetic Sparse' },
      pincode: '110001',
      proposerMaritalStatus: 'widowed',
      members: [{ relationship: 'self', age: 70, dateOfBirth: '1956-01-31', gender: 'male' }],
    },
    expect: {
      name: 'Synthetic Sparse',
      dob: '31/01/1956',
      gender: 'Male',
      marital: null,
      pan: '',
      nominee: '',
      errorsShown: false,
      saved: false,
    },
    toDo: [
      'Aadhaar number (none saved for this client)',
      'state, city, village (after the PIN code lookup)',
      'PAN',
      'mobile number',
      'marital status',
      "nominee's name",
      'nominee relationship',
      "intermediary's place of signing",
      'United India says: * Please Provide PAN Number of Proposer.',
    ],
  },
];

CASES.push(
  {
    name: 'high-risk client with its type: Yes, then the type; ERRORS pop-up fades and the run goes on',
    client: {
      ...FULL,
      proposal: { ...FULL.proposal, highRiskCustomer: true, highRiskType: 'pep' },
    },
    expect: {
      risk: 'Yes',
      riskType: '2',
      nominee: 'Spouse',
      place: 'Bengaluru',
      errorsShown: false,
      saved: false,
    },
    toDo: ['Aadhaar number (none saved'],
  },
  {
    name: 'a village the PIN lookup does not list: the rest filled, the advisor told which',
    client: { ...FULL, proposal: { ...FULL.proposal, village: 'Nowhere Nagar' } },
    aadhaar: '999941057058',
    expect: { village: '', state: '29', nominee: 'Spouse', place: 'Bengaluru', saved: false },
    toDo: ['Village "Nowhere Nagar" is not in United India\'s list for this PIN code'],
  },
  {
    name: 'high-risk client without a type: Yes, the type left to the advisor with United India’s message',
    client: { ...FULL, proposal: { ...FULL.proposal, highRiskCustomer: true } },
    expect: { risk: 'Yes', riskType: '', nominee: 'Spouse', errorsShown: false, saved: false },
    toDo: [
      'customer high risk type',
      'United India says: * Please Provide Aadhaar No. of Proposer. * Please select High risk type',
    ],
  },
);

// Individual Health: the same sections I and II on its own page, with other radio ids and its
// intermediary's section numbered X (recording of 3 November 2026).
const FORMS = [
  { form: 'family-medicare', name: 'Family Medicare', page: 'ProposalFMhome.html', cases: CASES },
  {
    form: 'individual-health',
    name: 'Individual Health',
    page: 'ProposalIHPhome.html',
    cases: [CASES[0], CASES[1], CASES[2]],
  },
  // Not recorded (said to be the same as Individual Health): found by any proposal page, the
  // intermediary's section by name.
  {
    form: 'arogya-sanjeevani',
    name: 'Arogya Sanjeevani',
    page: 'ProposalASPhome.html',
    cases: [CASES[0], CASES[1]],
  },
  {
    form: 'super-top-up',
    name: 'Super Top-up',
    page: 'ProposalSTUhome.html',
    cases: [CASES[0], CASES[1]],
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  let failures = 0;

  let total = 0;
  for (const { form: formId, name, page, cases } of FORMS)
    for (const c of cases) {
      total += 1;
      const ses = session.fromPartition(`uiic-fm-${Math.random()}`);
      setSessionPolicy(ses, {
        navigate: (url) => url.startsWith(origin + '/'),
        popup: (url) =>
          url.startsWith(origin + '/')
            ? {
                show: true,
                webPreferences: { session: ses, sandbox: true, contextIsolation: true },
              }
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
      const result = await runUiicHealthProposal({
        windows,
        form: formId,
        client: c.client,
        aadhaar: c.aadhaar ?? null,
      });
      const form = windows().find((w) => w.webContents.getURL().includes(page));
      const state = form
        ? await form.webContents
            .executeJavaScript(
              `(() => {
        const v = (s) => document.querySelector(s)?.value;
        const r = (n) => document.querySelector('input[name="' + n + '"]:checked')?.value ?? null;
        return {
          risk: v('#sec1 select[ng-model="formData.ynHighRisk"]'), customerPartShown: !document.getElementById('customerPart').classList.contains('hidden'), name: v('#proposerName'), filledBy: r('proposalfilledBy'),
          choose: r('chooseProposal'), dob: v('#proposerDOB'), gender: r('gender'), marital: r('maritalStatus'),
          occupation: v('#OCCUPATION_CODE'), pan: v('#proposerPANCardNo'), aadhaar: v('#proposerAadhaarCard_PassportNo'),
          pin: v('#proposerPINCode'), address: v('#proposerAddress'), mobile: v('#proposerTelNoMobile'),
          email: v('#proposerEmail'), nominee: v('#nomineeRelationship'), riskType: v('#mainHighRiskType'), village: v('#Village_Code'), state: v('#STATE_CODE1'), city: v('#STATE_CODE2'),
          std: v('#proposerTelNoSTDCode'), landline: v('#proposerTelNoHome'), ckyc: v('#proposerCKYCNo'),
          eia: v('#proposerEInsuranceAccountNo'), nomineeName: v('#nomineeName'), nomineeAddress: v('#nomineeAddress'),
          nomineeContact: v('#nomineeContactNo'), place: v('#IntermediaryDeclarationPlace'),
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
      if (c.exactToDo && !same(result.toDo, c.exactToDo))
        problems.push(
          `to do ${JSON.stringify(result.toDo)} (expected ${JSON.stringify(c.exactToDo)})`,
        );
      for (const item of c.toDo)
        if (!(result.toDo ?? []).some((t) => t.startsWith(item)))
          problems.push(`to do lacks "${item}": ${JSON.stringify(result.toDo)}`);
      console.log(
        `${problems.length ? 'FAIL' : 'pass'}  United India ${name}: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
      );
      failures += problems.length ? 1 : 0;
    }

  console.log(`\n${total - failures} of ${total} proposal checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
