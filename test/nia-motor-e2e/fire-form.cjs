// A local copy of New India's nine fire quote forms (QuoteNonCustomer.html?f=<form>) and its
// dashboard, drawn from fire-fields.json: each form's enabled fields as the recording
// new-india-2026-11-04T10-59-31-695Z showed them (ids, kinds, the lists' options; no values).
// The fields are spread over three sections, all closed at first (links that toggle, a count after
// their text), after an open Policy Holder Information; selects take AngularJS "string:" values.
// New India's PAN question shows a moment after the form unless ?pan=0. Save & Calculate Premium
// sets window.__saved (never to be pressed).
const FORMS = require('./fire-fields.json');

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const field = (id, f) => {
  if (f.kind === 'select')
    return `<select id="${id}"><option value="">Select</option>${f.options.map((o) => `<option value="string:${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
  if (f.kind === 'radio')
    return `<label><input type="radio" id="${id}" name="${esc(f.name)}" value="${esc(f.value)}"> ${esc(f.value)}</label>`;
  if (f.kind === 'textarea') return `<textarea id="${id}"></textarea>`;
  if (f.kind === 'checkbox') return `<input type="checkbox" id="${id}">`;
  return `<input type="text" id="${id}">`;
};
const section = (title, count, id, body, open = false) =>
  `<div class="panel"><div class="panel-heading"><h4><a href="#" data-sec="${id}">${title} <span>${count}</span></a></h4></div><div class="body${open ? '' : ' hidden'}" id="${id}">${body}</div></div>`;

const form = (key, pan) => {
  const f = FORMS[key];
  const ids = Object.keys(f.fields);
  const third = Math.ceil(ids.length / 3);
  const part = (n) =>
    ids
      .slice(n * third, (n + 1) * third)
      .map((id) => `<div>${field(id, f.fields[id])}</div>`)
      .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.modal{border:1px solid #888;padding:8px;background:#fff}</style></head><body>
<h3>${esc(f.heading)}</h3>
<form onsubmit="return false">
${section(
  'Policy Holder Information',
  11,
  'holder',
  `<label><input type="radio" id="policyHolder1" name="policyHolder" value="newPolicyHolder" checked> New</label>
   <label><input type="radio" id="individual" name="partyType" value="I" checked> Individual</label>
   <label><input type="radio" id="Organization" name="partyType" value="O"> Organization</label>
   <div id="ind"><select id="typeOfOrg"><option value="">Select</option><option value="string:Mr.">Mr.</option><option value="string:Mrs.">Mrs.</option><option value="string:Ms.">Ms.</option></select>
     <input type="text" id="firstNameCreate"><input type="text" id="middleNameCreate"><input type="text" id="lastNameCreate">
     ${['M', 'F', 'T'].map((v, g) => `<label><input type="radio" id="gender${g}" name="g" value="${v}"> ${v}</label>`).join('')}
     <input type="text" id="dob"><textarea id="buildingNo"></textarea><input type="tel" id="mobileInd"><input type="text" id="emailInd"></div>
   <div id="org" class="hidden"><input type="text" id="businessNameNewOrg"><input type="text" id="registrationNo">
     <select id="isMSME"><option value=""></option><option value="string:Yes">Yes</option><option value="string:No">No</option></select>
     <input type="text" id="regDate"><textarea id="businessAddress1"></textarea><input type="tel" id="mobileBus"><input type="text" id="emailBus"></div>`,
  true,
)}
${section('Policy Details', 3, 's1', part(0))}
${section('Building Details', 14, 's2', part(1))}
${section('Additional Building Details', 9, 's3', part(2))}
<button type="button" id="save">Save &amp; Calculate Premium</button>
</form>
<div id="pan" class="modal hidden"><h4>Alert Message</h4><p>Do you have PAN Number?</p>
  <label><input type="radio" id="yes" name="partyType2" value="Y"> Yes</label><label><input type="radio" id="no" name="partyType2" value="N"> No</label></div>
<script>
  const $ = (s) => document.querySelector(s);
  window.__saved = false; window.__toggles = 0;
  $('#save').addEventListener('click', () => { window.__saved = true; });
  document.querySelectorAll('[data-sec]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); window.__toggles += 1; document.getElementById(a.dataset.sec).classList.toggle('hidden');
  }));
  const party = () => { const org = $('#Organization').checked; $('#org').classList.toggle('hidden', !org); $('#ind').classList.toggle('hidden', org); };
  $('#Organization').addEventListener('change', party); $('#individual').addEventListener('change', party);
  if (${pan}) setTimeout(() => $('#pan').classList.remove('hidden'), 500);
  $('#no').addEventListener('change', () => $('#pan').classList.add('hidden'));
</script></body></html>`;
};

const dashboard =
  () => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.tile{display:inline-block;margin:4px;padding:8px;border:1px solid #ccc;cursor:pointer}.caps .tile span{text-transform:uppercase}</style></head><body>
<h3>Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .</h3>
<div id="products" class="caps"><h3>PRODUCT SELECTION</h3>${['Motor', 'Fire', 'Rural'].map((p) => `<div class="tile" data-p="${p}"><span>${p}</span></div>`).join('')}</div>
<div id="fire" class="hidden"><h3>FIRE PRODUCTS</h3>${Object.entries(FORMS)
    .map(
      ([k, f]) =>
        `<div class="tile" data-f="${k}"><p>${esc(f.heading.replace(/\s*Insurance$/, ''))}</p></div>`,
    )
    .join('')}</div>
<script>
  const $ = (s) => document.querySelector(s);
  $('[data-p="Fire"]').addEventListener('click', () => { $('#products').classList.add('hidden'); $('#fire').classList.remove('hidden'); });
  document.querySelectorAll('[data-f]').forEach((t) => t.addEventListener('click', () => {
    setTimeout(() => { location.href = '/NIABancsPortal/QuoteNonCustomer.html?pan=0&f=' + t.dataset.f; }, 300);
  }));
</script></body></html>`;

module.exports = {
  '/NIABancsPortal/QuoteNonCustomer.html': (query) =>
    form(query.get('f') ?? 'griha', query.get('pan') === '0' ? 'false' : 'true'),
  '/NIABancsPortal/NonCustomerDashboard.html': () => dashboard(),
};
