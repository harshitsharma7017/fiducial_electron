// A local copy of New India's Personal Accident quote forms (QuoteNonCustomer.html) and its
// dashboard, built from the recording new-india-2026-11-04T10-41-14-769Z. Policy Holder
// Information is open; the other sections are links that toggle, a count after their text. New
// India's PAN question shows a moment after the form unless ?pan=0 (No closes it). Choosing Yes to
// a claim in the previous three years shows New India's alert.
//   ?f=sk  Janata PA Sukshma Bima: Policy Details, Policy Period, Insured Details.
//   ?f=jt  Personal Janta: the same, without the insured's name and address, with the excess.
//   ?f=pp  Pension Protect: Policy Details, Policy Period, Pension Details, Nominee Details.
// Save & Calculate (Premium) sets window.__saved (never to be pressed).
const HEADINGS = {
  sk: 'Janata PA Sukshma Bima Policy Insurance',
  jt: 'Personal Janta Insurance Insurance',
  pp: 'New India Pension Protect Personal Accident Policy Insurance',
};
const sel = (id, options) =>
  `<select id="${id}"><option value="">Select</option>${options.map((o) => `<option value="string:${o}">${o}</option>`).join('')}</select>`;
const section = (title, count, id, body, open = false) =>
  `<div class="panel"><h4><a href="#" data-sec="${id}">${title}${count ? ` <span>${count}</span>` : ''}</a></h4><div class="body${open ? '' : ' hidden'}" id="${id}">${body}</div></div>`;
const holder = section(
  'Policy Holder Information',
  0,
  'holder',
  `<label><input type="radio" id="policyHolder1" name="policyHolder" value="newPolicyHolder" checked> New</label>
   ${sel('typeOfOrg', ['Mr.', 'Mrs.', 'Ms.'])}<input type="text" id="firstNameCreate"><input type="text" id="middleNameCreate"><input type="text" id="lastNameCreate">
   ${['M', 'F', 'T'].map((v, g) => `<label><input type="radio" id="gender${g}" name="g" value="${v}"> ${v}</label>`).join('')}
   <input type="text" id="dob"><textarea id="buildingNo"></textarea><input type="tel" id="mobileInd"><input type="text" id="emailInd">`,
  true,
);
const RELATIONS = [
  'Any other',
  'Brother',
  'Daughter',
  'Father',
  'Mother',
  'Self',
  'Sister',
  'Son',
  'Spouse',
];
const janata = (f) => `
  ${section('Policy Details', 1, 'details', sel('vPreviousClaim', ['Yes', 'No']))}
  ${section('Policy Period', 0, 'period', sel('term', ['1', '2', '3']))}
  ${section(
    'Insured Details',
    14,
    'insured',
    `${f === 'sk' ? '<input type="text" id="vNameInsured_1" maxlength="50"><input type="text" id="vAddressInsured_2" maxlength="100">' : ''}
     ${sel('vStatusInsured_1', ['Earning Member', 'Minor', 'Non Earning Member'])}
     ${sel('vOccupationGramin_1', ['Agriculturalist', 'Business', 'Driver', 'Housewife', 'Others', 'Professional', 'Retired', 'Service', 'Student'])}
     <input type="text" id="vDateBirth_1">${sel('vSexInsured_1', ['Female', 'Male', 'Third Gender'])}
     <input type="text" id="vDetailsExistingPhysicalDisabilities_2"><input type="text" id="vNomineesName_1" maxlength="20">
     <input type="text" id="vNomineesAddress_1" maxlength="50">${sel('vRelationshipNomineeInsured_2', RELATIONS)}
     <input type="text" id="vDetailsRelationship">${sel('vSumInsuredRupees_1', ['100000', '25000', '50000', '75000'])}
     ${f === 'jt' ? sel('vExcess_2', ['0', '1', '10', '15', '20', '25', '3', '30', '5']) : ''}`,
  )}
  <button type="button" class="calc">Save &amp; Calculate</button>`;
const pension = `
  ${section('Policy Details', 0, 'details', sel('PolicyType', ['new policy', 'old policy']) + sel('vPreviousClaim', ['Yes', 'No']))}
  ${section('Policy Period', 0, 'period', '<input type="text" id="policyDuration" disabled>')}
  ${section(
    'Pension Details',
    7,
    'pension',
    `<input type="text" id="insuredName" maxlength="30"><input type="text" id="dateOfBirth_Pol"><input type="text" id="lossOfMonthlyPension">
     <input type="text" id="sumInsuredForAccidentalDeath" disabled>${sel('physicalDefects', ['Yes', 'No'])}
     <input type="text" id="organisationBeforeRetirement" maxlength="30">${sel('previousClaim', ['Yes', 'No'])}`,
  )}
  ${section(
    'Nominee Details',
    3,
    'nominee',
    `<input type="text" id="nomineeName1" maxlength="30">${sel('relationWithNominee1', ['Spouse', 'Father', 'Mother', 'Father-in-law', 'Mother-in-law', 'Son', 'Daughter'])}<input type="text" id="nomineeDOB1">`,
  )}
  <button type="button" class="calc">Save &amp; Calculate Premium</button>`;

const form = (
  f,
  pan,
) => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.modal{border:1px solid #888;padding:8px;background:#fff}</style></head><body>
<h3>${HEADINGS[f]}</h3>
<form onsubmit="return false">${holder}${f === 'pp' ? pension : janata(f)}</form>
<div id="pan" class="modal hidden"><h4>Alert Message</h4><p>Do you have PAN Number?</p>
  <label><input type="radio" id="yes" name="partyType" value="Y"> Yes</label><label><input type="radio" id="no" name="partyType" value="N"> No</label></div>
<div id="claim" class="modal hidden"><h4>Alert</h4><p>Since There is a claim in the last 3 years, the policy cannot be issued through portal</p><button type="button">OK</button></div>
<script>
  const $ = (s) => document.querySelector(s);
  window.__saved = false; window.__toggles = 0;
  document.querySelectorAll('.calc').forEach((b) => b.addEventListener('click', () => { window.__saved = true; }));
  document.querySelectorAll('[data-sec]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); window.__toggles += 1; document.getElementById(a.dataset.sec).classList.toggle('hidden');
  }));
  if (${pan}) setTimeout(() => $('#pan').classList.remove('hidden'), 500);
  $('#no').addEventListener('change', () => $('#pan').classList.add('hidden'));
  $('#vPreviousClaim').addEventListener('change', (e) => { if (e.target.value === 'string:Yes') $('#claim').classList.remove('hidden'); });
  if ($('#lossOfMonthlyPension')) $('#lossOfMonthlyPension').addEventListener('change', () => {
    $('#sumInsuredForAccidentalDeath').value = String(Number($('#lossOfMonthlyPension').value) * 100);
  });
</script></body></html>`;

const TILES = {
  sk: 'Janata PA Sukshma Bima Policy',
  jt: 'Personal Janta Insurance',
  pp: 'New India Pension Protect Personal Accident Policy',
};
const dashboard =
  () => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.tile{display:inline-block;margin:4px;padding:8px;border:1px solid #ccc;cursor:pointer}.caps .tile span{text-transform:uppercase}</style></head><body>
<h3>Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .</h3>
<div id="products" class="caps"><h3>PRODUCT SELECTION</h3>${['Motor', 'Personal Accident', 'Rural'].map((p) => `<div class="tile" data-p="${p}"><span>${p}</span></div>`).join('')}</div>
<div id="pa" class="hidden"><h3>PERSONAL ACCIDENT PRODUCTS</h3>${Object.entries(TILES)
    .map(([k, t]) => `<div class="tile" data-t="${k}"><p>${t}</p></div>`)
    .join('')}</div>
<script>
  const $ = (s) => document.querySelector(s);
  $('[data-p="Personal Accident"]').addEventListener('click', () => { $('#products').classList.add('hidden'); $('#pa').classList.remove('hidden'); });
  document.querySelectorAll('[data-t]').forEach((t) => t.addEventListener('click', () => {
    setTimeout(() => { location.href = '/NIABancsPortal/QuoteNonCustomer.html?pan=0&f=' + t.dataset.t; }, 300);
  }));
</script></body></html>`;

module.exports = {
  '/NIABancsPortal/QuoteNonCustomer.html': (query) =>
    form(query.get('f') ?? 'jt', query.get('pan') === '0' ? 'false' : 'true'),
  '/NIABancsPortal/NonCustomerDashboard.html': () => dashboard(),
};
