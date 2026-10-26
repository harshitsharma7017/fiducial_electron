// S2: per-insurer session isolation against a LOCAL mock portal (never a real insurer),
// default-deny navigation/popup/permission policy, and the in-process CDP driver.
import { randomBytes } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import { check, type Check } from '../../shared/result';
import { CdpDriver } from '../cdp-driver';
import { startMockPortal } from '../mock-portal';
import { allowOrigins, hardenSession, policyLog } from '../navigation-policy';
import type { SpikeContext, SpikeOutcome } from '../spike-context';
import { delay, sanitisePath } from '../util';
import { insurerViewPreferences } from '../web-preferences';

const PARTITION_A = 'persist:insurer-mock-a';
const PARTITION_B = 'persist:insurer-mock-b';

interface PageState {
  cookie: string;
  local: string | null;
  session: string | null;
}

const READ_STATE = `JSON.stringify({ cookie: document.cookie, local: localStorage.getItem('fqf_mock'), session: sessionStorage.getItem('fqf_mock') })`;

function insurerWindow(partition: string, origins: readonly string[]): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: insurerViewPreferences(partition),
  });
  allowOrigins(win.webContents, origins);
  return win;
}

export async function runS2(_ctx: SpikeContext): Promise<SpikeOutcome> {
  const checks: Check[] = [];
  const tag = randomBytes(6).toString('hex');
  const markerA = `A-${tag}`;
  const portal = await startMockPortal();
  const sesA = session.fromPartition(PARTITION_A);
  const sesB = session.fromPartition(PARTITION_B);
  hardenSession(sesA);
  hardenSession(sesB);
  await Promise.all([sesA.clearStorageData(), sesB.clearStorageData()]);

  const winA = insurerWindow(PARTITION_A, [portal.portalOrigin]);
  const winB = insurerWindow(PARTITION_B, [portal.portalOrigin]);
  const drivers: CdpDriver[] = [];
  try {
    // Insurer A: mock sign-in sets an HttpOnly cookie; the page stores JS cookie + web storage.
    await winA.loadURL(`${portal.portalOrigin}/login?view=A&tag=${tag}`);
    const a = new CdpDriver(winA.webContents);
    drivers.push(a);
    await a.evaluate(
      `document.cookie = 'fqf_mock_js=${markerA}; path=/; max-age=3600'; localStorage.setItem('fqf_mock', '${markerA}'); sessionStorage.setItem('fqf_mock', '${markerA}'); true`,
    );
    const aState = JSON.parse((await a.evaluate(READ_STATE)) as string) as PageState;
    const aCookies = await sesA.cookies.get({ url: portal.portalOrigin });

    // Insurer B: same origin, different partition.
    await winB.loadURL(`${portal.portalOrigin}/portal?view=B`);
    const b = new CdpDriver(winB.webContents);
    drivers.push(b);
    const bState = JSON.parse((await b.evaluate(READ_STATE)) as string) as PageState;
    const bCookies = await sesB.cookies.get({ url: portal.portalOrigin });
    const bRequestsCarriedA = portal.requests.some(
      (r) => r.view === 'B' && r.cookieHeader.includes(markerA),
    );

    const aHasBoth = ['fqf_mock_http', 'fqf_mock_js'].every((n) =>
      aCookies.some((c) => c.name === n && c.value === markerA),
    );
    checks.push(
      check(
        's2.control-a-state',
        'Positive control: partition A sees its own cookies and storage',
        true,
        aHasBoth && aState.local === markerA && aState.session === markerA,
        aHasBoth && aState.local === markerA && aState.session === markerA,
      ),
      check(
        's2.b-no-a-cookies-api',
        "Partition B cookie store has none of A's cookies",
        0,
        bCookies.filter((c) => c.value === markerA).length,
        !bCookies.some((c) => c.value === markerA),
      ),
      check(
        's2.b-no-a-document-cookie',
        "B's page cannot read A's cookie via document.cookie",
        false,
        bState.cookie.includes(markerA),
        !bState.cookie.includes(markerA),
      ),
      check(
        's2.b-no-a-local-storage',
        "B's page cannot read A's localStorage",
        null,
        bState.local,
        bState.local === null,
      ),
      check(
        's2.b-no-a-session-storage',
        "B's page cannot read A's sessionStorage",
        null,
        bState.session,
        bState.session === null,
      ),
      check(
        's2.b-requests-no-a-cookie',
        "B's HTTP requests never carried A's cookies (incl. HttpOnly)",
        false,
        bRequestsCarriedA,
        !bRequestsCarriedA,
      ),
    );

    // No Node.js or preload bridge inside insurer content.
    const exposure = JSON.parse(
      (await b.evaluate(
        `JSON.stringify({ require: typeof require, process: typeof process, module: typeof module, bridge: typeof window.fqfSpike })`,
      )) as string,
    ) as Record<string, string>;
    checks.push(
      check(
        's2.no-node-in-insurer-view',
        'Insurer view has no require/process/module/preload bridge',
        { require: 'undefined', process: 'undefined', module: 'undefined', bridge: 'undefined' },
        exposure,
        Object.values(exposure).every((v) => v === 'undefined'),
      ),
    );

    // Permissions are denied by the session policy.
    const permissions = JSON.parse(
      (await b.evaluate(
        `(async () => {
          const out = {};
          out.notification = await Notification.requestPermission();
          out.geolocation = await new Promise((resolve) => navigator.geolocation.getCurrentPosition(() => resolve('granted'), (e) => resolve('error-code-' + e.code), { timeout: 3000 }));
          try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); out.camera = 'granted'; } catch (e) { out.camera = 'denied:' + e.name; }
          out.permissionsQueryGeolocation = (await navigator.permissions.query({ name: 'geolocation' })).state;
          return JSON.stringify(out);
        })()`,
        true,
        10_000,
      )) as string,
    ) as Record<string, string>;
    const anyGranted = Object.values(permissions).some((v) => v === 'granted');
    checks.push(
      check(
        's2.permissions-denied',
        'Notification, geolocation and camera requests are denied',
        'none granted',
        permissions,
        !anyGranted,
      ),
    );

    // Popups are denied.
    const windowsBefore = BrowserWindow.getAllWindows().length;
    const popup = await b.evaluate(`String(window.open('${portal.otherOrigin}/landing'))`);
    await delay(500);
    const windowsAfter = BrowserWindow.getAllWindows().length;
    checks.push(
      check(
        's2.popup-denied',
        'window.open is denied and creates no window',
        { returned: 'null', newWindows: 0 },
        { returned: popup, newWindows: windowsAfter - windowsBefore },
        popup === 'null' && windowsAfter === windowsBefore,
      ),
    );

    // Navigation and redirects to a non-allowlisted origin are blocked.
    await b.evaluate(`location.href = '${portal.otherOrigin}/landing'; true`);
    await delay(1000);
    const afterNav = new URL(winB.webContents.getURL()).origin;
    await b.evaluate(`location.href = '${portal.portalOrigin}/redirect-out'; true`);
    await delay(1000);
    const afterRedirect = new URL(winB.webContents.getURL()).origin;
    const otherHit = portal.requests.some((r) => r.server === 'other');
    checks.push(
      check(
        's2.navigation-blocked',
        'Navigation to another origin is blocked',
        portal.portalOrigin,
        afterNav,
        afterNav === portal.portalOrigin,
      ),
      check(
        's2.redirect-blocked',
        'Server redirect to another origin is blocked',
        portal.portalOrigin,
        afterRedirect,
        afterRedirect === portal.portalOrigin,
      ),
      check(
        's2.other-origin-untouched',
        'The other origin never received a request',
        false,
        otherHit,
        !otherHit,
      ),
    );

    // CDP driver: fill and click through webContents.debugger (no TCP port).
    await a.evaluate(`document.getElementById('age').focus(); true`);
    await a.send('Input.insertText', { text: '35' });
    await a.evaluate(`document.getElementById('relationship').value = 'self'; true`);
    const rect = JSON.parse(
      (await a.evaluate(
        `JSON.stringify(document.getElementById('get-quote').getBoundingClientRect())`,
      )) as string,
    ) as { x: number; y: number; width: number; height: number };
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    let mouseClick = 'dispatched';
    try {
      await a.send(
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', x, y, button: 'left', clickCount: 1 },
        3000,
      );
      await a.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 },
        3000,
      );
    } catch {
      mouseClick = 'timed-out';
    }
    await delay(200);
    let output = (await a.evaluate(`document.getElementById('result').textContent`)) as string;
    let clickMethod = 'cdp-mouse';
    if (!output) {
      clickMethod = 'dom-click-fallback';
      await a.evaluate(`document.getElementById('get-quote').click(); true`);
      output = (await a.evaluate(`document.getElementById('result').textContent`)) as string;
    }
    const expectedOutput = 'MOCK premium for self aged 35: INR 8500';
    checks.push(
      check(
        's2.cdp-driver',
        'CDP driver typed, clicked and read the mock form',
        expectedOutput,
        output,
        output === expectedOutput,
      ),
      check(
        's2.cdp-mouse-click',
        'CDP mouse click works on a hidden window',
        'cdp-mouse',
        clickMethod,
        clickMethod === 'cdp-mouse',
      ),
    );

    for (const d of drivers) d.detach();
    await Promise.all([sesA.cookies.flushStore(), sesB.cookies.flushStore()]);

    return {
      checks,
      facts: {
        partitions: [PARTITION_A, PARTITION_B],
        storagePaths: [sesA.storagePath, sesB.storagePath].map((p) => (p ? sanitisePath(p) : null)),
        cookieNamesA: aCookies.map((c) => c.name).sort(),
        mouseClick,
        policy: {
          blockedNavigations: policyLog.blockedNavigations.length,
          blockedRedirects: policyLog.blockedRedirects.length,
          deniedPopups: policyLog.deniedPopups.length,
          deniedPermissionRequests: [...new Set(policyLog.deniedPermissionRequests)].sort(),
          deniedPermissionChecks: policyLog.deniedPermissionChecks,
        },
      },
    };
  } finally {
    for (const d of drivers) d.detach();
    winA.destroy();
    winB.destroy();
    await portal.close();
  }
}
