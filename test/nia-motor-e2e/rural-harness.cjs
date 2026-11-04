// Runs the New India rural quote automation (bundled real code) against the local copy of its
// dashboard and four rural forms, and checks what was filled, what is left to the advisor, New
// India's PAN question, the two forms without a recorded tile, and that nothing was saved.
// Contacts no insurer: the pages are served from 127.0.0.1. Exits 0 only if every check passes.
// Started by run.mjs rural (npm run test:nia -- rural).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./rural-form.cjs');
const { installNavigationPolicy, createLogger, runNiaRuralQuote, setSessionPolicy } = require(
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

const COW = {
  kind: 'cattle',
  cattleType: 'milch-cow',
  origin: 'cross-breed',
  gender: 'female',
  breed: 'HF, black and white',
  ageYears: 4,
  ageMonths: 2,
  tagNumber: 'TAG-0001',
  purpose: 'Milk',
  marketValueRupees: 60000,
  sumInsuredRupees: 60000,
  fitnessCertificateDate: '2026-10-30',
};
const BUFFALO = {
  ...COW,
  cattleType: 'milch-buffalo',
  origin: 'indigenous',
  breed: 'Murrah',
  tagNumber: 'TAG-0002',
  marketValueRupees: 80000,
};
const GOAT = {
  kind: 'goat',
  origin: 'indigenous',
  gender: 'female',
  breed: 'Osmanabadi',
  ageYears: 2,
  ageMonths: 0,
  purpose: 'Milk',
  marketValueRupees: 9000,
  sumInsuredRupees: 9000,
};
const HORSE = {
  kind: 'horse',
  origin: 'exotic',
  gender: 'male',
  breed: 'Marwari, brown',
  ageYears: 6,
  ageMonths: 5,
  purpose: 'Riding',
  marketValueRupees: 150000,
  sumInsuredRupees: 150000,
};
const FARMER = {
  customer: { name: 'Synthetic Farmer Kumar', phone: '9876543210', email: 'farmer@example.test' },
  pincode: '411001',
  dateOfBirth: '1975-03-15',
  gender: 'male',
  address: 'Survey 12, Synthetic Village',
  nomineeName: 'Synthetic Nominee',
  nomineeRelationship: 'spouse',
  nomineeAddress: 'Survey 12, Synthetic Village',
  animals: [COW, { ...COW, cattleType: 'calf-heifer', tagNumber: 'TAG-0003' }],
  farm: {
    dwellingSumInsuredRupees: 300000,
    contentsSumInsuredRupees: 50000,
    dwellingId: 'H-17',
    dwellingLocation: 'Synthetic Village, Pune',
    dwellingDescription: 'Brick house, tin roof',
    contentsDescription: 'Furniture and utensils',
    katcha: false,
    disabilities: 'None',
  },
};
const DASHBOARD = '/NIABancsPortal/NonCustomerDashboard.html#/home';
const READ = `(() => {
  const v = (s) => document.querySelector(s)?.value ?? null;
  const c = (s) => document.querySelector(s)?.checked ?? null;
  const n = (s) => document.querySelector('[name="' + s + '"]')?.value ?? null;
  return {
    heading: document.querySelector('h3')?.textContent ?? null,
    newQuote: c('#checkPolicy1'), scheme: v('#Scheme'), claimRatio: n('Claim Ratio') ?? n('claimRatio'),
    beneficiary: v('#Beneficiary'), cattle: c('#cattleCheck'), calf: c('#calfCheck'),
    first: v('#firstNameCreate'), middle: v('#middleNameCreate'), last: v('#lastNameCreate'),
    title: v('#typeOfOrg'), dob: v('#dob'), address: v('#buildingNo'), mobile: v('#mobileInd'),
    start: v('#policyStartDate'), disabilities: v('#preExistingIllness'), nominee: v('#nomineeName'),
    nomineeRelation: v('#nomineeRelationship'), nomineeAddress: v('#addressOfNominee'),
    dwelling: v('#sumInsuredDwelling'), contents: v('#sumInsuredContents'), excess: v('#excess'),
    houseId: v('#identificationNo'), katchaNo: c('#katchaConst1'), contentsText: v('#descriptionContents'),
    animals: [0, 1, 2].map((i) => ({
      kind: n('typeOfAnimal' + i), origin: n('originType' + i), female: c('#cgender1' + i),
      breed: n('breed' + i), years: n('AgeinYrs' + i), months: n('AgeinMths' + i),
      cattle: n('typeOfCattle' + i), tag: n('TagNumber' + i), sg: n('typeOfRiskSheepAndGoat' + i),
      hd: n('typeOfHDPMY' + i), value: n('MarkectValue' + i), sum: n('mpsumInsured' + i),
    })),
    herd: [0, 1].map((i) => ({
      type: v('#typeOfRiskForCattle' + i), female: c('#cgender1' + i), years: v('#AgeinYrs' + i),
      origin: v('#originType' + i), breed: v('#breed' + i), tag: v('#TagNumber' + i),
      fitness: v('#fitnessCertificateDate' + i), value: v('#ycMarkectValue' + i),
    })),
    panShown: !document.querySelector('#pan')?.classList.contains('hidden'),
    toggles: window.__toggles, saved: window.__saved,
  };
})()`;

const CASES = [
  {
    name: "Cattle Insurance from the dashboard: New Quote brings New India's PAN question, then the rest",
    start: DASHBOARD,
    rural: FARMER,
    run: { form: 'cattle', scheme: 'individual-owner', claimRatio: '65.5' },
    outcome: 'failed',
    step: 'New Quote/Policy issuance',
    message: 'asks whether the client has a PAN',
    expect: { heading: 'Cattle Insurance', newQuote: true, panShown: true, scheme: '' },
    then: {
      answer: `document.querySelector('#no').click()`,
      outcome: 'ready',
      expect: {
        newQuote: true,
        scheme: 'string:Individual Owner',
        claimRatio: '65.5',
        cattle: true,
        calf: true,
        first: 'Synthetic',
        middle: 'Farmer',
        last: 'Kumar',
        title: 'string:Mr.',
        dob: '15/03/1975',
        address: 'Survey 12, Synthetic Village',
        mobile: '9876543210',
        saved: false,
      },
      toDo: ["each animal's details under Cattle / Calf Heifer Insurance", 'bank details'],
    },
  },
  {
    name: 'Farmers Package from the dashboard: PAN question on load, then period, risk and dwelling',
    start: DASHBOARD,
    rural: FARMER,
    run: { form: 'farmers-package', startDate: '2026-11-10', excess: '5' },
    outcome: 'refused',
    message: 'asks whether the client has a PAN',
    expect: { heading: 'Farmers Package Insurance Insurance', start: '' },
    then: {
      answer: `document.querySelector('#no').click()`,
      outcome: 'ready',
      expect: {
        start: '10/11/2026',
        disabilities: 'None',
        nominee: 'Synthetic Nominee',
        nomineeRelation: 'string:Spouse',
        nomineeAddress: 'Survey 12, Synthetic Village',
        dwelling: '300000',
        contents: '50000',
        excess: 'string:5',
        houseId: 'H-17',
        katchaNo: true,
        contentsText: 'Furniture and utensils',
        first: 'Synthetic',
        // Policy Holder, Policy Period, Risk Details and Fire opened once each.
        toggles: 4,
        saved: false,
      },
      toDo: ['tractor risk, loading and the optional additional coverages'],
    },
  },
  {
    name: 'Livestock (BLDA) from the dashboard: its tile was not recorded, so the advisor opens it',
    start: DASHBOARD,
    rural: { ...FARMER, animals: [COW, GOAT, HORSE] },
    run: { form: 'livestock-blda', beneficiary: 'OBC' },
    outcome: 'refused',
    message: 'yourself (its tile was not recorded)',
    expect: { heading: 'Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .' },
  },
  {
    name: 'Livestock (BLDA) open: a cow, a goat and a horse, each with its own fields',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=bl&pan=0',
    rural: { ...FARMER, animals: [COW, GOAT, HORSE] },
    run: { form: 'livestock-blda', beneficiary: 'OBC', claimRatio: '40' },
    outcome: 'ready',
    expect: {
      scheme: 'string:BLDA Scheme',
      claimRatio: '40',
      beneficiary: 'string:OBC',
      animals: [
        {
          kind: 'string:Cattle',
          origin: 'string:Cross Breed',
          female: true,
          breed: 'HF, black and white',
          years: '4',
          months: '2',
          cattle: 'string:Mitch Cows',
          tag: 'TAG-0001',
          sg: null,
          hd: null,
          value: '60000',
          sum: '60000',
        },
        {
          kind: 'string:Sheep & Goat',
          origin: 'string:Indigeneous',
          female: true,
          breed: 'Osmanabadi',
          years: '2',
          months: '0',
          cattle: null,
          tag: null,
          sg: 'string:Goat',
          hd: null,
          value: '9000',
          sum: '9000',
        },
        {
          kind: 'string:Horse Donkey Pony Mule Yak',
          origin: 'string:Exotic',
          female: false,
          breed: 'Marwari, brown',
          years: '6',
          months: '5',
          cattle: null,
          tag: null,
          sg: null,
          hd: 'string:Horse',
          value: '150000',
          sum: '150000',
        },
      ],
      saved: false,
    },
    // The other version of Policy holder information: its fields are listed, not guessed.
    toDo: ['policy holder: first name', "each animal's proposer ID"],
  },
  {
    name: 'Cattle (Non-scheme) open: two head of cattle by Add Cattle',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=ns&pan=0',
    rural: { ...FARMER, animals: [COW, BUFFALO] },
    run: { form: 'cattle-non-scheme', scheme: 'cooperative-dairies' },
    outcome: 'ready',
    expect: {
      scheme: 'string:Cooperative Diaries',
      herd: [
        {
          type: 'string:Milch Cows',
          female: true,
          years: '4',
          origin: 'string:Cross Breed',
          breed: 'HF, black and white',
          tag: 'TAG-0001',
          fitness: '30/10/2026',
          value: '60000',
        },
        {
          type: 'string:Milch Buffaloes',
          female: true,
          years: '4',
          origin: 'string:Indigenous',
          breed: 'Murrah',
          tag: 'TAG-0002',
          fitness: '30/10/2026',
          value: '80000',
        },
      ],
      saved: false,
    },
    toDo: ['transit cover (No unless chosen) and the declaration'],
  },
  {
    name: 'Cattle (Non-scheme) with a goat or a calf is refused with the reason',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=ns&pan=0',
    rural: { ...FARMER, animals: [GOAT, { ...COW, cattleType: 'calf-heifer' }] },
    run: { form: 'cattle-non-scheme', scheme: 'others' },
    outcome: 'refused',
    problem: 'is for cattle only',
    expect: {
      herd: [
        {
          type: '',
          female: false,
          years: '',
          origin: '',
          breed: '',
          tag: '',
          fitness: '',
          value: '',
        },
        {
          type: null,
          female: null,
          years: null,
          origin: null,
          breed: null,
          tag: null,
          fitness: null,
          value: null,
        },
      ],
    },
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
  if (c.problem && !result.problems.some((p) => p.includes(c.problem)))
    problems.push(`problems ${JSON.stringify(result.problems)} lack "${c.problem}"`);
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
    const ses = session.fromPartition(`nia-rural-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    await win.loadURL(origin + c.start);
    const run = () => runNiaRuralQuote({ windows: () => [win], rural: c.rural, run: c.run, today });
    const read = () => win.webContents.executeJavaScript(READ).catch((e) => ({ error: e.message }));
    const problems = [];
    check(c, await run(), await read(), problems);
    if (c.then && problems.length === 0) {
      await win.webContents.executeJavaScript(c.then.answer);
      check(c.then, await run(), await read(), problems);
    }
    win.destroy();
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  New India rural: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} New India rural checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
