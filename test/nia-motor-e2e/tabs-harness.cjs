// The insurer tabs' host (bundled real code, portal-host.ts) while insurers are filled at once
// (26 November 2026: combined runs broke Niva Bupa and HDFC, solo runs worked). A tab that loads a
// page while detached draws no frame at all (Flutter's 1up shows no buttons, Ionic's and
// Material's overlays never close); the host keeps the tabs of insurers being filled attached and
// drawing, the one in front on top. Checks: two insurers' tabs both draw while filled, the one
// behind included, also after it loads a new page (a reset, 1up to PIE); the app's own screens
// asked for meanwhile show one of them; once filled, only the tab in front stays attached.
// Exits 0 only if every check passes. Started by run.mjs tabs (npm run test:nia -- tabs).
const { app, BrowserWindow } = require('electron');
const { createPortalHost } = require(process.env.FQF_LOGIN_E2E_BUNDLE);

app.on('window-all-closed', () => {});
setTimeout(() => {
  console.log('FAIL  harness timed out');
  app.exit(1);
}, 120_000).unref();
const PAGE = (name) =>
  `data:text/html,<body>${name}<script>window.n=0;(function f(){window.n++;requestAnimationFrame(f)})();</script></body>`;
const rate = async (wc) => {
  const a = await wc.executeJavaScript('window.n');
  await new Promise((r) => setTimeout(r, 1000));
  return (await wc.executeJavaScript('window.n')) - a;
};
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: true,
    webPreferences: { backgroundThrottling: false },
  });
  await win.loadURL('data:text/html,<h1>the app screens</h1>');
  const host = createPortalHost({ window: () => win });
  const niva = host.openPortal('niva-bupa', 'Niva Bupa', {});
  const hdfc = host.openPortal('hdfc-ergo', 'HDFC ERGO', {});
  const problems = [];
  const check = (name, ok, got) => {
    console.log(`${ok ? 'pass' : 'FAIL'}  tabs: ${name}${ok ? '' : ` (${got})`}`);
    if (!ok) problems.push(name);
  };
  // As a combined run starts: both tabs sent home (loaded while not in front), the app's screens.
  host.show(null);
  host.setWorking(['niva-bupa', 'hdfc-ergo']);
  await niva.webContents.loadURL(PAGE('niva'));
  await hdfc.webContents.loadURL(PAGE('hdfc'));
  await wait();
  const front = host.state().active;
  check('the page area shows one of the insurers being filled', front !== null, front);
  const n1 = await rate(niva.webContents);
  const h1 = await rate(hdfc.webContents);
  check('both tabs draw while filled (the one behind too)', n1 > 20 && h1 > 20, `${n1}, ${h1}`);
  // The tab behind loads a new page (as 1up to PIE).
  const behind = front && front.startsWith('niva') ? hdfc : niva;
  await behind.webContents.loadURL(PAGE('moved'));
  await wait();
  const b = await rate(behind.webContents);
  check('the tab behind still draws after loading a new page', b > 20, b);
  // The app's screens asked for while filling: one of the insurers stays shown.
  host.show(null);
  await wait(200);
  check('the app screens wait while insurers are filled', host.state().active !== null, 'null');
  // Filled: only the tab in front stays attached.
  host.setWorking([]);
  await wait(200);
  const attached = win.contentView.children.length;
  check('once filled, only the tab in front stays attached', attached === 1, attached);
  // A tab never filled, not in front: detached as before.
  host.show(null);
  await wait(200);
  check(
    'the app screens come back once filled',
    host.state().active === null && win.contentView.children.length === 0,
    `${host.state().active}, ${win.contentView.children.length}`,
  );
  console.log(
    `\n${problems.length ? 'FAIL' : 'all'} tab checks ${problems.length ? `failed: ${problems.join('; ')}` : 'passed'}`,
  );
  app.exit(problems.length ? 1 : 0);
});
