// A local copy of New India's health quote forms (QuoteNonCustomer.html), built from the
// recording new-india-2026-11-04T09-24-53-914Z: the policy's heading, the sections Policy Period,
// Basic Information and Member Information (links that toggle their section open and closed, with
// a count after their text), and per member one "Add …" button that adds one numbered row. Five
// policies, between them every way of filling the app uses:
//   ?p=as  Arogya Sanjeevani: pincode Search and its postal codes pop-up, INDIVIDUAL / FLOATER
//          tiles (FLOATER shows the floater sum insured), diabetes and hypertension radios per
//          member, a dependent type per child, parents and parents-in-law.
//   ?p=ja  Jan Arogya Bima: Add Daughter and Add Son share one numbering (#daughterDob0, 1).
//   ?p=pm  Premier Mediclaim (opened after the dashboard's health question).
//   ?p=cg  Cancer Guard: gender radios per member.
//   ?p=mc  New India Mediclaim: a sum insured per member, policy period radios.
// Dates of birth are typed as dd/mm/yyyy; the page fills the age box when the date is left. Save &
// Calculate Premium sets window.__saved (it must never be pressed).
const HEADINGS = {
  as: 'Arogya Sanjeevani Policy (Cashless facility available) Insurance',
  ja: 'Jan Arogya Bima Policy (Cashless facility available) Insurance',
  pm: 'New India Premier Mediclaim Policy (Cashless facility available) Insurance',
  cg: 'New India Cancer Guard Policy (Cashless facility available) Insurance',
  mc: 'New India Mediclaim Policy (Cashless facility available) Insurance',
};
const BUTTONS = {
  as: ['Add Proposer', 'Add Spouse', 'Add Children', 'Add Parent', 'Add Parent-In-Law'],
  ja: ['Add Proposer', 'Add Spouse', 'Add Daughter', 'Add Son'],
  pm: ['Add Proposer', 'Add Spouse', 'Add Child'],
  cg: ['Add Proposer', 'Add Spouse', 'Add Parent', 'Add Children', 'Add Ward'],
  mc: ['Add Proposer', 'Add Spouse', 'Add Child', 'Add Parent', 'Add Guardian'],
};

const form = (
  p,
) => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.modal{border:1px solid #888;padding:8px;background:#fff}.tile{display:inline-block;border:1px solid #ccc;padding:6px;cursor:pointer}</style></head><body>
<h3>${HEADINGS[p]}</h3>
<form id="healthPCDQForm" onsubmit="return false">
  <div class="panel"><h4><a href="#" data-sec="period">Policy Period</a></h4><div class="body hidden" id="period">
    <label><input type="radio" id="policyPeriod1" name="PolicyPeriod" value="1" checked> 1 Year</label>
    <label><input type="radio" id="policyPeriod2" name="PolicyPeriod" value="2"> 2 Years</label>
    <label><input type="radio" id="policyPeriod3" name="PolicyPeriod" value="3"> 3 Years</label>
  </div></div>
  <div class="panel"><h4><a href="#" data-sec="basic">Basic Information <span class="badge">3</span></a></h4><div class="body hidden" id="basic">
    ${
      p === 'as'
        ? `<input type="text" id="pincodeAdd" name="pincodeAdd" placeholder="PIN Code"><span><button type="button" id="search">Search</button></span>
    <div class="tile" ng-click="cover('INDV')"><h4>INDIVIDUAL</h4></div><div class="tile" ng-click="cover('FLOAT')" id="floaterTile"><h4>FLOATER</h4></div>
    <select id="propSumInsuredFloater" class="hidden"><option value="">Select Sum Insured</option>${[100000, 150000, 200000, 500000].map((r) => `<option value="string:${r}">${r}</option>`).join('')}</select>`
        : ''
    }
  </div></div>
  <div class="panel"><h4><a href="#" data-sec="members">Member Information <span class="badge">1</span></a></h4><div class="body hidden" id="members">
    <div id="buttons">${BUTTONS[p].map((b) => `<button type="button" class="add">${b}</button>`).join(' ')}</div>
    <div id="rows"></div>
  </div></div>
  <span><button type="button" id="save">Save &amp; Calculate Premium</button></span>
  <span><button type="button" id="continue">Continue</button></span>
</form>
<div id="pins" class="modal hidden"><h4>Please select one of the following postal codes which is applicable to your address.</h4>
  <table><tbody><tr><td><a href="#" data-area="First Area">560001</a></td><td>First Area</td></tr><tr><td><a href="#" data-area="Second Area">560001</a></td><td>Second Area</td></tr></tbody></table>
  <button type="button" class="close">× Close</button></div>
<script>
  const P = '${p}';
  const $ = (s) => document.querySelector(s);
  window.__saved = false; window.__continued = false; window.__toggles = 0;
  $('#save').addEventListener('click', () => { window.__saved = true; });
  $('#continue').addEventListener('click', () => { window.__continued = true; });
  document.querySelectorAll('[data-sec]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); window.__toggles += 1;
    document.getElementById(a.dataset.sec).classList.toggle('hidden');
  }));
  if (P === 'as') {
    $('#search').addEventListener('click', () => { if ($('#pincodeAdd').value.length === 6) $('#pins').classList.remove('hidden'); });
    $('#pins').addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (!a) return; e.preventDefault();
      $('#pincodeAdd').dataset.area = a.dataset.area; $('#pins').classList.add('hidden');
    });
    $('#floaterTile').addEventListener('click', () => { window.__cover = 'FLOAT'; $('#propSumInsuredFloater').classList.remove('hidden'); });
  }
  const yesNo = (name, id, yes, no) =>
    '<label><input type="radio" id="' + id + '0" name="' + name + '" value="' + yes + '"> Yes</label><label><input type="radio" id="' + id + '1" name="' + name + '" value="' + no + '"> No</label>';
  const genders = (id) => ['M', 'F', 'T'].map((v, g) => '<label><input type="radio" id="' + id(g) + '" name="' + id(0) + 'g" value="' + v + '"> ' + v + '</label>').join('');
  const sum = (id) => '<select id="' + id + '"><option value="">Select Sum Insured</option>' + [100000, 200000, 300000, 500000].map((r) => '<option value="string:' + r + '">' + r + '</option>').join('') + '</select>';
  const dep = (id) => '<select id="' + id + '"><option value="">Select Dependent type</option><option value="string:MC">Mentally Challenged</option><option value="string:NORM">Normal</option><option value="string:NA">Not Applicable</option><option value="string:UD">Unmarried Daughter</option></select>';
  let children = 0, parents = 0, inLaws = 0;
  const row = (html) => { const d = document.createElement('div'); d.className = 'member'; d.innerHTML = html; $('#rows').appendChild(d); wireDates(d); };
  const dob = (id, age) => '<input type="text" id="' + id + '" name="' + id + '"> Age <input type="text" id="' + age + '" disabled>';
  function addProposer() {
    row(dob('proposerDob', 'propAge') +
      (P === 'as' ? yesNo('propSufferingDiabetes', 'propSufferingDiabetes', 'Y', 'N') + yesNo('propSufferingHypertension', 'propSufferingHypertension', 'Y', 'N') : '') +
      (P === 'cg' ? genders((g) => 'gender' + g) : '') + (P === 'mc' ? sum('propSumInsured') : ''));
  }
  addProposer();
  document.querySelectorAll('.add').forEach((b) => b.addEventListener('click', () => {
    const t = b.textContent;
    if (t === 'Add Proposer') { if (!$('#proposerDob')) addProposer(); return; }
    if (t === 'Add Spouse') {
      if ($('#spouseDob')) return;
      row(dob('spouseDob', 'spouseAge') +
        (P === 'as' ? yesNo('spouseSufferingDiabetes', 'spouseSufferingDiabetes', 'Y', 'N') + yesNo('spouseSufferingHypertension', 'spouseSufferingHypertension', 'Y', 'N') : '') +
        (P === 'cg' ? genders((g) => 'spouseGender' + g) : '') + (P === 'mc' ? sum('spouseSumInsured') : ''));
      return;
    }
    if (['Add Children', 'Add Child', 'Add Daughter', 'Add Son'].includes(t)) {
      const i = children++;
      const id = P === 'as' || P === 'mc' ? 'childDob' + i : 'daughterDob' + i;
      row(dob(id, 'childAge' + i) + (P === 'as' ? dep('childDepType' + i) + yesNo('childSufferingDiabetes' + i, 'childSufferingDiabetes' + i, 'Y', 'N') + yesNo('childSufferingHyperTension' + i, 'childSufferingHyperTension' + i, 'Y', 'N') : '') +
        (P === 'cg' ? genders((g) => 'childGender' + g + i) : '') + (P === 'mc' ? sum('childSumInsured' + i) : '') +
        (P === 'ja' ? '<span class="kind">' + (t === 'Add Son' ? 'son' : 'daughter') + '</span>' : ''));
      return;
    }
    if (t === 'Add Parent') {
      const i = parents++;
      row(dob('parentDob' + i, 'parentAge' + i) + (P === 'as' ? yesNo('parentSufferingDiabetes' + i, 'parentSufferingDiabetes' + i, 'Y', 'N') + yesNo('parentSufferingHyperTension' + i, 'parentSufferingHyperTension' + i, 'Y', 'N') : '') +
        (P === 'cg' ? genders((g) => 'parentgender' + g + i) : '') + (P === 'mc' ? sum('parentSumInsured' + i) : ''));
      return;
    }
    if (t === 'Add Parent-In-Law') {
      const i = inLaws++;
      row(dob('parentInLawDob' + i, 'parentInLawAge' + i) + yesNo('parentInLawSufferingDiabetes' + i, 'parentInLawSufferingDiabetes' + i, 'Y', 'N') + yesNo('parentInLawSufferingHyperTension' + i, 'parentInLawSufferingHyperTension' + i, 'Y', 'N'));
      return;
    }
    if (t === 'Add Guardian') $('#guardian').classList.remove('hidden');
  }));
  // The age, worked out when the date box is left (as New India does from the date of birth).
  function wireDates(root) {
    root.querySelectorAll('input[type="text"]:not([disabled])').forEach((box) => box.addEventListener('blur', () => {
      const m = /^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec(box.value);
      const age = box.parentElement.querySelector('input[disabled]');
      if (m && age) age.value = String(2026 - Number(m[3]));
    }));
  }
</script>
<div id="guardian" class="modal hidden"><h4>Alert</h4><p>Guardian can be added only with a ward.</p><button type="button">OK</button></div>
</body></html>`;

// The dashboard: Product Selection tiles, HEALTH swaps them for the Health Products tiles. The
// tiles read as the policy's heading without "Insurance" (Jan Arogya Bima's tile without the
// cashless note, to check the shorter name is tried too). Premier Mediclaim first asks New India's
// health question: No and Continue open the form; Yes shows the refusal.
const TILES = {
  as: 'Arogya Sanjeevani Policy (Cashless facility available)',
  ja: 'Jan Arogya Bima Policy',
  pm: 'New India Premier Mediclaim Policy (Cashless facility available)',
  cg: 'New India Cancer Guard Policy (Cashless facility available)',
  mc: 'New India Mediclaim Policy (Cashless facility available)',
};
const dashboard =
  () => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.tile{display:inline-block;margin:4px;padding:8px;border:1px solid #ccc;cursor:pointer}.caps .tile span{text-transform:uppercase}.modal{border:1px solid #888;padding:8px;background:#fff}</style></head><body>
<h3>Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .</h3>
<div id="products" class="caps"><h3>PRODUCT SELECTION</h3>${['Motor', 'Health', 'Travel'].map((p) => `<div class="tile" ng-click="selectLob('${p}')" data-p="${p}"><img alt=""><span>${p}</span></div>`).join('')}</div>
<div id="health" class="hidden"><h3>HEALTH PRODUCTS</h3>${Object.entries(TILES)
    .map(
      ([k, t]) =>
        `<div class="tile" ng-click="selectProduct('${k}')" data-h="${k}"><p>${t}</p></div>`,
    )
    .join('')}</div>
<div id="ask" class="modal hidden"><p>Has any person to be insured been suffering / diagnosed / under any treatment for any Hypertension / diabetes / critical illness / Adverse Medical History / chronic illness / recurring illness/ Psychiatric and Psychosomatic Disorder?</p>
  <label><input type="radio" id="healthConfirm1" name="healthConfirm" value="Y"> Yes</label><label><input type="radio" id="healthConfirm2" name="healthConfirm" value="N"> No</label>
  <div><button type="button" id="askContinue">Continue</button></div></div>
<script>
  const $ = (s) => document.querySelector(s);
  const open = (k) => setTimeout(() => { location.href = '/NIABancsPortal/QuoteNonCustomer.html?p=' + k; }, 300);
  $('[data-p="Health"]').addEventListener('click', () => { $('#products').classList.add('hidden'); $('#health').classList.remove('hidden'); });
  document.querySelectorAll('[data-h]').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.h === 'pm') { $('#ask').classList.remove('hidden'); return; }
    open(t.dataset.h);
  }));
  $('#askContinue').addEventListener('click', () => {
    if (!$('#healthConfirm2').checked) return;
    $('#ask').classList.add('hidden'); open('pm');
  });
</script></body></html>`;

module.exports = {
  '/NIABancsPortal/QuoteNonCustomer.html': (query) => form(query.get('p') ?? 'as'),
  '/NIABancsPortal/NonCustomerDashboard.html': () => dashboard(),
};
