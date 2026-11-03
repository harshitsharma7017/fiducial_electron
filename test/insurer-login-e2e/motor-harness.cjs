// Runs the United India motor automation (bundled real code) against the local copy of the Motor
// calculator, for several vehicle classes, and checks what was filled and the premium read back.
// Exits 0 only if every check passes. Started by run-motor.mjs.
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./uiic-motor-calculator.cjs');

const { installNavigationPolicy, createLogger, runUiicMotorQuote, setSessionPolicy } = require(
  process.env.FQF_LOGIN_E2E_BUNDLE,
);

app.on('window-all-closed', () => {});
// Why a page went away, if one does (a crashed renderer, a navigation): printed with FQF_E2E_TRACE.
const T0 = Date.now();
const trace = (...a) =>
  process.env.FQF_E2E_TRACE && console.log(`trace +${Date.now() - T0}ms`, ...a);
app.on('web-contents-created', (_e, wc) => {
  const id = wc.id;
  wc.on('render-process-gone', (_ev, d) =>
    trace(`wc${id} render-process-gone`, d.reason, d.exitCode),
  );
  wc.on('did-start-navigation', (d) =>
    trace(`wc${id} navigate`, d.url, d.isMainFrame ? 'main' : 'sub'),
  );
  wc.on('destroyed', () => trace(`wc${id} destroyed`));
});
app.on('child-process-gone', (_e, d) => trace('child-process-gone', d.type, d.reason, d.exitCode));
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

const F = 'motorPolicyData.mtrInitData.NewMotorPolicyForm';
const CASES = [
  {
    name: 'new private car: cover period, CC band, both dates, IDV, discount, premium read',
    vehicle: {
      vehicleClass: 'private-car',
      condition: 'new',
      registrationDate: '2026-11-01',
      zone: 'A',
      idvRupees: 650000,
      odDiscountPercent: 10,
      cubicCapacityCc: 1197,
      batteryOperated: false,
      longTermOd: false,
    },
    expect: {
      cls: '18',
      biz: 'New',
      cover: 'string:1',
      cc: '1500',
      battery: false,
      issue: '02/11/2026',
      reg: '01/11/2026',
      zone: 'Zone-A',
      idv: '650000',
      disc: '10',
    },
    premium: String(Math.round(650000 * 0.0205 * 0.9)),
  },
  {
    name: 'pre-owned two-wheeler: claim and NCB, older registration date (month by month)',
    vehicle: {
      vehicleClass: 'two-wheeler',
      condition: 'pre-owned',
      registrationDate: '2022-03-15',
      zone: 'B',
      idvRupees: 52000,
      cubicCapacityCc: 125,
      batteryOperated: false,
      claimLastYear: false,
      previousNcbPercent: 25,
    },
    expect: {
      cls: '3',
      biz: 'Renewal',
      cc: '150',
      ncb: '25',
      claim: false,
      reg: '15/03/2022',
      zone: 'Zone-B',
      idv: '52000',
    },
    premium: String(Math.round(52000 * 0.0205)),
  },
  {
    name: 'new school bus: seating capacity box and type of bus',
    vehicle: {
      vehicleClass: 'bus-above-6',
      condition: 'new',
      registrationDate: '2026-10-20',
      zone: 'C',
      idvRupees: 2400000,
      seatingCapacity: 40,
      busType: 'school',
    },
    expect: { cls: '11', seats: '40', bus: 'School Bus', reg: '20/10/2026' },
    premium: String(Math.round(2400000 * 0.0205)),
  },
  {
    name: 'new special vehicle: type by name and HP band',
    vehicle: {
      vehicleClass: 'special',
      condition: 'new',
      registrationDate: '2026-11-02',
      zone: 'A',
      idvRupees: 800000,
      specialType: 'Agricultural Tractors',
      horsePower: 35,
    },
    expect: { cls: '12', special: 'string:1', cc: '10' },
    premium: String(Math.round(800000 * 0.0205)),
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));
  let failures = 0;
  const today = new Date(2026, 10, 2);

  const runCase = async (vehicle) => {
    const ses = session.fromPartition(`uiic-motor-${Math.random()}`);
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
    // With FQF_E2E_TRACE: what the calculator shows every 3 s while the run is going.
    const watch = setInterval(() => {
      const w = windows().find((x) => x.webContents.getURL().includes('MotorQuote.html'));
      if (!w || !process.env.FQF_E2E_TRACE) return;
      w.webContents
        .executeJavaScript(
          `JSON.stringify({ dates: [...document.querySelectorAll('input[id*=String]')].map((i) => i.id + '=' + i.value),
             picker: [...document.querySelectorAll('[role=grid], .uib-datepicker-popup, ul.dropdown-menu')].filter((e) => e.offsetParent).map((e) => e.textContent.replace(/\\s+/g, ' ').slice(0, 60)),
             dialogs: [...document.querySelectorAll('.modal')].filter((e) => e.offsetParent || getComputedStyle(e).display !== 'none').map((e) => e.textContent.replace(/\\s+/g, ' ').slice(0, 60)) })`,
        )
        .then((t) => trace('page', t))
        .catch((e) => trace('page read failed', e.message));
    }, 3000);
    const result = await runUiicMotorQuote({ windows, vehicle, today });
    clearInterval(watch);
    const calc = windows().find((w) => w.webContents.getURL().includes('MotorQuote.html'));
    const state =
      calc && !calc.isDestroyed()
        ? await calc.webContents
            .executeJavaScript(
              `(() => {
          const M = (n) => document.querySelector('[ng-model="${F}.' + n + '"]');
          const v = (s) => document.querySelector(s)?.value;
          return {
            cls: v('#vehicleType'), biz: M('businessType').value, cover: v('#lonTermCoverTypeProp'), cc: v('#cubicCapacity'),
            battery: document.querySelector('[ng-model="motorPolicyData.fuelcheck"]')?.checked, claim: document.querySelector('[ng-model="motorPolicyData.claimCheck"]')?.checked, ncb: v('#selectPrevNCB'), seats: v('#seatingCapacity'),
            bus: v('#busCategory'), special: v('#mvehicleType'), issue: v('input#dateOfIssueOfPolicyString'), reg: v('input#dateOfPurchaseString'),
            zone: v('#vehicleZone'), idv: (document.querySelector('#iibAutoRiskIdv') || document.querySelector('#autoRiskIdv'))?.value, disc: v('#odDisc'),
          };
        })()`,
            )
            .catch((e) => ({ readError: e.message }))
        : null;
    for (const w of windows()) w.destroy();
    return { result, state };
  };

  for (const c of CASES.filter(
    (_, i) => !process.env.FQF_E2E_CASE || String(i + 1) === process.env.FQF_E2E_CASE,
  )) {
    const { result, state } = await runCase(c.vehicle);
    const problems = [];
    if (result.outcome !== 'ready')
      problems.push(
        `outcome ${result.outcome} at ${result.step}: ${result.message} ${JSON.stringify(result.problems)}`,
      );
    if (result.premium?.amount !== c.premium)
      problems.push(`premium ${JSON.stringify(result.premium)} (expected ${c.premium})`);
    for (const [k, v] of Object.entries(c.expect))
      if (!state || !same(state[k], v))
        problems.push(`${k}: ${JSON.stringify(state?.[k])} (expected ${JSON.stringify(v)})`);
    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  United India motor: ${c.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`,
    );
    failures += problems.length ? 1 : 0;
  }

  // United India's ERRORS pop-up stops the run, with its message.
  {
    const { result } = await runCase({ ...CASES[0].vehicle, idvRupees: 60000000 });
    const ok =
      result.outcome === 'failed' &&
      result.step === 'Click To See Premium' &&
      result.message.includes('IDV exceeds the permitted limit');
    console.log(
      `${ok ? 'pass' : 'FAIL'}  United India motor: stops with United India's ERRORS message${ok ? '' : `\n      ${JSON.stringify(result)}`}`,
    );
    failures += ok ? 0 : 1;
  }

  const total = CASES.length + 1;
  console.log(`\n${total - failures} of ${total} motor checks passed`);
  server.close();
  app.exit(failures ? 1 : 0);
});
