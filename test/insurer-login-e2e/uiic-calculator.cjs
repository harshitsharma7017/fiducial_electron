// A local copy of United India's Health Policy Premium Calculator, built from the recording of
// 2 November 2026: the same element ids and ng-model names, a calendar with « ‹ › » navigation
// whose days are table cells (other months' days greyed), the Good Health Declaration pop-up, the
// Add Spouse pop-up, an ERRORS pop-up for a sum insured too low for floater cover, and the
// "User Details" pop-up with Check Premium (which the automation must never press).
// Plain script, no framework: it only has to behave like the portal at the points the automation
// touches.
const M = 'healthPolicyData.HealthPolicyFormBean';
const SI = [
  50000, 100000, 150000, 200000, 250000, 300000, 350000, 400000, 450000, 500000, 550000, 600000,
  650000, 700000, 750000, 800000, 850000, 900000, 950000, 1000000, 1500000, 2000000, 2500000,
];

const page = `<!doctype html><html><head><meta charset="utf-8"><title>HEALTH PREMIUM CALCULATOR | UIIC</title>
<style>.modal-content{border:1px solid #888;padding:8px;margin:8px;background:#fff}.hidden{display:none}.text-muted{color:#aaa}td{padding:2px}</style></head><body>
<form name="healthNewQuoteFirstPageForm" onsubmit="return false">
  <input id="policyStartDate" readonly value="03/11/2026"><input id="policyExpiryDate" readonly value="02/11/2027">
  <select id="selectProductType" ng-model="${M}.productType"><option value="">Select</option><option>Base</option><option>Super Topup</option></select>
  <select id="selectCoverType" ng-model="${M}.ynSelectCover"><option value="">Select</option><option value="familyFloater">Floater</option><option value="familyIndividual">Individual</option></select>
  <select id="selectCoverReq" ng-model="${M}.coverRequired"><option value="">Select</option>${SI.map((v) => `<option value="${v}">${v}</option>`).join('')}</select>
  <input id="pincodeString" ng-model="${M}.pincodeString"><input name="pincodeZone" readonly ng-model="${M}.pincodeZone">
  <table><tbody><tr>
    <td><div id="proposerDOBId"><div><div><div><button type="button" class="cal"></button></div></div></div></div><input id="proposerDOBId" readonly placeholder="dd/mm/yyyy"></td>
    <td><input id="proposerAgeId" readonly value="0"></td>
    <td><select data-ng-model="${M}.proposerGender"><option value="">select</option><option>Male</option><option>Female</option><option>Transgender</option></select></td>
    <td><select id="proposerRealtionType"><option>Self</option></select></td>
    <td><select id="proposerMaritalStatus" ng-model="${M}.proposerMaritalStatus"><option value="">Select</option><option>Married</option><option>Unmarried</option><option>Widow/Widower</option><option>Divorcee</option></select></td>
    <td><fieldset><input type="radio" name="ynProposerHyperDiaChol" value="OK">Yes <input type="radio" name="ynProposerHyperDiaChol" value="No">No</fieldset></td>
  </tr><tr id="spouseRow" class="hidden"><td><input id="spouseDOBId" readonly></td></tr></tbody></table>
  <div id="savedChildren"></div>
  <button type="button" id="spouseBtn">Spouse</button><button type="button" id="childrenBtn">Children</button><button type="button">Parent</button>
  <button type="submit" name="proceedstep" id="getQuote">Get Quote</button><button type="button" name="exit">Back</button>
</form>

<div id="goodHealth" class="modal hidden"><div class="modal-content"><p>Good Health Declaration I declare that I/Person(s) proposed for insurance am/are in good health</p><button type="button" id="ghOk">Ok</button></div></div>

<div id="addSpouse" class="modal hidden"><div class="modal-content"><h4>Add Spouse</h4>
  <form name="addSpousePageForm" onsubmit="return false"><table><tbody><tr>
    <td><div id="spouseDOB"><button type="button" class="cal"></button></div><input id="spouseDOB" readonly placeholder="dd/mm/yyyy"></td>
    <td><input id="spouseAgeAgeId" readonly value="0"></td>
    <td><select ng-model="${M}.spouseGender"><option value="">select</option><option>Male</option><option>Female</option><option>Transgender</option></select></td>
    <td><select id="spouseRelationtype" ng-model="${M}.spouseRelationtype"><option value="">select</option><option>Spouse</option></select></td>
    <td><select id="proposerMaritalStatus" ng-model="${M}.spouseMaritalStatus"><option value="? string:0 ?"></option><option value="">select</option><option>Married</option></select></td>
    <td><fieldset><input type="radio" name="ynSpouseHyperDiaChol" value="OK">Yes <input type="radio" name="ynSpouseHyperDiaChol" value="No">No</fieldset></td>
  </tr></tbody></table>
  <button type="button" id="spClose">Close</button><button type="submit" name="accept" id="spSave">Save</button></form>
</div></div>

<div id="addChildren" class="modal hidden"><div class="modal-content"><h4>Add Children</h4>
  <form name="addChildPageForm" onsubmit="return false"><table><tbody id="childRows"></tbody></table>
  <button type="button" id="chClose">Close</button><button type="button" name="addrow" id="addChild">Add Child</button><button type="button" id="chSave">Save</button></form>
</div></div>

<div id="errors" class="modal hidden"><div class="modal-content"><h4>ERRORS</h4><p id="errText"></p><button type="button" name="choosePlan" id="errClose">Close</button></div></div>

<div id="userDetails" class="modal hidden"><div class="modal-content"><h4>User Details</h4>
  Email ID:* <input type="email" name="email"> Mobile No. :* <input name="sideCar">
  <button type="button" name="choosePlan" id="udClose">Close</button><button type="button" name="choosePlan" id="checkPremium">Check Premium</button>
</div></div>

<script>
  const $ = (s) => document.querySelector(s);
  const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
  window.__calls = [];
  $('#pincodeString').addEventListener('change', () => {
    window.__calls.push('getPincodeAndZone');
    setTimeout(() => { if (/^\\d{6}$/.test($('#pincodeString').value)) document.querySelector('input[name=pincodeZone]').value = 'Zone A'; }, 300);
  });
  const ageOf = (d, m, y) => { const t = new Date(2026, 10, 2); let a = t.getFullYear() - y; if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) a--; return a; };

  // The calendar: appended to the body, as the portal's is.
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  // As on the portal, the age shows "0" until the server has worked it out (dobChange), and
  // its answer resets the member's other fields: \`reset\` clears them when the age arrives.
  function openCalendar(input, ageBox, reset) {
    document.querySelectorAll('.cal-pop').forEach((p) => p.remove());
    let y = 2026, m = 10; // November 2026
    const pop = document.createElement('div');
    pop.className = 'cal-pop';
    // As on the portal (2 November 2026 screenshot): the title shares the header row with
    // « ‹ › »; days are buttons in a grid (other months' days greyed with text-muted on the
    // number); choosing a day only highlights it, and OK sets the date and closes.
    let chosen = null;
    const render = () => {
      const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<td><button type="button" class="btn"><span class="text-muted">' + (28 + i) + '</span></button></td>';
      for (let d = 1; d <= days; d++) cells += '<td class="uib-day"><button type="button" class="btn' + (chosen === d ? ' active' : '') + '" data-d="' + d + '"><span>' + d + '</span></button></td>';
      cells += '<td><button type="button" class="btn"><span class="text-muted">1</span></button></td>';
      pop.innerHTML = '<div class="head"><button type="button">«</button><button type="button">‹</button><strong>' + MONTHS[m] + ' ' + y + '</strong><button type="button">›</button><button type="button">»</button></div>' +
        '<table role="grid"><tr>' + cells + '</tr></table>' +
        '<div><button type="button">Cancel</button><button type="button">OK</button></div>';
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
        if (chosen) {
          input.value = String(chosen).padStart(2, '0') + '/' + String(m + 1).padStart(2, '0') + '/' + y;
          window.__calls.push('dobChange');
          const age = String(ageOf(chosen, m + 1, y));
          setTimeout(() => { ageBox.value = age; if (reset) reset(); }, 900);
        }
        pop.remove(); return;
      }
      else return;
      chosen = null;
      render();
    });
    document.body.appendChild(pop);
  }
  const clearAnswers = (root, radioName) => {
    root.querySelectorAll('select').forEach((s) => { if (s.id !== 'proposerRealtionType' && s.id !== 'spouseRelationtype') s.value = ''; });
    root.querySelectorAll('input[name=' + radioName + ']').forEach((r) => { r.checked = false; });
  };
  document.querySelector('[id=proposerDOBId] button').addEventListener('click', () =>
    openCalendar($('input#proposerDOBId'), $('#proposerAgeId'), () => clearAnswers($('#proposerAgeId').closest('tr'), 'ynProposerHyperDiaChol')));
  document.querySelector('[id=spouseDOB] button').addEventListener('click', () =>
    openCalendar($('input#spouseDOB'), $('#spouseAgeAgeId'), () => clearAnswers($('#spouseAgeAgeId').closest('tr'), 'ynSpouseHyperDiaChol')));

  document.querySelectorAll('input[name=ynProposerHyperDiaChol], input[name=ynSpouseHyperDiaChol]').forEach((r) =>
    r.addEventListener('click', () => { if (r.value === 'No') show('goodHealth', true); }));
  $('#ghOk').addEventListener('click', () => show('goodHealth', false));
  $('#spouseBtn').addEventListener('click', () => show('addSpouse', true));
  $('#spClose').addEventListener('click', () => show('addSpouse', false));
  $('#spSave').addEventListener('click', () => {
    const ok = $('input#spouseDOB').value && document.querySelector('select[ng-model="${M}.spouseGender"]').value &&
      $('#spouseRelationtype').value === 'Spouse' && document.querySelector('select[ng-model="${M}.spouseMaritalStatus"]').value === 'Married' &&
      document.querySelector('input[name=ynSpouseHyperDiaChol][value=No]').checked;
    if ($('#spouseAgeAgeId').value === '0') {
      $('#errText').textContent = 'Please select date of birth. Spouse age should not be less than 18 years.';
      show('errors', true); return;
    }
    if (!ok) return;
    $('#spouseDOBId').value = $('input#spouseDOB').value;
    show('spouseRow', true); show('addSpouse', false);
  });
  // Add Children: opens with no rows; Add Child adds one; Save needs every row complete.
  const CM = 'newChild';
  $('#childrenBtn').addEventListener('click', () => show('addChildren', true));
  $('#chClose').addEventListener('click', () => show('addChildren', false));
  // A child row. As on the portal: the age box keeps showing 0 (the age is not shown in the row),
  // and once the date of birth is chosen AngularJS redraws the row: a new element with the date
  // filled in and every other answer empty (any mark on the old row is gone).
  function childRow(dob) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><div id="childDOB"><button type="button" class="cal"></button></div><input id="childDOB" readonly placeholder="dd/mm/yyyy"></td>' +
      '<td><input class="age" ng-model="newChild.age" readonly value="0"></td>' +
      '<td><select ng-model="' + CM + '.gender"><option value="">select</option><option>Male</option><option>Female</option><option>Transgender</option></select></td>' +
      '<td><select ng-model="' + CM + '.relationType"><option value="">select</option><option>Son</option><option>Daughter</option></select></td>' +
      '<td><select ng-model="' + CM + '.maritalStatus"><option value="">Select</option><option>Married</option><option>Unmarried</option><option>Widow/Widower</option><option>Divorcee</option></select></td>' +
      '<td><fieldset><input type="radio" name="ynHyperDiaChol" value="OK">Yes <input type="radio" name="ynHyperDiaChol" value="No">No</fieldset></td>';
    const dobBox = tr.querySelector('input#childDOB');
    dobBox.value = dob;
    tr.querySelector('button.cal').addEventListener('click', () => {
      const before = dobBox.value;
      openCalendar(dobBox, document.createElement('input'));
      // Redraw once the date has changed.
      const watch = setInterval(() => {
        if (!tr.isConnected) { clearInterval(watch); return; }
        if (dobBox.value && dobBox.value !== before) {
          clearInterval(watch);
          setTimeout(() => tr.replaceWith(childRow(dobBox.value)), 300);
        }
      }, 100);
    });
    // Every row's radios share one name (as on the portal), so the browser treats them as one
    // group; like AngularJS, each row keeps its own answer in its model.
    tr.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('click', () => { tr.dataset.health = r.value; if (r.value === 'No') show('goodHealth', true); }));
    return tr;
  }
  $('#addChild').addEventListener('click', () => $('#childRows').appendChild(childRow('')));
  $('#chSave').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#childRows tr')];
    const complete = rows.length > 0 && rows.every((tr) => tr.querySelector('input#childDOB').value &&
      [...tr.querySelectorAll('select')].every((s) => s.value) && tr.dataset.health === 'No');
    if (!complete) { $('#errText').textContent = 'Please enter all details for every child.'; show('errors', true); return; }
    $('#savedChildren').innerHTML = rows.map((tr) => '<input class="savedChild" readonly value="' + tr.querySelector('input#childDOB').value + '|' +
      [...tr.querySelectorAll('select')].map((s) => s.value).join('|') + '">').join('');
    show('addChildren', false);
  });
  $('#getQuote').addEventListener('click', () => {
    if ($('#selectCoverType').value === 'familyFloater' && Number($('#selectCoverReq').value) < 100000) {
      $('#errText').textContent = 'Minimum sum insured for floater cover is 100000.';
      show('errors', true); return;
    }
    const proposerDone = document.querySelector('[data-ng-model="${M}.proposerGender"]').value &&
      document.querySelector('select[ng-model="${M}.proposerMaritalStatus"]').value &&
      document.querySelector('input[name=ynProposerHyperDiaChol][value=No]').checked;
    if (!proposerDone) {
      $('#errText').textContent = "Please select the proposer's gender, marital status and pre-existing disease.";
      show('errors', true); return;
    }
    show('userDetails', true);
  });
  $('#errClose').addEventListener('click', () => show('errors', false));
  $('#checkPremium').addEventListener('click', () => { window.__checkPremium = true; });
</script></body></html>`;

const home = `<!doctype html><html><head><meta charset="utf-8"><title>UIIC - Intermediary Portal Home</title></head><body>
  <div id="page-wrapper"><div><div></div><div></div><div></div><div>
    <div><a href="#">Motor Premium Calculator</a></div>
    <div><a href="/CustomerAppLive/data/HealthPolicyNewQuote.html#/healthQuoteNew" target="_blank">Health Policy Premium Calculator</a></div>
  </div></div></div></body></html>`;

module.exports = {
  '/GCWebPortal/login/HomeAction.do': home,
  '/CustomerAppLive/data/HealthPolicyNewQuote.html': page,
};
