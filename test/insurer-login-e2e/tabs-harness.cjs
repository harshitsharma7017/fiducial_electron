// Insurer pages as tabs of the app window (src/main/insurers/portal-host.ts), end to end against
// the local copy of United India's home page and Motor calculator: the portal opens as a tab, the
// calculator pop-up is adopted as a second tab (no window of its own), the motor quote runs in it
// and reads the premium, the pages have no Node.js or bridge, and closing tabs behaves.
// Exits 0 only if every check passes. Started by run-motor.mjs tabs.
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const FIXTURES = require('./uiic-motor-calculator.cjs');

const {
  createLogger,
  createPortalHost,
  installNavigationPolicy,
  runUiicMotorQuote,
  setSessionPolicy,
} = require(process.env.FQF_LOGIN_E2E_BUNDLE);

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

const CAR = {
  vehicleClass: 'private-car',
  condition: 'new',
  registrationDate: '2026-11-01',
  zone: 'A',
  idvRupees: 650000,
  odDiscountPercent: 10,
  cubicCapacityCc: 1197,
  batteryOperated: false,
  longTermOd: false,
};

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'pass' : 'FAIL'}  tabs: ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failures += 1;
};

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  installNavigationPolicy(createLogger([]));

  // The app window (stands in for the app's own page).
  const appWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  await appWindow.loadURL('data:text/html,<title>App</title><p>App screens</p>');
  const host = createPortalHost({ window: () => appWindow });

  const ses = session.fromPartition(`uiic-tabs-${Math.random()}`);
  const locked = { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false };
  setSessionPolicy(ses, {
    navigate: (url) => url.startsWith(origin + '/'),
    popup: (url) => (url.startsWith(origin + '/') ? { webPreferences: locked } : null),
    adopt: (options) => host.adoptPopup('united-india', options),
  });

  const portal = host.openPortal('united-india', 'United India', locked);
  await portal.webContents.loadURL(origin + '/GCWebPortal/login/HomeAction.do');
  const first = host.state();
  check(
    'the portal opens as a tab, shown at once',
    first.tabs.length === 1 && first.active === first.tabs[0].id && first.tabs[0].kind === 'portal',
    JSON.stringify(first),
  );

  const result = await runUiicMotorQuote({
    windows: () => host.pagesOf('united-india'),
    vehicle: CAR,
    today: new Date(2026, 10, 2),
  });
  const expected = String(Math.round(650000 * 0.0205 * 0.9));
  check(
    'the motor quote runs in the calculator tab and reads the premium',
    result.outcome === 'ready' && result.premium?.amount === expected,
    JSON.stringify(result),
  );

  const after = host.state();
  const popup = after.tabs.find((t) => t.kind === 'popup');
  check(
    'the calculator pop-up became a tab of the same insurer, not a window',
    BrowserWindow.getAllWindows().length === 1 &&
      after.tabs.length === 2 &&
      popup?.insurerId === 'united-india' &&
      popup.title === 'Motor Premium Calculator',
    `${BrowserWindow.getAllWindows().length} windows; ${JSON.stringify(after.tabs)}`,
  );

  // The insurer pages have no Node.js and no bridge.
  const pages = host.pagesOf('united-india');
  const exposure = await Promise.all(
    pages.map((p) =>
      p.webContents.executeJavaScript(
        '[typeof require, typeof process, typeof module, typeof window.fqf, typeof window.electron].join()',
      ),
    ),
  );
  check(
    'the insurer pages have no Node.js and no bridge to the app',
    exposure.length === 2 &&
      exposure.every((e) => e === 'undefined,undefined,undefined,undefined,undefined'),
    JSON.stringify(exposure),
  );

  // Only the shown tab is attached to the window; showing the app detaches it.
  check(
    'only the shown tab is laid in the window',
    appWindow.contentView.children.length === 1,
    `${appWindow.contentView.children.length} views attached`,
  );
  host.show(null);
  check(
    'showing the app screens takes the insurer page away',
    appWindow.contentView.children.length === 0 && host.state().active === null,
  );

  // Closing the pop-up's tab closes it for good; closing the portal's tab only hides it.
  host.close(popup.id);
  await new Promise((r) => setTimeout(r, 200));
  check(
    "closing the calculator's tab closes it",
    host.state().tabs.length === 1 && host.pagesOf('united-india').length === 1,
    JSON.stringify(host.state()),
  );
  const portalTab = host.state().tabs[0];
  host.close(portalTab.id);
  check(
    "closing the portal's tab only hides it (the signed-in page stays)",
    host.state().tabs.length === 0 && host.portalOf('united-india') !== null,
    JSON.stringify(host.state()),
  );
  host.showPortal('united-india');
  check(
    'showing the portal again brings back the same page',
    host.state().tabs.length === 1 &&
      host.portalOf('united-india').webContents.getURL().endsWith('/HomeAction.do'),
  );

  // Waiting for changes: answered at once when behind, after the change otherwise.
  const v = host.state().version;
  const behind = await host.waitForChange(v - 1, 5000);
  const waiting = host.waitForChange(v, 5000);
  setTimeout(() => host.show(null), 100);
  const t0 = Date.now();
  const next = await waiting;
  check(
    'the tab bar learns of changes as they happen',
    behind.version === v && next.version > v && Date.now() - t0 < 2000,
    `behind ${behind.version}, next ${next.version}`,
  );

  host.closeInsurer('united-india');
  check('ending the session closes its tabs', host.portalOf('united-india') === null);

  console.log(
    `\n${failures === 0 ? 'all' : failures + ' failed of the'} tab checks ${failures === 0 ? 'passed' : ''}`,
  );
  server.close();
  app.exit(failures ? 1 : 0);
});
