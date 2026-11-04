// A local copy of New India's Marine Specific Voyage quote form (QuoteNonCustomer.html) and its
// dashboard, built from the recording new-india-2026-11-04T10-22-36-040Z: Policy Holder
// Information (open; New or Existing Customer, Individual or Organization, each with its own
// fields), and the closed sections Transit Details, Vessel Details and Cargo Details (links that
// toggle, a count after their text). From and To Country suggest as you type (a list the box names
// with aria-owns); the cargo type fills the packaging list. Save & Calculate Premium sets
// window.__saved (never to be pressed).
const sel = (id, options, extra = '') =>
  `<select id="${id}" name="${id}" ${extra}><option value="">Select</option>${options.map((o) => `<option value="string:${o}">${o}</option>`).join('')}</select>`;
const section = (title, count, id, body, open = false) =>
  `<div class="panel"><h4><a href="#" data-sec="${id}">${title}${count ? ` <span>${count}</span>` : ''}</a></h4><div class="body${open ? '' : ' hidden'}" id="${id}">${body}</div></div>`;
const CARGO = [
  'Machinery - Precision euipments, medical equipments',
  'Grains in Break Bulk (Bagged Grains - Wheat Rice, Maize, etc)',
  'Steel - Sheets/Coils/Pipes/Wire Rods',
  'Textiles - Fabrics/Yarns, Carpets, ready made garments',
];

const form =
  () => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.dropdown-menu{border:1px solid #999;list-style:none;padding:2px;margin:0}</style></head><body>
<h3>Specific Voyage Insurance</h3>
<form onsubmit="return false">
${section(
  'Policy Holder Information',
  0,
  'holder',
  `<label><input type="radio" id="policyHolder1" name="policyHolder" value="newPolicyHolder" checked> New Customer</label>
   <label><input type="radio" id="policyHolder2" name="policyHolder" value="existingPolicyHolder"> Existing Customer</label>
   <label><input type="radio" id="individual" name="partyType" value="I" checked> Individual</label>
   <label><input type="radio" id="Organization" name="partyType" value="O"> Organization</label>
   <div id="ind">${sel('typeOfOrg', ['Dr.', 'Mr.', 'Mrs.', 'Ms.'])}<input type="text" id="firstNameCreate"><input type="text" id="middleNameCreate"><input type="text" id="lastNameCreate">
     ${['M', 'F', 'T'].map((v, g) => `<label><input type="radio" id="gender${g}" name="g" value="${v}"> ${v}</label>`).join('')}
     <input type="text" id="dob"><textarea id="buildingNo"></textarea><input type="tel" id="mobileInd"><input type="text" id="emailInd"><input type="text" name="panNumber" id="panNumber" disabled></div>
   <div id="org" class="hidden"><input type="text" id="businessNameNewOrg"><input type="text" id="registrationNo">
     <select id="isMSME"><option value=""></option><option value="string:Yes">Yes</option><option value="string:No">No</option></select>
     <input type="text" id="regDate">${sel('typeOfOrg', ['Firm', 'Private Limited Company', 'Public Limited Company'])}
     <textarea id="businessAddress1"></textarea><input type="tel" id="mobileBus"><input type="text" id="emailBus"><input type="text" name="panNumber" id="panNumber"></div>`,
  true,
)}
${section(
  'Transit Details',
  7,
  'transit',
  `<select id="typeOfSV"><option value="string:Export">Export</option><option value="string:Import">Import</option><option value="string:Inland">Inland</option></select>
   <input type="text" id="fromDate">
   ${sel('TransitType', ['Air Domestic', 'Rail', 'Road', 'Courier', 'Inland Water'])}${sel('ModeOfTransport', ['Air', 'Rail', 'Road', 'Vessel'])}
   <span><input type="text" id="fromCountry" aria-owns="ta-from"></span><span><input type="text" id="ToCountry" aria-owns="ta-to"></span>
   <input type="text" id="FromCity" disabled><input type="text" id="ToCity" disabled>
   <input type="text" id="portOfLoading"><input type="text" id="portOfDischarge">
   ${sel('Billtype', ['Lorry Receipt(LR)', 'Rail Receipt(RR)', 'Bill of Lading(BL)', 'Airway Bill Number(AWB)'])}
   <input type="text" id="BillNumber"><input type="text" id="BillDate"><input type="text" id="Markno">${sel('showPremiumAmount', ['Yes', 'No'])}`,
)}
${section('Vessel Details', 0, 'vessel', '<label><input type="radio" id="VesselLoaded1" name="v" checked> No</label>')}
${section(
  'Cargo Details',
  8,
  'cargo',
  `${sel('CargoType', CARGO)}<select id="Packaging1" disabled><option value="">Select</option></select>
   <input type="text" id="CargoSumInsured" maxlength="9"><input type="text" id="CargoRatept"><input type="text" id="ExtraPt">
   <input type="text" id="invoiceNumber"><input type="text" id="Invoicedate">${sel('ExcessApplicableOn', ['Consignment value', 'Claim amount'])}
   <input type="text" id="Excess"><input type="text" id="minimumExcessAmount">
   ${['A', 'B', 'C'].map((c, i) => `<label><input type="checkbox" id="coverageDet${i}"> Inland Transit Clause-${c}</label>`).join('')}`,
)}
<button type="button" id="save">Save &amp; Calculate Premium</button>
</form>
<script>
  const $ = (s) => document.querySelector(s);
  window.__saved = false; window.__toggles = 0;
  $('#save').addEventListener('click', () => { window.__saved = true; });
  document.querySelectorAll('[data-sec]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); window.__toggles += 1; document.getElementById(a.dataset.sec).classList.toggle('hidden');
  }));
  const party = () => { const org = $('#Organization').checked; $('#org').classList.toggle('hidden', !org); $('#ind').classList.toggle('hidden', org); };
  $('#Organization').addEventListener('change', party); $('#individual').addEventListener('change', party);
  $('#CargoType').addEventListener('change', () => { $('#Packaging1').disabled = false; $('#Packaging1').innerHTML += '<option>Bags</option>'; });
  const COUNTRIES = ['India', 'Indonesia', 'United Arab Emirates', 'United Kingdom'];
  for (const [box, id] of [['#fromCountry', 'ta-from'], ['#ToCountry', 'ta-to']]) {
    const input = $(box);
    const list = document.createElement('ul'); list.id = id; list.className = 'dropdown-menu hidden';
    input.parentElement.appendChild(list);
    input.addEventListener('input', () => {
      const items = COUNTRIES.filter((c) => c.toLowerCase().startsWith(input.value.toLowerCase().slice(0, 2)));
      list.innerHTML = items.map((c) => '<li><a href="#" data-v="' + c + '">' + c + '</a></li>').join('');
      list.classList.toggle('hidden', items.length === 0);
    });
    list.addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (!a) return; e.preventDefault();
      input.value = a.dataset.v; input.dataset.picked = a.dataset.v; list.classList.add('hidden');
    });
  }
</script></body></html>`;

const dashboard =
  () => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.tile{display:inline-block;margin:4px;padding:8px;border:1px solid #ccc;cursor:pointer}.caps .tile span{text-transform:uppercase}</style></head><body>
<h3>Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .</h3>
<div id="products" class="caps"><h3>PRODUCT SELECTION</h3>${['Motor', 'Marine', 'Rural'].map((p) => `<div class="tile" ng-click="selectLob('${p}')" data-p="${p}"><span>${p}</span></div>`).join('')}</div>
<div id="marine" class="hidden"><h3>MARINE PRODUCTS</h3><div class="tile" data-m="sv"><p>Specific Voyage</p></div><div class="tile"><p>Marine Open Policy</p></div></div>
<script>
  const $ = (s) => document.querySelector(s);
  $('[data-p="Marine"]').addEventListener('click', () => { $('#products').classList.add('hidden'); $('#marine').classList.remove('hidden'); });
  $('[data-m="sv"]').addEventListener('click', () => setTimeout(() => { location.href = '/NIABancsPortal/QuoteNonCustomer.html'; }, 300));
</script></body></html>`;

module.exports = {
  '/NIABancsPortal/QuoteNonCustomer.html': () => form(),
  '/NIABancsPortal/NonCustomerDashboard.html': () => dashboard(),
};
