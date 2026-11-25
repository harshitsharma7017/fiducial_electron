// Runs the Bajaj Allianz Personal Accident automation (bundled real code, run-bajaj-pa.ts) against
// the local copy of the partner portal's form (bajaj-form.cjs): from the dashboard, the form opened
// by its address, the plan, tenure, pincode (city filled by Bajaj), family income, the proposer,
// the covers' sums insured, Calculate Premium, and the premium read. Checks Bajaj's own message
// stops the run with its words, a date of birth box that takes no typing is left for the advisor
// (Calculate Premium then not pressed), no signed-in tab is refused, and Proceed is never pressed.
// Contacts no insurer: served from 127.0.0.1. Exits 0 only if every check passes. Started by
// run.mjs bajaj (npm run test:nia -- bajaj).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./bajaj-form.cjs');
const { installNavigationPolicy, createLogger, runBajajPaQuote, setSessionPolicy } = require(
  process.env.FQF_LOGIN_E2E_BUNDLE,
);

app.on('window-all-closed', () => {});
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.on(event, (err) => {
    console.log(`FAIL  harness error: ${err && err.message ? err.message : String(err)}`);
    app.exit(1);
  });
}
let params = new URLSearchParams();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const render = FIXTURES[url.pathname];
  res.writeHead(render ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(render ? render(params) : 'not found');
});

const CLIENT = {
  customer: { name: 'Synthetic Insured Person', phone: '9876543210' },
  pincode: '380001',
  members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-01-25', gender: 'female' }],
};
const RUN = {
  plan: '8428',
  tenureYears: 3,
  familyIncome: 1200000,
  monthlyIncome: 60000,
  occupation: '108',
  deathSumInsured: 500000,
  partialDisabilitySumInsured: 500000,
};
const READ = `(() => {
  const v = (s) => document.querySelector(s)?.value ?? null;
  return {
    path: location.pathname, plan: v('#policy_plan'), tenure: window.__tenure ?? null,
    pincode: v('#pincode'), city: v('#city'), familyIncome: v('#familyIncome'),
    firstName: v('#member_firstname0'), gender: v('#member_gender0'), dob: v('#member_dob0'),
    income: v('#member_income0'), occupation: v('#member_occupation0'),
    death: v('#deathSumInsured0'), partial: v('#permanentPartialDisabilitySumInsured0'),
    total: v('#permanentTotalDisabilitySumInsured0'),
    calculated: window.__calculated ?? null, proceeded: window.__proceeded ?? null,
  };
})()`;
const premium = Math.round((500000 + 500000) * 0.0012 + 199);

const CASES = [
  {
    name: 'from the dashboard: the form, every detail, Calculate Premium, the premium read',
    start: '/',
    run: RUN,
    outcome: 'ready',
    message: `Bajaj worked the premium out: ₹${premium.toLocaleString('en-IN')} for Bajaj Allianz Global Personal Guard Policy (Individual), 3 years.`,
    amount: `₹${premium.toLocaleString('en-IN')}`,
    expect: {
      path: '/health/IssuePolicy/PersonalAccident',
      plan: '8428',
      tenure: '3Y',
      pincode: '380001',
      city: 'AHMEDABAD',
      familyIncome: '1200000',
      firstName: 'Synthetic',
      gender: 'F',
      dob: '25/01/1986',
      income: '60000',
      occupation: '108',
      death: '500000',
      partial: '500000',
      total: '',
      calculated: 1,
      proceeded: false,
    },
  },
  {
    name: "Bajaj's own message (a timeout, plan 9901): handed over with its words",
    start: '/',
    run: { ...RUN, plan: '9901' },
    outcome: 'handed-over',
    message: 'Bajaj says: Timeout occurred in getting response.',
    expect: { plan: '9901', calculated: 1, proceeded: false },
  },
  {
    name: 'a date of birth box that takes no typing: left for the advisor, Calculate Premium not pressed',
    start: '/',
    params: 'dob=readonly',
    run: RUN,
    outcome: 'handed-over',
    message: 'The app filled what it could.',
    toDo: 'Date of Birth: fill it in yourself',
    expect: { dob: '', occupation: '108', death: '500000', calculated: 0, proceeded: false },
  },
  {
    name: 'no Bajaj tab signed in to the partner portal: refused',
    start: null,
    run: RUN,
    outcome: 'refused',
    message: 'Sign in to Bajaj Allianz first',
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  let failures = 0;
  for (const c of CASES) {
    params = new URLSearchParams(c.params ?? '');
    const ses = session.fromPartition(`bajaj-${Math.random()}`);
    setSessionPolicy(ses, { navigate: (url) => url.startsWith(origin + '/'), popup: () => null });
    const win = new BrowserWindow({
      show: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    if (c.start) await win.loadURL(origin + c.start);
    const result = await runBajajPaQuote({
      windows: () => [win],
      client: CLIENT,
      run: c.run,
      origins: [origin],
    });
    const state = c.start
      ? await win.webContents.executeJavaScript(READ).catch((e) => ({ error: e.message }))
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
    if (c.toDo && !(result.toDo ?? []).some((t) => t.startsWith(c.toDo)))
      problems.push(`to do lacks "${c.toDo}": ${JSON.stringify(result.toDo)}`);
    for (const [k, v] of Object.entries(c.expect ?? {}))
      if (!same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state[k])} (expected ${JSON.stringify(v)})`);
    win.destroy();
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  Bajaj Allianz: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${CASES.length - failures} of ${CASES.length} Bajaj Allianz checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
