// A local copy of ICICI Lombard's NYSA motor quote, as recorded on 20 November 2026
// (icici-lombard-2026-11-20T07-23-41-540Z): the dashboard's Motor tile, Vehicle Details (policy
// type, ownership change on the car flow, Registration Number, Fetch Vehicle Data), the
// SweetAlert "belongs to Two Wheeler. Switching to the Two Wheeler buying flow" with OK, and the
// premium page (Total Premium after a moment, the IDV box and Update within lib-idv-slider, Buy
// Now). What was chosen is kept in sessionStorage (window.__state) for the harness to check.
// Synthetic data only.

const SHELL = (
  body,
  script,
) => `<!doctype html><html><head><meta charset="utf-8"><title>Nysa - ICICI Lombard</title>
<style>.hidden{display:none} .swal2-popup{position:fixed;top:30%;left:30%;padding:20px;background:#fff;border:1px solid #999}</style>
</head><body>
<header class="app-header">Wallet Balance ₹ 0</header>
<main>
<app-menu-tabs><div><div>
<button data-go="/NysaMotor/quote">Quote</button><button data-go="/NysaMotor/dashboard/nysa-policies">Nysa Policies</button><button data-go="/NysaMotor/dashboard/my-quote">My Quote</button>
</div></div></app-menu-tabs>
${body}
</main>
<script>
const state = () => JSON.parse(sessionStorage.getItem('fqf') || '{}');
const save = (patch) => sessionStorage.setItem('fqf', JSON.stringify({ ...state(), ...patch }));
window.__state = state;
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.href = b.dataset.go; }));
const inr = (n) => n.toLocaleString('en-IN');
const dialog = (message, onOk) => {
  const box = document.createElement('div');
  box.className = 'swal2-popup';
  box.setAttribute('role', 'dialog');
  box.innerHTML = '<div class="swal2-html-container"></div><div class="swal2-actions"><button type="button" class="swal2-confirm">OK</button></div>';
  box.querySelector('.swal2-html-container').textContent = message;
  box.querySelector('.swal2-confirm').addEventListener('click', () => { box.remove(); onOk && onOk(); });
  document.body.appendChild(box);
};
${script}
</script></body></html>`;

const DASHBOARD = () =>
  `<!doctype html><html><head><meta charset="utf-8"><title>NYSA - ICICI Lombard</title></head><body>
<h1>ICICI Lombard</h1>
<div class="card" id="motor-card"><h3>Motor</h3><p>Cover all accidental damage with motor insurance</p></div>
<div class="card"><h3>Health</h3><p>Ensure family's health with health insurance</p></div>
<script>
document.getElementById('motor-card').addEventListener('click', () => {
  sessionStorage.removeItem('fqf');
  // The server hands out the address (ProductRedirect), then the swap page forwards to the form.
  setTimeout(() => { location.href = '/NysaMotor/quote'; }, 400);
});
</script></body></html>`;

const QUOTE = () =>
  SHELL(
    `<div id="form-area" class="hidden">
<h2 id="flow-heading">directions_carVehicle Details</h2>
<div><div><div>
<label><input type="radio" name="policyType" value="New Business">New</label>
<label><input type="radio" name="policyType" value="Rollover">Rollover</label>
<label id="used"><input type="radio" name="policyType" value="Used">Used</label>
</div></div></div>
<div id="owner" class="hidden"><div><div>
<label><input type="radio" name="ownershipChange" value="yes">Yes</label>
<label><input type="radio" name="ownershipChange" value="no">No</label>
</div></div></div>
<lib-registration><form id="reg-form"><div><div>
<label>Registration Number *</label>
<input type="text" formcontrolname="vehicleRegistrationNo" placeholder="Enter registration number" maxlength="13">
<div id="reg-error" class="hidden">Invalid format. Valid formats: BH01AB1234, DL1AM1111, AL01AB0000</div>
</div><div><button type="submit">Fetch Vehicle Data</button></div></div></form></lib-registration>
</div>`,
    `
const flow = new URLSearchParams(location.search).get('flow') || 'car';
// Angular draws the form after its lists load.
setTimeout(() => document.getElementById('form-area').classList.remove('hidden'), 600);
if (flow === 'tw') {
  document.getElementById('flow-heading').textContent = 'two_wheelerVehicle Details';
  document.getElementById('used').remove();
}
document.querySelectorAll('input[name="policyType"]').forEach((r) => r.addEventListener('change', () => {
  save({ policyType: r.value });
  document.getElementById('owner').classList.toggle('hidden', !(flow === 'car' && r.value === 'Rollover'));
}));
document.querySelectorAll('input[name="ownershipChange"]').forEach((r) => r.addEventListener('change', () => save({ ownership: r.value })));
const box = document.querySelector('[formcontrolname="vehicleRegistrationNo"]');
if (flow === 'tw') box.value = state().registration || '';
document.getElementById('reg-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const reg = box.value.trim();
  const valid = /^([A-Z]{2}\\d{1,2}[A-Z]{0,3}\\d{1,4}|\\d{2}BH\\d{4}[A-Z]{1,2})$/.test(reg);
  document.getElementById('reg-error').classList.toggle('hidden', valid);
  if (!valid) return;
  save({ registration: reg, fetched: (state().fetched || 0) + 1 });
  setTimeout(() => {
    // Vahan, as ICICI reads it: DL numbers are two-wheelers here; ZZ numbers are not found.
    if (reg.startsWith('ZZ')) return dialog('Vehicle details not found. Please enter the vehicle details manually.');
    if (reg.startsWith('DL') && flow !== 'tw') {
      box.disabled = true;
      return dialog('Entered vehicle registration belongs to Two Wheeler. Switching to the Two Wheeler buying flow', () => {
        save({ flow: 'tw', switched: true });
        setTimeout(() => { location.href = '/NysaMotor/premium?flow=tw'; }, 500);
      });
    }
    save({ flow });
    location.href = '/NysaMotor/premium?flow=' + flow;
  }, 700);
});
`,
  );

const PREMIUM = () =>
  SHELL(
    `<h2>Customise plan &amp; share</h2>
<lib-idv-slider><div><div>IDV</div></div><div>
<div><div>₹</div><div><input type="text" id="idv-box"></div></div>
<div><div>₹ 9,601</div><div><input type="range" min="9601" max="27750" id="idv-range"></div><div>₹ 27,750</div><div><button>Update</button></div></div>
</div></lib-idv-slider>
<button id="share">share Share Quote</button>
<div id="plan" class="hidden"><h3>Basic Plan</h3>
<lib-mq-premium><div><div><span id="total"></span> View Premium Breakup &gt; <button id="buy">Buy Now</button></div></div></lib-mq-premium>
</div>`,
    `
const MIN = 9601, MAX = 27750;
const premium = (idv) => Math.round(400 + idv * 0.115);
const box = document.getElementById('idv-box');
const show = (idv) => {
  document.getElementById('plan').classList.add('hidden');
  setTimeout(() => {
    box.value = inr(idv);
    document.getElementById('idv-range').value = String(idv);
    document.getElementById('total').textContent = 'Total Premium ₹' + inr(premium(idv));
    document.getElementById('plan').classList.remove('hidden');
    save({ idv, premium: premium(idv) });
  }, 1500);
};
show(18568);
document.querySelector('lib-idv-slider button').addEventListener('click', () => {
  const want = Number(box.value.replace(/[^\\d]/g, ''));
  show(Math.min(MAX, Math.max(MIN, want)));
});
document.getElementById('buy').addEventListener('click', () => save({ bought: true }));
document.getElementById('share').addEventListener('click', () => save({ shared: true }));
`,
  );

// NYSA's health site's dashboard: Elevate and travel, no Motor tile.
const HEALTH_DASHBOARD = () =>
  `<!doctype html><html><head><meta charset="utf-8"><title>NYSA Health</title></head><body>
<h1>Health</h1><div class="card"><h3>Elevate</h3></div><div class="card"><h3>International Travel</h3></div>
</body></html>`;

const MY_QUOTE = () => SHELL('<h2>My Quote</h2><p>No saved quotes.</p>', '');

module.exports = {
  '/': DASHBOARD,
  '/NysaMotor/quote': QUOTE,
  '/NysaMotor/premium': PREMIUM,
  '/NysaMotor/dashboard/my-quote': MY_QUOTE,
  '/health/dashboard': HEALTH_DASHBOARD,
};
