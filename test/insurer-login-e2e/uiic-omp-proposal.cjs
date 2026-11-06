// Local copies of United India's Overseas Mediclaim e-proposals, built from the advisor's recording
// of B&H on 3 November 2026 (field ids, AngularJS models, option lists and pop-up texts as
// recorded). SCHENGEN and Studies were not recorded (the advisor says they have the same fields):
// their copies use other model prefixes and page names, made up, so that the app is shown not to
// depend on B&H's.
// - "Proposal filled by" customer / agent; customer shows a short form whose ids repeat below;
//   agent shows the proposal at once (New already chosen);
// - I. General Information: destination (a select with no id), travel days, travel start date and
//   the insured's date of birth (calendars « ‹ title › », OK); "Click here to choose plan" lists
//   the plans for that trip (A-1..A-3 excluding USA / Canada; B-1..B-4, made up, including) as
//   radios named "plan" over a row of premiums, or ERRORS if something is missing;
// - II. Proposer Information (opening it without a plan: ERRORS "Please Select Plan Type."); the
//   village box is #villageCode;
// - III. Insured Information (opening it lists, as on the portal, the proposer's missing
//   signature); its date of birth box repeats section I's id, locked;
// - X. Premium Details: the plan, the net premium and the total premium, all with id totalPremium
//   (the total last); IX. Declaration from Intermediary: a signature upload only;
// - Save As Draft records that it was pressed (the app must never press it).
const FORMS = {
  'business-holiday': {
    prefix: 'OMPBHProposalFormData',
    path: '/CustomerAppLive/data/ProposalOMPBHhome.html',
    tile: 'Overseas Mediclaim Policy B&amp;H E-Proposal Form',
    title: 'PROPOSAL FORM FOR OVERSEAS MEDICLAIM POLICY-B',
  },
  schengen: {
    prefix: 'OMPSCHProposalFormData',
    path: '/CustomerAppLive/data/ProposalOMPSCHhome.html',
    tile: 'Overseas Mediclaim Policy SCHENGEN E-Proposal Form',
    title: 'PROPOSAL FORM FOR OVERSEAS MEDICLAIM POLICY-SCHENGEN',
  },
  studies: {
    prefix: 'OMPSTProposalFormData',
    path: '/CustomerAppLive/data/ProposalOMPSThome.html',
    tile: 'Overseas Mediclaim Policy Studies E-Proposal Form',
    title: 'PROPOSAL FORM FOR OVERSEAS MEDICLAIM POLICY-STUDIES',
  },
};

const MONTHS = `['January','February','March','April','May','June','July','August','September','October','November','December']`;
const dateBox = (id, locked = false) =>
  locked
    ? `<input id="${id}" disabled readonly>`
    : `<table><tr><td><div><div><button type="button" class="cal" data-for="${id}"></button></div></div><input id="${id}" name="${id}" readonly ng-model="ngModel"></td></tr></table>`;
const TITLES =
  '<option value="">Select</option><option value="Mr">Mr.</option><option value="Master">Master</option><option value="Mrs">Mrs.</option><option value="Miss">Miss</option><option value="Others">Others</option>';

const formPage = ({
  prefix: F,
  title,
}) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>.hidden{display:none}.modal-content{border:1px solid #888;padding:8px;margin:8px;background:#fff}td{padding:2px}</style></head><body>
<div id="errors" class="modal hidden"><div class="modal-content">
  <h4>ERRORS</h4><p id="errText"></p><button type="button" name="choosePlan" id="errClose">Close</button>
</div></div>

<label><input type="radio" id="proposalfilledBy" name="proposalfilledBy" ng-model="${F}.proposalFilledBy" value="customer"> Customer</label>
<label><input type="radio" id="Radio7" name="proposalfilledBy" ng-model="${F}.proposalFilledBy" value="agent"> Agent</label>

<div id="customerPart" class="hidden">
  <select id="Text1" name="proposerName" ng-model="${F}.CommonCustomerBean.ynHighRisk"><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>
  <select id="proposerTitle" ng-model="${F}.proposerTitle">${TITLES}</select>
  <input id="Text4" name="proposerName" ng-model="${F}.proposerName">
  <input id="proposerMobileNo" ng-model="${F}.proposerMobileNo">
  <input id="proposerEmail" type="email" ng-model="${F}.proposerEmailId">
  <button type="button" name="sendToCustomer">Send To Customer</button>
</div>

<div id="proposal" class="hidden">
  <label><input type="radio" id="Radio4" name="chooseProposal" ng-model="${F}.chooseProposal" value="new" checked> New Proposal</label>
  <label><input type="radio" id="Radio5" name="chooseProposal" ng-model="${F}.chooseProposal" value="fetchdata"> Fetch Details</label>
  <a href="#" data-sec="1">I. General Information</a>
  <div id="sec1">
    <select ng-model="${F}.trvDestGrp"><option value="">Select</option><option value="World_Wide_Restricted">Worldwide travel excluding USA / Canada</option><option value="World_Wide">Worldwide travel including USA / Canada</option></select>
    <input id="travelNoOfDays" ng-model="${F}.travelNoOfDays">
    ${dateBox('travelStartDate')}
    ${dateBox('insuredDOB')}
    <input id="policyEndDate" readonly ng-model="${F}.policyEndDate">
    <input id="insuredAge" disabled ng-model="${F}.insuredAge">
    <button type="button" id="choosePlans">Click here to choose plan</button>
    <div id="plans"></div>
  </div>
  <a href="#" data-sec="2">II. Proposer Information</a>
  <div id="sec2" class="hidden">
    <select id="Text1" name="proposerName" ng-model="${F}.CommonCustomerBean.ynHighRisk"><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>
    <select id="highRiskType" class="hidden" ng-model="${F}.CommonCustomerBean.highRiskType"><option value="">Select</option><option value="1">HNI</option><option value="2">PEP</option><option value="3">NRI/HNI</option><option value="4">Trust/NGO</option></select>
    <select id="proposerTitle" ng-model="${F}.proposerTitle">${TITLES}</select>
    <input id="proposerGender" disabled ng-model="${F}.proposerGender">
    <input id="proposerName" ng-model="${F}.proposerName">
    <select id="customerType" ng-model="${F}.customerType"><option value="Individual">Individual</option></select>
    <input id="proposerPINCode" ng-model="${F}.proposerPINCode">
    <select id="STATE_CODE1" ng-model="${F}.CommonCustomerBean.proposerState"><option value="">Select</option></select>
    <select id="STATE_CODE2" ng-model="${F}.CommonCustomerBean.proposerCity"><option value="">Select</option></select>
    <select id="villageCode" ng-model="${F}.CommonCustomerBean.villageCode"><option value="">Select</option></select>
    <input id="CKYCNo" ng-model="${F}.CKYCNo">
    <input id="proposerAddress" ng-model="${F}.proposerAddress">
    <input id="proposerSTDCode" ng-model="${F}.proposerSTDCode">
    <input id="proposerResidenceTelNo" ng-model="${F}.proposerResidenceTelNo">
    <input id="proposerMobileNo" ng-model="${F}.proposerMobileNo">
    <input id="proposerEmail" type="email" ng-model="${F}.proposerEmailId">
    <input id="eInsuranceAccNo" ng-model="${F}.eInsuranceAccNo">
    <input id="aadharNo" ng-model="${F}.aadharNo">
    <input id="panNo" ng-model="${F}.panNo">
    <input id="ProposerSignature" type="file" ng-model="${F}.proposerSign">
  </div>
  <a href="#" data-sec="3">III. Insured Information</a>
  <div id="sec3" class="hidden">
    <select id="insuredRelation" ng-model="${F}.insuredRelation"><option value="">Select</option><option>Self</option><option>Spouse</option><option>Father</option><option>Mother</option><option>Son</option><option>Daughter</option></select>
    <select id="Select2" ng-model="${F}.insuredTitle">${TITLES}</select>
    <input id="insuredName" ng-model="${F}.insuredName">
    <select id="insuredOccupation" ng-model="${F}.insuredOccupation"><option value="">Select</option><option>SelfEmployed</option><option>Unemployed</option><option>Salaried</option><option>Service</option><option>Professional</option></select>
    ${dateBox('insuredDOB', true)}
    <select id="insuredMaritalStatus" ng-model="${F}.insuredMaritalStatus"><option value="">Select</option><option value="Married">Married</option><option value="Single">Unmarried</option></select>
    <input id="insuredGender" disabled ng-model="${F}.insuredGender">
    <select id="insuredNationality" ng-model="${F}.insuredNationality"><option value="Indian">Indian</option></select>
    <input id="insuredPassportNo" ng-model="${F}.insuredPassportNo">
    <input id="insuredPassportIssuingAuth" ng-model="${F}.insuredPassportIssuingAuth">
    ${dateBox('insuredPassportIssueDate')}
    ${dateBox('insuredPassportExpDate')}
    <input id="insuredNomineeName" ng-model="${F}.insuredNomineeName">
    <select id="insuredNomineeRelation" ng-model="${F}.insuredNomineeRelation"><option value="">Select</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Father</option><option>Mother</option><option>Others</option></select>
    <input id="insuredNomineeAge" ng-model="${F}.insuredNomineeAge">
  </div>
  <a href="#" data-sec="4">IV. Medical History</a>
  <div id="sec4" class="hidden">
    <label><input type="radio" name="hasPreExistingDis" ng-model="${F}.hasPreExistingDis" value="Yes"> Yes</label>
    <label><input type="radio" name="hasPreExistingDis" ng-model="${F}.hasPreExistingDis" value="No"> No</label>
  </div>
  <a href="#">V. Assignment</a>
  <a href="#" data-sec="9">IX. Declaration from Intermediary</a>
  <div id="sec9" class="hidden"><input id="intermediarySignature" type="file" ng-model="${F}.intermediarySignature"></div>
  <a href="#" data-sec="10">X. Premium Details</a>
  <div id="sec10" class="hidden">
    <input id="planType" disabled ng-model="${F}.planType">
    <label>Net Premium (₹): <input id="totalPremium" disabled ng-model="${F}.planA1Premium"></label>
    <label>Total Premium (₹): <input id="totalPremium" disabled></label>
    <label><input type="radio" id="premiumpaymodes" name="premiumpaymodes" ng-model="${F}.premiumPayMode" value="Cheque"> Cheque</label>
  </div>
  <button type="button" name="saveDraft" id="saveDraft">Save As Draft</button>
</div>
<script>
  window.__saved = false;
  const $ = (s) => document.querySelector(s);
  const inProposal = (s) => document.querySelector('#proposal ' + s);
  const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
  const error = (lines) => { $('#errText').textContent = lines.join(' '); show('errors', true); };
  $('#errClose').addEventListener('click', () => setTimeout(() => show('errors', false), 400));
  const chosen = (name) => $('input[name="' + name + '"]:checked')?.value;
  document.querySelectorAll('input[name="proposalfilledBy"]').forEach((r) => r.addEventListener('change', () => {
    show('customerPart', chosen('proposalfilledBy') === 'customer');
    if (chosen('proposalfilledBy') === 'agent') setTimeout(() => show('proposal', true), 300);
    else show('proposal', false);
  }));

  const destination = () => inProposal('select[ng-model$=".trvDestGrp"]').value;
  const age = () => {
    const [d, m, y] = ($('#sec1 #insuredDOB').value || '').split('/').map(Number);
    return y ? 2026 - y - (m > 11 || (m === 11 && d > 3) ? 1 : 0) : null;
  };
  let premium = null;
  $('#choosePlans').addEventListener('click', () => {
    const lines = [];
    if (!destination()) lines.push('* Please Select Travel Destination.');
    if (!$('#travelNoOfDays').value) lines.push('* Please Enter Travel Days.');
    if (!$('#travelStartDate').value) lines.push('* Please Select Travel Start Date.');
    if (age() === null) lines.push('* Please Select Date of Birth of Insured.');
    // As live (6 November 2026): a date shown in the box but not confirmed with OK is not kept.
    else if (window.__confirmed?.insuredDOB !== $('#sec1 #insuredDOB').value) lines.push('* Please Enter Date of Birth.');
    if (lines.length) { error(lines); return; }
    $('#insuredAge').value = String(age());
    const codes = destination() === 'World_Wide' ? ['B-1', 'B-2', 'B-3', 'B-4'] : ['A-1', 'A-2', 'A-3'];
    const days = Number($('#travelNoOfDays').value);
    const prices = codes.map((c, i) => (30 + 10 * i + (destination() === 'World_Wide' ? 15 : 0)) * days + age());
    setTimeout(() => {
      $('#plans').innerHTML = '<table><tbody><tr>' + codes.map((c) => '<td><label><input type="radio" id="' + c + '" name="plan" value="' + c + '"> Plan ' + c + '</label></td>').join('') + '</tr>' +
        '<tr>' + prices.map((p) => '<td><span>' + p + '</span></td>').join('') + '</tr></tbody></table>';
      document.querySelectorAll('input[name="plan"]').forEach((r, i) => r.addEventListener('change', () => {
        premium = prices[i];
        $('#planType').value = r.value;
        document.querySelectorAll('#sec10 #totalPremium')[0].value = String(premium);
        document.querySelectorAll('#sec10 #totalPremium')[1].value = String(premium + Math.round(premium * 0.18));
      }));
    }, 600);
  });

  document.querySelectorAll('#proposal a[data-sec]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const sec = Number(a.dataset.sec);
    show('sec' + sec, true);
    const lines = [];
    if (sec >= 2 && !$('#planType').value) lines.push('* Please Select Plan Type.');
    if (sec >= 3 && !inProposal('#proposerAddress').value) lines.push('* Please Enter Address of the Proposer.');
    if (sec >= 3) lines.push('* Please Upload Signature of Proposer.');
    if (lines.length) error(lines);
  }));

  inProposal('select[ng-model$=".ynHighRisk"]').addEventListener('change', (e) => show('highRiskType', e.target.value === 'Yes'));
  inProposal('#proposerTitle').addEventListener('change', (e) => {
    $('#proposerGender').value = { Mr: 'Male', Master: 'Male', Mrs: 'Female', Miss: 'Female', Others: 'Transgender' }[e.target.value] ?? '';
  });
  $('#proposerPINCode').addEventListener('change', (e) => setTimeout(() => {
    if (/^\\d{6}$/.test(e.target.value)) {
      $('#STATE_CODE1').innerHTML = '<option value="">Select</option><option value="29">KARNATAKA</option>';
      $('#STATE_CODE2').innerHTML = '<option value="">Select</option><option value="1">BENGALURU</option>';
      $('#villageCode').innerHTML = '<option value="">Select</option><option value="v1">KORAMANGALA</option>';
    }
  }, 500));
  // The insured's date of birth in section III is section I's, locked.
  $('#insuredRelation').addEventListener('change', () => { $('#sec3 #insuredDOB').value = $('#sec1 #insuredDOB').value; });
  $('#saveDraft').addEventListener('click', () => { window.__saved = true; });

  const MONTHS = ${MONTHS};
  document.querySelectorAll('.cal').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.cal-pop').forEach((p) => p.remove());
    const target = button.closest('td').querySelector('input');
    let y = 2026, m = 10, chosenDay = null;
    const pop = document.createElement('div');
    pop.className = 'cal-pop';
    const render = () => {
      const days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let d = 1; d <= days; d++) cells += '<td><button type="button" class="btn' + (chosenDay === d ? ' active' : '') + '" data-d="' + d + '"><span>' + d + '</span></button></td>';
      pop.innerHTML = '<div><button type="button">«</button><button type="button">‹</button><strong>' + MONTHS[m] + ' ' + y + '</strong><button type="button">›</button><button type="button">»</button></div>' +
        '<table role="grid"><tr>' + cells + '</tr></table><div><button type="button">Cancel</button><button type="button">OK</button></div>';
    };
    render();
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const t = b.textContent;
      // As live: the day shows in the box at once; it is kept only when OK is pressed.
      if (b.dataset.d) {
        chosenDay = Number(b.dataset.d);
        target.value = String(chosenDay).padStart(2, '0') + '/' + String(m + 1).padStart(2, '0') + '/' + y;
        render();
        return;
      }
      if (t === '«') y--; else if (t === '»') y++;
      else if (t === '‹') { m--; if (m < 0) { m = 11; y--; } }
      else if (t === '›') { m++; if (m > 11) { m = 0; y++; } }
      else if (t === 'Cancel') { pop.remove(); return; }
      else if (t === 'OK') {
        if (chosenDay) target.value = String(chosenDay).padStart(2, '0') + '/' + String(m + 1).padStart(2, '0') + '/' + y;
        window.__confirmed = { ...(window.__confirmed ?? {}), [target.id]: target.value };
        pop.remove(); return;
      } else return;
      chosenDay = null;
      render();
    });
    document.body.appendChild(pop);
  }));
</script></body></html>`;

const home = `<!doctype html><html><head><meta charset="utf-8"><title>UIIC - Intermediary Portal Home</title></head><body>
${Object.values(FORMS)
  .map(
    (f) => `  <div><a href="${f.path}#/ProposalFormMainBody" target="_blank">${f.tile}</a></div>`,
  )
  .join('\n')}</body></html>`;

module.exports = {
  '/GCWebPortal/login/HomeAction.do': home,
  ...Object.fromEntries(Object.values(FORMS).map((f) => [f.path, formPage(f)])),
};
module.exports.PAGES = Object.fromEntries(
  Object.entries(FORMS).map(([form, f]) => [form, f.path.split('/').pop()]),
);
