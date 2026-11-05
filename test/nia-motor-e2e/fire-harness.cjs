// Runs the New India fire automation (bundled real code) against the local copy of its dashboard
// and nine fire forms (drawn from the recording's fields), and checks what was filled, that the
// closed sections were opened once each, what is left to the advisor, and that nothing was saved.
// Contacts no insurer: the pages are served from 127.0.0.1. Exits 0 only if every check passes.
// Started by run.mjs fire (npm run test:nia -- fire).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./fire-form.cjs');
const { installNavigationPolicy, createLogger, runNiaFireQuote, setSessionPolicy } = require(
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

const RISKS = {
  lift: true,
  inBasement: false,
  fireProtection: true,
  electricalWellMaintained: true,
  stormWaterDrain: true,
  security24x7: false,
  basementUsedForOperations: false,
  nearWaterBody: false,
  noFireBrigadeAccess: false,
  centralAC: false,
  unoccupied30Days: false,
  mortgaged: true,
  pastFireLoss: false,
  insuredBefore: false,
};
const HOME = {
  holder: {
    kind: 'individual',
    customer: { name: 'Synthetic Owner', phone: '9876543210' },
    pincode: '411001',
    gender: 'female',
    maritalStatus: 'married',
    dateOfBirth: '1979-09-09',
    address: '3 Synthetic Lane',
  },
  property: {
    use: 'home',
    buildingName: 'Synthetic Heights',
    landmark: 'Near Synthetic Park',
    address: 'Flat 4, Synthetic Heights, Pune',
    pincode: '411001',
    walls: 'pucca',
    floor: 'pucca',
    roof: 'pucca',
    yearOfConstruction: 1990,
    floors: 7,
    occupancyFloor: 4,
    heightMeters: 21,
    carpetAreaSqm: 90,
    constructionRatePerSqm: 25000,
    furnitureSumInsured: 300000,
    electricalSumInsured: 200000,
    otherContentsSumInsured: 100000,
    claimRatio: '0-30',
    maxClaimRatioPercent: 0,
    fireProtectionDetails: 'Extinguishers on each floor',
    risks: RISKS,
  },
};
const SHOP = {
  holder: {
    kind: 'organization',
    customer: { name: 'Synthetic Traders LLP', phone: '9876543211' },
    pincode: '400001',
    address: '12 Synthetic Bazaar',
    msme: true,
    registrationDate: '2015-01-01',
  },
  property: {
    use: 'business',
    landmark: 'Opposite Synthetic Market',
    address: 'Shop 2, Synthetic Bazaar, Mumbai',
    pincode: '400001',
    walls: 'pucca',
    floor: 'pucca',
    roof: 'kutcha',
    yearOfConstruction: 2010,
    floors: 2,
    occupancyFloor: 0,
    heightMeters: 8,
    buildingSumInsured: 2500000,
    furnitureSumInsured: 400000,
    electricalSumInsured: 100000,
    otherContentsSumInsured: 50000,
    otherContentsDescription: 'Counters and racks',
    plantMachinerySumInsured: 0,
    stocksSumInsured: 1500000,
    stocksDescription: 'Textiles',
    industry: 'Shops',
    claimRatio: 'Above 200',
    maxClaimRatioPercent: 12,
    fireProtectionDetails: 'Two extinguishers',
    fireBrigadeDistanceKm: 3,
    fireBrigadeMinutes: 15,
    risks: RISKS,
  },
};
const DASHBOARD = '/NIABancsPortal/NonCustomerDashboard.html#/home';
const READ = `(() => {
  const v = (id) => document.getElementById(id)?.value ?? null;
  const c = (id) => document.getElementById(id)?.checked ?? null;
  const ids = ['typeOfPolicy','whatDoUWantToCover','doYouWantToOpt','vRiskOpted_3','pinCode','vPinCodeRisk','locationPin0','pinCode0',
    'riskLocationBuildingName','riskLocationNearbyLandmark','vRiskLocationC','locationAddress0','addressOfTheLocation0','vLocationAddress',
    'carpetArea0','rateOfCostOfCons0','furniFixFitSI0','eleclElectroSI0','otherGenContSI0','buildingIncludingAdditionalStructuresI0',
    'furnitureFixFittEquip0','plantMachinery0','otherContentsSI0','otherContentDetails0','vBuildingSuperStructure0',
    'vFurnitureFittingsFixturesOtherContents0','vStocksStocksProcess0','typeOfConsWalls0','typeOfConsRoof0','typeOfConstructionWalls0',
    'typeOfConstructionRoof0','typeOfIndustry','vTypeIndustryOccupation_3','yearOfCons','yearOfConstruction','vYearConstruction_2','ageOfBuilding',
    'ageOfBuilding30Yr','noOfFloorOccupancy','numberOfFloors','vNumberFloorsOccupancy','insuredOccu','onWhichFloor',
    'vInsuredOccupancySituatedWhichFloor','heightofBuild','buildingHeight','vHeightBuildingMeters_3','nameOfOwner','ownedBy','vOwned',
    'doesBuildingHaveElevator','hasLift','vDoesBuildingHasLiftElevator','operationalFireHydrant','operationalDetectors','past3YrClaimRatio',
    'past3YearsClaimRatio','fireProtectionDetail','fireProtectionDetails','fireFightingArrangementsBldg','fireFightingArrangementsForRisk',
    'distanceFromPublicFireBrigade','isPropertyMortgagedt','vPropertyMortgaged','maxICRinLast3Yr','vMaximumIcPolicy','vTypePolicyDw',
    'vSiBuildings','vSiStocks','vHasPropertyPerils'];
  const out = {};
  for (const id of ids) out[id] = v(id);
  out.mortgagedYes = c('propertyMortaged0');
  out.basementNo = c('istheRiskLocatedinBase1');
  out.pastPolicyNo = c('whetherPolicyInPast1');
  out.first = v('firstNameCreate'); out.business = v('businessNameNewOrg'); out.org = c('Organization');
  out.heading = document.querySelector('h3')?.textContent ?? null;
  out.toggles = window.__toggles; out.saved = window.__saved;
  return out;
})()`;

const CASES = [
  {
    name: 'Bharat Griha Raksha from the dashboard (FIRE): a home, every section opened once',
    start: DASHBOARD,
    client: HOME,
    run: { form: 'griha', cover: 'building-contents' },
    outcome: 'ready',
    expect: {
      heading: 'New India Bharat Griha Raksha Insurance',
      first: 'Synthetic',
      typeOfPolicy: 'string:Retail',
      whatDoUWantToCover: 'string:Home Building & Home Contents',
      pinCode: '411001',
      locationPin0: '411001',
      riskLocationBuildingName: 'Synthetic Heights',
      riskLocationNearbyLandmark: 'Near Synthetic Park',
      locationAddress0: 'Flat 4, Synthetic Heights, Pune',
      carpetArea0: '90',
      rateOfCostOfCons0: '25000',
      furniFixFitSI0: '300000',
      eleclElectroSI0: '200000',
      otherGenContSI0: '100000',
      typeOfConsWalls0: 'string:Pucca',
      yearOfCons: 'string:1990',
      ageOfBuilding: '36',
      ageOfBuilding30Yr: 'string:Yes',
      noOfFloorOccupancy: '7',
      insuredOccu: '4',
      heightofBuild: '21',
      nameOfOwner: 'Synthetic Owner',
      doesBuildingHaveElevator: 'string:Yes',
      operationalFireHydrant: 'string:Yes',
      past3YrClaimRatio: 'string:0-30',
      fireProtectionDetail: 'Extinguishers on each floor',
      maxICRinLast3Yr: '0',
      mortgagedYes: true,
      pastPolicyNo: true,
      // The three closed sections opened once each, none closed again.
      toggles: 3,
      saved: false,
    },
    toDo: [
      'earthquake state and district (zone)',
      'add-on covers',
      'Press Save & Calculate Premium',
    ],
  },
  {
    name: 'Bharat Flexi Laghu Udyam: a business, YES/NO lists, floor as a list, fire details in every box',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=flexi-laghu&pan=0',
    client: SHOP,
    run: { form: 'flexi-laghu', cover: 'building-contents-stocks' },
    outcome: 'ready',
    expect: {
      org: true,
      business: 'Synthetic Traders LLP',
      typeOfPolicy: 'string:Commercial',
      doYouWantToOpt: 'string:Building, Contents & Stocks',
      addressOfTheLocation0: 'Shop 2, Synthetic Bazaar, Mumbai',
      pinCode0: '400001',
      buildingIncludingAdditionalStructuresI0: '2500000',
      furnitureFixFittEquip0: '500000',
      plantMachinery0: '0',
      otherContentsSI0: '50000',
      otherContentDetails0: 'Counters and racks',
      typeOfConstructionRoof0: 'string:Kutcha',
      typeOfIndustry: 'string:Shops',
      onWhichFloor: 'string:Ground Floor',
      numberOfFloors: '2',
      operationalDetectors: 'string:YES',
      past3YearsClaimRatio: null,
      fireFightingArrangementsBldg: 'Two extinguishers',
      fireFightingArrangementsForRisk: 'Two extinguishers',
      fireProtectionDetails: 'Two extinguishers',
      distanceFromPublicFireBrigade: '3',
      isPropertyMortgagedt: 'string:Yes',
      saved: false,
    },
  },
  {
    name: 'Standard Fire and Special Perils: its own ids (v…), contents summed into one box',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=sfsp&pan=0',
    client: SHOP,
    run: { form: 'sfsp', cover: 'building-contents' },
    outcome: 'ready',
    expect: {
      vRiskOpted_3: 'string:Both Building and Content',
      vPinCodeRisk: '400001',
      vRiskLocationC: 'Opposite Synthetic Market',
      vBuildingSuperStructure0: '2500000',
      vFurnitureFittingsFixturesOtherContents0: '550000',
      vStocksStocksProcess0: '1500000',
      // The box is there, but its list has no "Shops": left empty and listed.
      vTypeIndustryOccupation_3: '',
      vYearConstruction_2: 'string:2010',
      vNumberFloorsOccupancy: '2',
      vInsuredOccupancySituatedWhichFloor: '0',
      vHeightBuildingMeters_3: '8',
      vOwned: 'Synthetic Traders LLP',
      vDoesBuildingHasLiftElevator: 'string:Yes',
      vPropertyMortgaged: 'string:Yes',
      vMaximumIcPolicy: '12',
      vHasPropertyPerils: 'string:No',
      saved: false,
    },
    // New India's SFSP list has no "Shops": left to the advisor.
    toDo: ['type of industry / occupation'],
  },
  {
    name: 'Standalone War: a home is Residential; sums and location',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=war&pan=0',
    client: HOME,
    run: { form: 'war', cover: 'building-contents' },
    outcome: 'ready',
    expect: {
      vTypePolicyDw: 'string:Residential',
      vLocationAddress: 'Flat 4, Synthetic Heights, Pune',
      vMaximumIcPolicy: '0',
      saved: false,
    },
  },
  {
    name: 'a business form for a home is refused with the reason',
    start: '/NIABancsPortal/QuoteNonCustomer.html?f=laghu&pan=0',
    client: HOME,
    run: { form: 'laghu', cover: 'building-contents' },
    outcome: 'refused',
    problem: 'is for business premises',
    expect: { saved: false, toggles: 0 },
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
    const ses = session.fromPartition(`nia-fire-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    await win.loadURL(origin + c.start);
    const result = await runNiaFireQuote({
      windows: () => [win],
      client: c.client,
      run: c.run,
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
    if (c.problem && !result.problems.some((p) => p.includes(c.problem)))
      problems.push(`problems ${JSON.stringify(result.problems)} lack "${c.problem}"`);
    for (const [k, v] of Object.entries(c.expect ?? {}))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    for (const item of c.toDo ?? [])
      if (!(result.toDo ?? []).some((t) => t.startsWith(item)))
        problems.push(`to do lacks "${item}": ${JSON.stringify(result.toDo)}`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  New India fire: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} New India fire checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
