// A local copy of United India's Overseas Travel Insurance e-proposal, built from the advisor's
// recording of 3 November 2026 (field ids, AngularJS models under OTIProposalFormData, option lists
// and pop-up texts as recorded):
// - "Proposal filled by" customer / agent. Customer shows a short form (Is High Risk Customer?,
//   title, name, mobile, e-mail, the intermediary's place) whose ids repeat in the proposal;
//   agent shows New / Fetch details;
// - I. General Information: purpose (Business & Holiday) loads the destinations, a destination
//   loads its plans (B1-B4 Worldwide, A1-A3 excluding USA and Canada), the travel start date
//   calendar (« ‹ title › », day buttons, OK) and the days;
// - II. Proposer Information (opening it without a plan shows ERRORS "Please Select Plan Type."),
//   the title setting the gender, the PIN code lookup, the signature upload;
// - III. Insured Information (opening it lists, as on the portal, the proposer's missing signature):
//   "Self" copies the title and name and locks them; date of birth calendar; passport; nominee;
// - IV. Medical History, VIII. Premium Details (View Premium fills the premium, or lists what is
//   missing in ERRORS) and IX. Declaration from Intermediary;
// - Save As Draft records that it was pressed (the app must never press it).
const MONTHS = `['January','February','March','April','May','June','July','August','September','October','November','December']`;

const dateBox = (id) =>
  `<table><tr><td><div><div><button type="button" class="cal" data-for="${id}"></button></div></div><input id="${id}" name="${id}" readonly ng-model="ngModel"></td></tr></table>`;

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Proposal Form Main Body</title>
<style>.hidden{display:none}.modal-content{border:1px solid #888;padding:8px;margin:8px;background:#fff}td{padding:2px}</style></head><body>
<div id="errors" class="modal hidden"><div class="modal-content">
  <h4>ERRORS</h4><p id="errText"></p><button type="button" name="choosePlan" id="errClose">Close</button>
</div></div>

<label><input type="radio" id="proposalfilledBy" name="proposalfilledBy" ng-model="OTIProposalFormData.proposalFilledBy" value="customer"> Customer</label>
<label><input type="radio" id="Radio7" name="proposalfilledBy" ng-model="OTIProposalFormData.proposalFilledBy" value="agent"> Agent</label>

<div id="customerPart" class="hidden">
  <a href="#">I. Proposer Details</a>
  <select id="Text1" name="High Customer" ng-model="OTIProposalFormData.ynHighRisk"><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>
  <select id="proposerTitle" name="proposerTitle" ng-model="OTIProposalFormData.proposerTitle"><option value="">Select</option><option value="Mr">Mr.</option></select>
  <input id="Text4" name="proposerName" ng-model="OTIProposalFormData.proposerName">
  <input id="proposerMobileNo" ng-model="OTIProposalFormData.proposerMobileNo">
  <input id="proposerEmail" type="email" ng-model="OTIProposalFormData.proposerEmailId">
  <a href="#">II. Declaration from Intermediary</a>
  <input id="intmSignPlace" ng-model="OTIProposalFormData.intmSignPlace">
  <button type="button" name="sendToCustomer">Send To Customer</button>
</div>
<div id="agentPart" class="hidden">
  <label><input type="radio" id="Radio4" name="chooseProposal" ng-model="OTIProposalFormData.chooseProposal" value="new"> New proposal</label>
  <label><input type="radio" id="Radio5" name="chooseProposal" ng-model="OTIProposalFormData.chooseProposal" value="fetchdata"> Fetch details</label>
</div>

<div id="proposal" class="hidden">
  <a href="#" data-sec="1">I. General Information</a>
  <div id="sec1">
    <select id="travelPurpose" name="travelPurpose" ng-model="OTIProposalFormData.travelPurpose"><option value="">Select</option><option value="BH">Business &amp; Holiday</option></select>
    <select id="travelDestination" ng-model="OTIProposalFormData.travelDestination"><option value="">Select</option></select>
    <select id="planType" ng-model="OTIProposalFormData.planType"><option value="">Select</option></select>
    ${dateBox('travelStartDate')}
    <input id="travelNoOfDays" ng-model="OTIProposalFormData.travelNoOfDays">
    <input id="policyStartDate" readonly ng-model="OTIProposalFormData.policyStartDate">
    <input id="policyEndDate" readonly ng-model="OTIProposalFormData.policyEndDate">
  </div>
  <a href="#" data-sec="2">II. Proposer Information</a>
  <div id="sec2" class="hidden">
    <select id="Text1" name="High Customer" ng-model="OTIProposalFormData.ynHighRisk"><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>
    <select id="highRiskType" class="hidden" ng-model="OTIProposalFormData.highRiskType"><option value="">Select</option><option value="1">HNI</option><option value="2">PEP/close relative of PEP()</option><option value="3">NRI/HNI</option><option value="4">Trust/NGO</option></select>
    <select id="proposerTitle" name="proposerTitle" ng-model="OTIProposalFormData.proposerTitle"><option value="">Select</option><option value="Mr">Mr.</option><option value="Master">Master</option><option value="Mrs">Mrs.</option><option value="Miss">Miss</option><option value="Others">Others</option></select>
    <input id="proposerGender" disabled ng-model="OTIProposalFormData.proposerGender">
    <input id="proposerName" ng-model="OTIProposalFormData.proposerName">
    <select id="customerType" ng-model="OTIProposalFormData.customerType"><option value="Individual">Individual</option></select>
    <input id="proposerPINCode" ng-model="OTIProposalFormData.proposerPINCode">
    <select id="STATE_CODE1" ng-model="OTIProposalFormData.CommonCustomerBean.proposerState"><option value="">Select</option></select>
    <select id="STATE_CODE2" ng-model="OTIProposalFormData.CommonCustomerBean.proposerCity"><option value="">Select</option></select>
    <select id="Village_Code" ng-model="OTIProposalFormData.villageCode"><option value="">Select</option></select>
    <input id="CKYCNo" ng-model="OTIProposalFormData.CKYCNo">
    <input id="proposerAddress" ng-model="OTIProposalFormData.proposerAddress">
    <input id="proposerSTDCode" ng-model="OTIProposalFormData.proposerSTDCode">
    <input id="proposerResidenceTelNo" ng-model="OTIProposalFormData.proposerResidenceTelNo">
    <input id="proposerMobileNo" ng-model="OTIProposalFormData.proposerMobileNo">
    <input id="proposerEmail" type="email" ng-model="OTIProposalFormData.proposerEmailId">
    <input id="eInsuranceAccNo" ng-model="OTIProposalFormData.eInsuranceAccNo">
    <input id="aadharNo" ng-model="OTIProposalFormData.aadharNo">
    <input id="panNo" ng-model="OTIProposalFormData.panNo">
    <input id="ProposerSignature" type="file" ng-model="OTIProposalFormData.proposerSign">
  </div>
  <a href="#" data-sec="3">III. Insured Information</a>
  <div id="sec3" class="hidden">
    <select id="insuredRelation" ng-model="OTIProposalFormData.insuredRelation"><option value="">Select</option><option>Self</option><option>Spouse</option><option>Father</option><option>Mother</option><option>Son</option><option>Daughter</option></select>
    <select id="Select2" name="insuredTitle" ng-model="OTIProposalFormData.insuredTitle"><option value="">Select</option><option value="Mr">Mr.</option><option value="Master">Master</option><option value="Mrs">Mrs.</option><option value="Miss">Miss</option><option value="Others">Others</option></select>
    <input id="insuredName" ng-model="OTIProposalFormData.insuredName">
    <select id="insuredOccupation" ng-model="OTIProposalFormData.insuredOccupation"><option value="">Select</option><option>SelfEmployed</option><option>Unemployed</option><option>Salaried</option><option>Service</option><option>Professional</option></select>
    ${dateBox('insuredDOB')}
    <input id="insuredAge" disabled ng-model="OTIProposalFormData.insuredAge">
    <select id="insuredMaritalStatus" ng-model="OTIProposalFormData.insuredMaritalStatus"><option value="">Select</option><option value="Married">Married</option><option value="Single">Unmarried</option></select>
    <input id="insuredPassportNo" ng-model="OTIProposalFormData.insuredPassportNo">
    <input id="insuredPassportIssuingAuth" ng-model="OTIProposalFormData.insuredPassportIssuingAuth">
    ${dateBox('insuredPassportIssueDate')}
    ${dateBox('insuredPassportExpDate')}
    <input id="insuredNomineeName" ng-model="OTIProposalFormData.insuredNomineeName">
    <select id="insuredNomineeRelation" ng-model="OTIProposalFormData.insuredNomineeRelation"><option value="">Select</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Father</option><option>Mother</option><option>Others</option></select>
  </div>
  <a href="#" data-sec="4">IV. Medical History</a>
  <div id="sec4" class="hidden">
    <label><input type="radio" name="hasPreExistingDis" ng-model="OTIProposalFormData.hasPreExistingDis" value="Yes"> Yes</label>
    <label><input type="radio" name="hasPreExistingDis" ng-model="OTIProposalFormData.hasPreExistingDis" value="No"> No</label>
  </div>
  <a href="#">V. Declaration</a>
  <a href="#" data-sec="8">VIII. Premium Details</a>
  <div id="sec8" class="hidden">
    <label><input type="radio" name="premiumpaymodes" ng-model="OTIProposalFormData.premiumPayMode" value="Cheque"> Cheque</label>
    <input id="netPremium" disabled ng-model="OTIProposalFormData.netPremium">
    <input id="premiumGst" disabled ng-model="OTIProposalFormData.premiumGST">
    <input id="totalPremium" disabled ng-model="OTIProposalFormData.totalPremium">
    <button type="button" id="checkPremium">View Premium</button>
  </div>
  <a href="#" data-sec="9">IX. Declaration from Intermediary</a>
  <div id="sec9" class="hidden">
    <input id="intmSignDate" readonly ng-model="OTIProposalFormData.intmSignDate">
    <input id="intmSignPlace" ng-model="OTIProposalFormData.intmSignPlace">
  </div>
  <button type="button" name="saveDraft" id="saveDraft">Save As Draft</button>
</div>
<script>
  window.__saved = false;
  const $ = (s) => document.querySelector(s);
  const inProposal = (s) => document.querySelector('#proposal ' + s);
  const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
  const error = (lines) => { $('#errText').textContent = lines.join(' '); show('errors', true); };
  // Like the portal's pop-up, it fades out: still shown for a moment after Close.
  $('#errClose').addEventListener('click', () => setTimeout(() => show('errors', false), 400));
  const chosen = (name) => $('input[name="' + name + '"]:checked')?.value;
  document.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => {
    show('customerPart', chosen('proposalfilledBy') === 'customer');
    show('agentPart', chosen('proposalfilledBy') === 'agent');
    if (chosen('proposalfilledBy') === 'agent' && chosen('chooseProposal') === 'new') setTimeout(() => show('proposal', true), 300);
  }));

  // Each choice loads the next list from the server.
  $('#travelPurpose').addEventListener('change', () => setTimeout(() => {
    $('#travelDestination').innerHTML = '<option value="">Select</option><option value="Worldwide Including USA Or CANADA">Worldwide</option><option value="Worldwide Excluding USA Or CANADA">World Wide Restricted-(Excluding USA &amp; Canada)</option>';
  }, 600));
  $('#travelDestination').addEventListener('change', (e) => setTimeout(() => {
    const plans = e.target.value.includes('Excluding')
      ? [['PLAN A1', '50000'], ['PLAN A2', '100000'], ['PLAN A3', '250000']]
      : [['PLAN B1', '50000'], ['PLAN B2', '100000'], ['PLAN B3', '250000'], ['PLAN B4', '500000']];
    $('#planType').innerHTML = '<option value="">Select</option>' + plans.map(([v, s]) => '<option value="' + v + '">' + v + '-' + s + '</option>').join('');
  }, 600));

  const missingBefore = (sec) => {
    const lines = [];
    if (sec >= 2 && !$('#planType').value) lines.push('* Please Select Plan Type.');
    if (sec >= 3 && !inProposal('#proposerAddress').value) lines.push('* Please Enter Address of the Proposer.');
    if (sec >= 3) lines.push('* Please Upload Signature of Proposer.');
    return lines;
  };
  document.querySelectorAll('#proposal a[data-sec]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const sec = Number(a.dataset.sec);
    show('sec' + sec, true);
    const lines = missingBefore(Math.min(sec, 3));
    if (lines.length) error(lines);
  }));

  inProposal('select[ng-model="OTIProposalFormData.ynHighRisk"]').addEventListener('change', (e) => show('highRiskType', e.target.value === 'Yes'));
  inProposal('#proposerTitle').addEventListener('change', (e) => {
    $('#proposerGender').value = { Mr: 'Male', Master: 'Male', Mrs: 'Female', Miss: 'Female', Others: 'Transgender' }[e.target.value] ?? '';
  });
  $('#proposerPINCode').addEventListener('change', (e) => setTimeout(() => {
    if (/^\\d{6}$/.test(e.target.value)) {
      $('#STATE_CODE1').innerHTML = '<option value="">Select</option><option value="29">KARNATAKA</option>';
      $('#STATE_CODE2').innerHTML = '<option value="">Select</option><option value="1">BENGALURU</option>';
      $('#Village_Code').innerHTML = '<option value="">Select</option><option value="v1">KORAMANGALA</option>';
    }
  }, 500));
  // "Self": the insured's title and name are the proposer's, and locked.
  $('#insuredRelation').addEventListener('change', (e) => {
    const self = e.target.value === 'Self';
    $('#Select2').value = self ? inProposal('#proposerTitle').value : '';
    $('#insuredName').value = self ? inProposal('#proposerName').value : '';
    $('#Select2').disabled = self;
    $('#insuredName').disabled = self;
  });

  $('#checkPremium').addEventListener('click', () => {
    const lines = [];
    if (!$('#insuredPassportNo').value) lines.push('* Please Enter Passport Number.');
    if (!$('#travelStartDate').value) lines.push('* Please Select Travel Start Date.');
    if (lines.length) { error(lines); return; }
    const perDay = { 'PLAN A1': 40, 'PLAN A2': 55, 'PLAN A3': 80, 'PLAN B1': 60, 'PLAN B2': 85, 'PLAN B3': 120, 'PLAN B4': 170 }[$('#planType').value] ?? 0;
    const net = perDay * Number($('#travelNoOfDays').value || 0);
    setTimeout(() => {
      $('#netPremium').value = String(net);
      $('#premiumGst').value = String(Math.round(net * 0.18));
      $('#totalPremium').value = String(net + Math.round(net * 0.18));
    }, 500);
  });
  $('#saveDraft').addEventListener('click', () => { window.__saved = true; });

  // The calendars: « ‹ title › », day buttons, OK.
  const MONTHS = ${MONTHS};
  document.querySelectorAll('.cal').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.cal-pop').forEach((p) => p.remove());
    const target = document.getElementById(button.dataset.for);
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
      if (b.dataset.d) { chosenDay = Number(b.dataset.d); render(); return; }
      if (t === '«') y--; else if (t === '»') y++;
      else if (t === '‹') { m--; if (m < 0) { m = 11; y--; } }
      else if (t === '›') { m++; if (m > 11) { m = 0; y++; } }
      else if (t === 'Cancel') { pop.remove(); return; }
      else if (t === 'OK') {
        if (chosenDay) target.value = String(chosenDay).padStart(2, '0') + '/' + String(m + 1).padStart(2, '0') + '/' + y;
        pop.remove(); return;
      } else return;
      chosenDay = null;
      render();
    });
    document.body.appendChild(pop);
  }));
</script></body></html>`;

const home = `<!doctype html><html><head><meta charset="utf-8"><title>UIIC - Intermediary Portal Home</title></head><body>
  <div><a href="/CustomerAppLive/data/ProposalOTIhome.html#/ProposalFormMainBody" target="_blank">Overseas Travel Insurance E-Proposal Form</a></div></body></html>`;

module.exports = {
  '/GCWebPortal/login/HomeAction.do': home,
  '/CustomerAppLive/data/ProposalOTIhome.html': page,
};
