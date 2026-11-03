// Local copies of United India's health e-proposals, built from the advisor's recordings of
// 3 November 2026 (field ids, AngularJS models, option lists and pop-up texts as recorded): Family
// Medicare and Individual Health share sections I and II; they differ in the page, the ids of the
// "filled by" and New / Fetch radios (Radio4 is "agent" on one and "New" on the other), the
// gender radios' ids (all "proposerGender" on Individual Health) and the intermediary's section
// (XI on Family Medicare, X on Individual Health):
// - the "Important Instructions" pop-up on opening;
// - "Proposal filled by" customer / agent. Customer shows a short form to send the proposal to the
//   client (Is High Risk Customer?, name, mobile, e-mail, Send To Customer); agent shows New /
//   Fetch Details (ids duplicated as on the portal: Text1 is both a select and a box);
// - once "agent" and "new" are chosen, the proposal: I. Proposer Details (its own Is High Risk
//   Customer?, name, date of birth with the « ‹ › » calendar and OK, gender, marital status,
//   occupation, PAN, Aadhaar, PIN code with a city/state lookup, address, mobile, e-mail) and
//   II. Nomination;
// - opening Nomination with section I incomplete shows the ERRORS pop-up listing what is missing
//   (the section still opens, as on the portal);
// - Save As Draft records that it was pressed (the app must never press it).
const OCCUPATIONS = [
  ['17', 'Advocate / Lawyer'],
  ['19', 'Chartered Accountants'],
  ['15', 'Housewife'],
  ['14', 'Not working'],
  ['30', 'Software Professional'],
  ['31', 'Student'],
];
const NOMINEES = [
  'Spouse',
  'Father',
  'Mother',
  'Son',
  'Daughter',
  'Father In-law',
  'Mother In-law',
  'Brother',
  'Sister',
];

const FORMS = {
  'family-medicare': {
    title: 'Family Medicare Policy',
    ids: { customer: 'Radio3', agent: 'Radio4', newer: 'Radio5', fetch: 'Radio7' },
    female: 'proposerGenderFemale',
    transgender: 'proposerGenderTransgender',
    intermediary: 'XI. Declaration from Intermediary',
  },
  'individual-health': {
    title: 'Individual Health Policy',
    ids: { customer: 'proposalfilledBy', agent: 'Radio7', newer: 'Radio4', fetch: 'Radio5' },
    female: 'proposerGender',
    transgender: 'proposerGender',
    intermediary: 'X. Declaration from Intermediary',
  },
  // Not recorded: said by the advisor to be the same as Individual Health. Their pages' names here
  // are made up (the app accepts any Proposal…home.html), and their intermediary's sections are
  // numbered differently on purpose (the app finds it by name).
  'arogya-sanjeevani': {
    title: 'Arogya Sanjeevani Policy',
    ids: { customer: 'proposalfilledBy', agent: 'Radio7', newer: 'Radio4', fetch: 'Radio5' },
    female: 'proposerGender',
    transgender: 'proposerGender',
    intermediary: 'XII. Declaration from Intermediary',
  },
  'super-top-up': {
    title: 'Super Top-up Policy',
    ids: { customer: 'proposalfilledBy', agent: 'Radio7', newer: 'Radio4', fetch: 'Radio5' },
    female: 'proposerGender',
    transgender: 'proposerGender',
    intermediary: 'X. Declaration from Intermediary',
  },
};

const formPage = ({
  title,
  ids,
  female,
  transgender,
  intermediary,
}) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>.hidden{display:none}.modal-content{border:1px solid #888;padding:8px;margin:8px;background:#fff}td{padding:2px}</style></head><body>
<div id="instructions" class="modal hidden"><div class="modal-content">
  <h4>Important Instructions**</h4><p>Please Be ready with the following documents to fill up the electronic proposal Form.</p>
  <button type="button" name="choosePlan" id="instClose">Close</button>
</div></div>
<div id="errors" class="modal hidden"><div class="modal-content">
  <h4>ERRORS</h4><p id="errText"></p><button type="button" name="choosePlan" id="errClose">Close</button>
</div></div>

<label><input type="radio" id="${ids.customer}" name="proposalfilledBy" ng-model="formData.proposalFilledBy" value="customer"> Customer</label>
<label><input type="radio" id="${ids.agent}" name="proposalfilledBy" ng-model="formData.proposalFilledBy" value="agent"> Agent</label>
<div id="customerPart" class="hidden">
<h4>I. Proposer Details</h4>
<select id="Text1" name="High Customer" ng-model="formData.ynHighRisk"><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>
<select id="highRiskType" class="hidden" ng-model="formData.highRiskType"><option value="">Select</option><option value="1">High Networth Individual (HNI)</option></select>
<input id="Text1" name="proposerName" ng-model="formData.proposerName">
<input id="Text2" name="proposerTelNoMobile" ng-model="formData.proposerTelNoMobile">
<input id="Email1" type="email" name="proposerEmail" ng-model="formData.proposerEmail">
<h4>II. Declaration from Intermediary</h4>
<input id="Text3" readonly ng-model="formData.IntmSignDate"><input id="Text4" ng-model="formData.IntmSignPlace">
<button type="button">Send To Customer</button>
</div>
<div id="agentPart" class="hidden">
<label><input type="radio" id="${ids.newer}" name="chooseProposal" ng-model="formData.chooseProposal" value="new"> New</label>
<label><input type="radio" id="${ids.fetch}" name="chooseProposal" ng-model="formData.chooseProposal" value="fetchdata"> Fetch details</label>
</div>

<div id="proposal" class="hidden">
  <h4>New Proposal / Fetch Details</h4>
  <a href="#" id="tab1">I. Proposer Details</a>
  <div id="sec1">
    <select id="Text1" name="proposerName" ng-model="formData.ynHighRisk"><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>
    <select id="mainHighRiskType" class="hidden" ng-model="formData.highRiskType"><option value="">Select</option><option value="1">High Networth Individual (HNI)</option><option value="2">PEP/close relative of PEP()</option><option value="3">NRI/Foreign Resident and who is also HNI</option><option value="4">Trust/NGO</option></select>
    <input id="proposerName" name="proposerName" ng-model="formData.proposerName">
    <table><tr><td><div><div><button type="button" class="cal"></button></div></div><input id="proposerDOB" name="proposerDOB" readonly ng-model="ngModel"></td></tr></table>
    <label><input type="radio" id="proposerGender" name="gender" ng-model="formData.proposerGender" value="Male"> Male</label>
    <label><input type="radio" id="${female}" name="gender" ng-model="formData.proposerGender" value="Female"> Female</label>
    <label><input type="radio" id="${transgender}" name="gender" ng-model="formData.proposerGender" value="Transgender"> Transgender</label>
    <label><input type="radio" id="proposerMaritalStatus" name="maritalStatus" ng-model="formData.proposerMaritalStatus" value="Single"> Single</label>
    <label><input type="radio" id="proposerMaritalStatusMarried" name="maritalStatus" ng-model="formData.proposerMaritalStatus" value="Married"> Married</label>
    <select id="OCCUPATION_CODE" name="occupation" ng-model="formData.CommonCustomerBean.occupation"><option value="">Select</option>${OCCUPATIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
    <input id="proposerPANCardNo" ng-model="formData.proposerPANCardNo">
    <input id="proposerAadhaarCard_PassportNo" ng-model="formData.proposerAadhaarNo">
    <input id="proposerEInsuranceAccountNo" ng-model="formData.proposerEInsuranceAccountNo">
    <input id="proposerPINCode" ng-model="formData.proposerPINCode">
    <select id="STATE_CODE1" ng-model="formData.CommonCustomerBean.proposerState"><option value="">Select</option></select>
    <select id="STATE_CODE2" ng-model="formData.CommonCustomerBean.proposerCity"><option value="">Select</option></select>
    <select id="Village_Code" name="selectedvillage" ng-model="formData.villageCode"><option value="">Select</option></select>
    <input id="proposerAddress" ng-model="formData.proposerAddress">
    <input id="proposerTelNoSTDCode" ng-model="formData.proposerTelNoSTDCode">
    <input id="proposerTelNoHome" ng-model="formData.proposerTelNoHome">
    <input id="proposerTelNoMobile" ng-model="formData.proposerTelNoMobile">
    <input id="proposerEmail" type="email" ng-model="formData.proposerEmail">
    <input id="proposerCKYCNo" ng-model="formData.proposerCKYCNo">
  </div>
  <a href="#" id="tab2">II. Nomination</a>
  <div id="sec2" class="hidden">
    <input id="nomineeName" ng-model="formData.nomineeName">
    <select id="nomineeRelationship" ng-model="formData.nomineeRelationship"><option value="">Select</option>${NOMINEES.map((n) => `<option value="${n}">${n}</option>`).join('')}</select>
    <input id="nomineeAddress" ng-model="formData.nomineeAddress">
    <input id="nomineeContactNo" ng-model="formData.nomineeContactNo">
  </div>
  <a href="#">III. Coverage Details</a>
  <a href="#">IX. Vernacular Declaration</a>
  <a href="#" id="tab11">${intermediary}</a>
  <div id="sec11" class="hidden">
    <input id="IntermediaryDeclarationDate" readonly ng-model="formData.IntmSignDate">
    <input id="IntermediaryDeclarationPlace" ng-model="formData.IntmSignPlace">
  </div>
  <button type="button" name="saveDraft" id="saveDraft">Save As Draft</button>
</div>
<script>
  window.__saved = false;
  const $ = (s) => document.querySelector(s);
  const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
  setTimeout(() => show('instructions', true), 400);
  $('#instClose').addEventListener('click', () => show('instructions', false));
  // Like the portal's pop-up, it fades out: still shown for a moment after Close.
  $('#errClose').addEventListener('click', () => setTimeout(() => show('errors', false), 400));
  $('#sec1 select[ng-model="formData.ynHighRisk"]').addEventListener('change', (e) => show('mainHighRiskType', e.target.value === 'Yes'));
  $('select[name="High Customer"]').addEventListener('change', (e) => show('highRiskType', e.target.value === 'Yes'));
  document.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => {
    const chosen = (name) => $('input[name="' + name + '"]:checked')?.value;
    show('customerPart', chosen('proposalfilledBy') === 'customer');
    show('agentPart', chosen('proposalfilledBy') === 'agent');
    if (chosen('proposalfilledBy') === 'agent' && chosen('chooseProposal') === 'new') setTimeout(() => show('proposal', true), 300);
  }));
  // The PIN code lookup fills city and state.
  $('#proposerPINCode').addEventListener('change', (e) => setTimeout(() => {
    if (/^\\d{6}$/.test(e.target.value)) {
      $('#STATE_CODE1').innerHTML = '<option value="">Select</option><option value="29">KARNATAKA</option>';
      $('#STATE_CODE2').innerHTML = '<option value="">Select</option><option value="1">BENGALURU</option><option value="2">BENGALURU RURAL</option>';
      $('#Village_Code').innerHTML = '<option value="">Select</option><option value="v1">KORAMANGALA</option><option value="v2">INDIRANAGAR</option>';
    }
  }, 500));
  $('#tab2').addEventListener('click', (e) => {
    e.preventDefault();
    const missing = [];
    if (!/^[A-Z]{5}\\d{4}[A-Z]$/.test($('#proposerPANCardNo').value)) missing.push('* Please Provide PAN Number of Proposer.');
    if (!$('#proposerAadhaarCard_PassportNo').value) missing.push('* Please Provide Aadhaar No. of Proposer.');
    if ($('#sec1 select[ng-model="formData.ynHighRisk"]').value === 'Yes' && !$('#mainHighRiskType').value)
      missing.push('* Please select High risk type for the customer as Customer marked as high risk');
    show('sec2', true);
    if (missing.length) { $('#errText').textContent = missing.join(' '); show('errors', true); }
  });
  // Opening the intermediary's section: United India lists what the sections before it lack (here the coverage).
  $('#tab11').addEventListener('click', (e) => {
    e.preventDefault();
    show('sec11', true);
    $('#errText').textContent = '* Please Select Policy Type.';
    show('errors', true);
  });
  $('#saveDraft').addEventListener('click', () => { window.__saved = true; });

  // The date-of-birth calendar, as on the health calculator: « ‹ title › », day buttons, OK.
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  $('.cal').addEventListener('click', () => {
    document.querySelectorAll('.cal-pop').forEach((p) => p.remove());
    let y = 2026, m = 10, chosen = null;
    const pop = document.createElement('div');
    pop.className = 'cal-pop';
    const render = () => {
      const days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let d = 1; d <= days; d++) cells += '<td><button type="button" class="btn' + (chosen === d ? ' active' : '') + '" data-d="' + d + '"><span>' + d + '</span></button></td>';
      pop.innerHTML = '<div><button type="button">«</button><button type="button">‹</button><strong>' + MONTHS[m] + ' ' + y + '</strong><button type="button">›</button><button type="button">»</button></div>' +
        '<table role="grid"><tr>' + cells + '</tr></table><div><button type="button">Cancel</button><button type="button">OK</button></div>';
    };
    render();
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const t = b.textContent;
      if (b.dataset.d) { chosen = Number(b.dataset.d); render(); return; }
      if (t === '«') y--; else if (t === '»') y++;
      else if (t === '‹') { m--; if (m < 0) { m = 11; y--; } }
      else if (t === '›') { m++; if (m > 11) { m = 0; y++; } }
      else if (t === 'Cancel') { pop.remove(); return; }
      else if (t === 'OK') {
        if (chosen) $('#proposerDOB').value = String(chosen).padStart(2, '0') + '/' + String(m + 1).padStart(2, '0') + '/' + y;
        pop.remove(); return;
      } else return;
      chosen = null;
      render();
    });
    document.body.appendChild(pop);
  });
</script></body></html>`;

const home = `<!doctype html><html><head><meta charset="utf-8"><title>UIIC - Intermediary Portal Home</title></head><body>
  <div><a href="/CustomerAppLive/data/ProposalFMhome.html#/ProposalFormMainBody" target="_blank">Family Medicare E-Proposal Form</a></div>
  <div><a href="/CustomerAppLive/data/ProposalIHPhome.html#/ProposalFormMainBody" target="_blank">Individual Health E-Proposal Form</a></div>
  <div><a href="/CustomerAppLive/data/ProposalASPhome.html#/ProposalFormMainBody" target="_blank">Arogya Sanjeevani E-Proposal Form</a></div>
  <div><a href="/CustomerAppLive/data/ProposalSTUhome.html#/ProposalFormMainBody" target="_blank">Super Top-up Policy E-Proposal Form</a></div></body></html>`;

module.exports = {
  '/GCWebPortal/login/HomeAction.do': home,
  '/CustomerAppLive/data/ProposalFMhome.html': formPage(FORMS['family-medicare']),
  '/CustomerAppLive/data/ProposalIHPhome.html': formPage(FORMS['individual-health']),
  '/CustomerAppLive/data/ProposalASPhome.html': formPage(FORMS['arogya-sanjeevani']),
  '/CustomerAppLive/data/ProposalSTUhome.html': formPage(FORMS['super-top-up']),
};
