// Serves the local copy of ICICI Lombard's NYSA health site (nysa-page.html) at its paths, and
// NYSA's dashboard with its Health tile, which the harness serves from another origin (localhost),
// as nysa.icicilombard.com and nysa-health.icicilombard.com are. The tile sends the tab to the
// health site's /swap page, as ICICI's server does.
const fs = require('node:fs');
const path = require('node:path');

const PAGE = fs.readFileSync(path.join(__dirname, 'nysa-page.html'), 'utf8');
const DASHBOARD = `<!doctype html><html><head><meta charset="utf-8" /><title>NYSA</title></head><body>
<h1>ICICI Lombard</h1>
<div id="insurance_section">
  <div><div><span class="motor">Motor</span></div></div>
  <div><div><span class="health">Health</span></div></div>
</div>
<script>
  document.querySelector('span.health').addEventListener('click', () => {
    const health = location.origin.replace('localhost', '127.0.0.1');
    // ?stay=1: the health site stays on its dashboard (not on to Elevate by itself).
    const query = new URLSearchParams(location.search);
    const stay = query.get('stay') === '1' ? '&stay=1' : '';
    // ?plus=inside: Elevate's counters add by a "+" icon inside the button (passed along).
    if (query.get('plus') === 'inside') sessionStorage.setItem('plusInside', '1');
    const plus =
      (query.get('plus') === 'inside' ? '&plus=inside' : '') +
      (query.get('spouse') === 'wife' ? '&spouse=wife' : '');
    setTimeout(
      () => (location.href = health + '/swap?otr=synthetic&isBancaUser=false' + stay + plus),
      300,
    );
  });
</script></body></html>`;
const page = () => PAGE;
module.exports = {
  '/': () => DASHBOARD,
  '/swap': page,
  '/health/dashboard': page,
  '/health/elevate': page,
  '/travel/international-travel': page,
  '/travel/student-medical-travel': page,
};
