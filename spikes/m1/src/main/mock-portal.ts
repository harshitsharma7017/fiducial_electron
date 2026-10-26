// Local mock "insurer portal" for S2. Two HTTP listeners on 127.0.0.1 give two origins:
// the allowlisted portal and an "other" origin that navigation must never reach.
// Fictional content only; no real insurer is contacted.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  server: 'portal' | 'other';
  path: string;
  view: string | null;
  /** Kept in memory for checks only; never written to evidence. */
  cookieHeader: string;
}

export interface MockPortal {
  portalOrigin: string;
  otherOrigin: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

const PORTAL_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Mock insurer portal (local test page)</title></head>
<body>
<h1>MOCK INSURER PORTAL</h1>
<p>Local test page for the FQF M1 spike. Not a real insurer. Fictional data only.</p>
<form id="quote-form">
  <label>Age <input id="age" name="age" type="number"></label>
  <label>Relationship
    <select id="relationship"><option value="self">Self</option><option value="spouse">Spouse</option></select>
  </label>
  <button id="get-quote" type="button">Get mock quote</button>
</form>
<output id="result"></output>
<script>
document.getElementById('get-quote').addEventListener('click', function () {
  var age = Number(document.getElementById('age').value);
  var rel = document.getElementById('relationship').value;
  document.getElementById('result').textContent =
    age > 0 ? 'MOCK premium for ' + rel + ' aged ' + age + ': INR ' + (5000 + age * 100) : 'invalid';
});
</script>
</body>
</html>`;

const OTHER_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Other origin</title></head>
<body><p>OTHER ORIGIN: navigation here must be blocked.</p></body></html>`;

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function send(
  res: ServerResponse,
  status: number,
  headers: Record<string, string>,
  body = '',
): void {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

export async function startMockPortal(): Promise<MockPortal> {
  const requests: RecordedRequest[] = [];
  let otherOrigin = '';

  const record = (server: RecordedRequest['server'], req: IncomingMessage): URL => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    requests.push({
      server,
      path: url.pathname,
      view: url.searchParams.get('view'),
      cookieHeader: req.headers.cookie ?? '',
    });
    return url;
  };

  const portal = createServer((req, res) => {
    const url = record('portal', req);
    const view = url.searchParams.get('view') ?? 'unknown';
    switch (url.pathname) {
      case '/portal':
        return send(res, 200, { 'content-type': 'text/html; charset=utf-8' }, PORTAL_PAGE);
      case '/login': {
        // Persistent (Max-Age) so Chromium writes it to the partition's cookie store on disk.
        const tag = url.searchParams.get('tag') ?? 'none';
        return send(res, 302, {
          'set-cookie': `fqf_mock_http=${view}-${tag}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600`,
          location: `/portal?view=${encodeURIComponent(view)}`,
        });
      }
      case '/redirect-out':
        return send(res, 302, { location: `${otherOrigin}/landing` });
      default:
        return send(res, 404, { 'content-type': 'text/plain' }, 'not found');
    }
  });
  const other = createServer((req, res) => {
    record('other', req);
    send(res, 200, { 'content-type': 'text/html; charset=utf-8' }, OTHER_PAGE);
  });

  const portalOrigin = await listen(portal);
  otherOrigin = await listen(other);

  return {
    portalOrigin,
    otherOrigin,
    requests,
    close: () =>
      Promise.all(
        [portal, other].map(
          (s) =>
            new Promise<void>((resolve) => {
              s.closeAllConnections();
              s.close(() => resolve());
            }),
        ),
      ).then(() => undefined),
  };
}
