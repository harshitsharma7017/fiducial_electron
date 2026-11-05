// Runs the keep-alive agent (bundled real code, src/main/insurers/session-alive.ts) in a local page
// that signs out after 3 seconds without mouse or key events, warns 1.5 seconds before, and counts
// the fetches of its page. Checks the warning's Continue is pressed (never Logout or Cancel, never
// a pop-up that is not about the session), the activity keeps the page signed in, the fetch reaches
// the server and the page shown does not change. Contacts no insurer: served from 127.0.0.1.
// Started by run.mjs alive (npm run test:nia -- alive).
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');
const { keepAliveAgent } = require(process.env.FQF_LOGIN_E2E_BUNDLE);

app.on('window-all-closed', () => {});
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.on(event, (err) => {
    console.log(`FAIL  harness error: ${err && err.message ? err.message : String(err)}`);
    app.exit(1);
  });
}
setTimeout(() => {
  console.log('FAIL  harness timed out');
  app.exit(1);
}, 60_000).unref();
let hits = 0;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Portal</title>
<style>.hidden{display:none}.modal{border:1px solid #888;padding:8px}</style></head><body>
<h3>Home</h3>
<div id="warn" class="modal hidden" role="dialog"><p>Your session is about to expire due to inactivity.</p>
  <button id="logout">Logout</button> <button id="stay">Continue</button></div>
<div id="cancel-only" class="modal hidden" role="dialog"><p>Your session will time out.</p>
  <button id="c-logout">Log out</button> <button id="c-cancel">Cancel</button></div>
<div id="other" class="modal hidden" role="dialog"><p>Premium details</p><button id="other-ok">OK</button></div>
<div id="leave" class="modal hidden" role="dialog"><p>Your session is idle. Are you sure you want to log out?</p><button id="leave-yes">Yes</button></div>
<script>
  let last = Date.now();
  window.__loggedOut = false; window.__clicked = [];
  const reset = () => { last = Date.now(); };
  ['mousemove', 'keydown'].forEach((e) => document.addEventListener(e, reset));
  document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => window.__clicked.push(b.id)));
  document.querySelector('#stay').addEventListener('click', () => { reset(); document.querySelector('#warn').classList.add('hidden'); });
  setInterval(() => {
    const idle = Date.now() - last;
    if (idle > 3000) window.__loggedOut = true;
    else if (idle > 1500) document.querySelector('#warn').classList.remove('hidden');
  }, 100);
</script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.headers['sec-fetch-mode'] !== 'navigate') hits += 1;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/app/home`;
  const win = new BrowserWindow({
    show: true,
    webPreferences: {
      session: session.fromPartition(`alive-${Math.random()}`),
      sandbox: true,
      contextIsolation: true,
    },
  });
  await win.loadURL(url);
  const agent = (command) =>
    win.webContents.executeJavaScriptInIsolatedWorld(1805, [
      { code: `(${keepAliveAgent.toString()})(${JSON.stringify(command)})` },
    ]);
  const state = () =>
    win.webContents.executeJavaScript(
      `({ out: window.__loggedOut, clicked: window.__clicked, warn: !document.querySelector('#warn').classList.contains('hidden') })`,
    );
  const problems = [];
  const check = (name, ok, detail) => {
    console.log(
      `${ok ? 'pass' : 'FAIL'}  keep-alive: ${name}${ok ? '' : `\n      ${JSON.stringify(detail)}`}`,
    );
    if (!ok) problems.push(name);
  };

  // 1. The session warning: Continue is pressed, not Logout.
  await sleep(1900);
  const warned = await state();
  const answered = await agent({ activity: false, ping: null });
  const after = await state();
  check(
    'presses Continue on the session warning, never Logout',
    warned.warn &&
      answered.answered &&
      !after.warn &&
      !after.out &&
      after.clicked.join() === 'stay',
    { warned, answered, after },
  );

  // 2. Activity every second keeps the page signed in well past its 3 seconds; fetches reach the
  // server; the page shown stays where it was.
  const before = hits;
  for (let i = 0; i < 6; i++) {
    const r = await agent({ activity: true, ping: url });
    if (r.pinged !== true) problems.push('ping');
    await sleep(1000);
  }
  const kept = await state();
  check(
    'activity keeps the page signed in; the page is fetched in the background; nothing navigates',
    !kept.out && !kept.warn && hits - before === 6 && win.webContents.getURL() === url,
    { kept, fetched: hits - before, url: win.webContents.getURL() },
  );

  // 3. A session pop-up with only Log out and Cancel, and a pop-up not about the session: untouched.
  await win.webContents.executeJavaScript(
    `document.querySelector('#cancel-only').classList.remove('hidden'); document.querySelector('#other').classList.remove('hidden'); window.__clicked = [];`,
  );
  const untouched = await agent({ activity: true, ping: null });
  const left = await state();
  check(
    'never presses Log out or Cancel, nor OK on a pop-up not about the session',
    !untouched.answered && left.clicked.length === 0,
    { untouched, left },
  );

  // 4. "Are you sure you want to log out?": its Yes would sign out, so it is not answered.
  await win.webContents.executeJavaScript(
    `['#cancel-only', '#other'].forEach((s) => document.querySelector(s).classList.add('hidden')); document.querySelector('#leave').classList.remove('hidden'); window.__clicked = [];`,
  );
  const asked = await agent({ activity: false, ping: null });
  const stayed = await state();
  check(
    'never answers Yes to "Are you sure you want to log out?"',
    !asked.answered && stayed.clicked.length === 0,
    { asked, stayed },
  );

  win.destroy();
  server.close();
  console.log(`\n${4 - problems.length} of 4 keep-alive checks passed`);
  app.exit(problems.length ? 1 : 0);
});
