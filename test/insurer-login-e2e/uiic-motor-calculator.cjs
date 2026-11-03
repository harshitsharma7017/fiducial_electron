// A local copy of United India's Motor Premium Calculator, built from the recordings and the
// advisor's screenshots of 2 November 2026: the "Choose Cover Type" pop-up, Type of Vehicle and
// Vehicle Class (each class shows its own fields, after a short delay as the portal fetches
// them), two date boxes whose calendars open from an icon next to the box (a different calendar
// style from the health calculator: arrow icons, no «, dates shown as dd-mm-yyyy), Zone, IDV,
// OD Discount, the Personal Accident confirmation and the "Premium Details" table. An ERRORS
// pop-up reports a missing field or an IDV over the limit.
const F = 'motorPolicyData.mtrInitData.NewMotorPolicyForm';
const CLASSES = [
  ['26', '(E-Cart)-Private Carriers'],
  ['25', '(E-Cart)-Public Carriers'],
  ['24', 'E-Rickshaw'],
  ['22', 'Goods Carrying (3-wh and Pedal Cycles)-Private Carriers'],
  ['21', 'Goods Carrying (3-wh and Pedal Cycles)-Public Carriers'],
  ['20', 'Goods Carrying(Other than 3-wh)-Private Carriers'],
  ['19', 'Goods Carrying(Other than 3-wh)-Public Carriers'],
  ['12', 'Miscellaneous And Special Type of Vehicles'],
  ['3', 'Motorcycle / Scooter'],
  ['23', 'Pass Carrying - 2-wh'],
  ['16', 'Pass Carrying - 3-wh (7 <= Carrying <18)'],
  ['8', 'Pass Carrying - 3-wh (Carrying <=6)'],
  ['11', 'Pass Carrying - 4-wh (Carrying > 6), 3-wh (Carrying >18)'],
  ['9', 'Pass Carrying - 4-wh (Carrying <=6)'],
  ['18', 'Private Car'],
];

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Motor Premium Calculator</title>
<style>.hidden{display:none}.modal-content{border:1px solid #888;padding:8px;margin:8px;background:#fff}td{padding:2px}.gj-icon{display:inline-block;width:18px;height:18px}.gj-icon.chevron-left::before{content:'\\2039'}.gj-icon.chevron-right::before{content:'\\203A'}</style></head><body>
<div id="cover" class="modal"><div class="modal-content">
  <h4>Motor Policy</h4><p>Choose Cover Type : Select Policy Type*</p>
  <label><input type="radio" name="pt" ng-model="${F}.policyType" value="1"> Package Policy</label>
  <label><input type="radio" name="pt" ng-model="${F}.policyType" value="2"> Liability Only Policy</label>
  <label><input type="radio" name="pt" ng-model="${F}.policyType" value="21"> StandAlone OD Policy</label>
  <button type="button" name="choosePlan" id="coverOk">Ok</button>
</div></div>

<form id="motor" class="hidden" onsubmit="return false">
  <select ng-model="${F}.businessType"><option value="">Select an Option</option><option value="New">New</option><option value="Renewal">Pre-Owned</option></select>
  <select id="vehicleType" name="vehicleType" ng-model="${F}.vehicleType"><option value="">Select an Option</option>${CLASSES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
  <div id="classFields"></div>
  <!-- As on the live page (3 November 2026 run): gijgo date pickers, the box and a calendar
       add-on in one input group. -->
  <div role="wrapper" class="gj-datepicker gj-datepicker-bootstrap gj-unselectable input-group"><input id="dateOfIssueOfPolicyString" readonly role="input" ng-model="${F}.dateOfIssueOfPolicyString"><span class="input-group-addon" role="right-icon"><i class="gj-icon">&#128197;</i></span></div>
  <div role="wrapper" class="gj-datepicker gj-datepicker-bootstrap gj-unselectable input-group"><input id="dateOfPurchaseString" readonly role="input" ng-model="${F}.dateOfPurchaseString"><span class="input-group-addon" role="right-icon"><i class="gj-icon">&#128197;</i></span></div>
  <select id="vehicleZone" ng-model="${F}.vehicleZone"><option value="? object:null ?"></option><option value="Zone-A">A</option><option value="Zone-B">B</option><option value="Zone-C">C</option></select>
  <div id="idvBox"></div>
  <input type="number" id="odDisc" ng-model="${F}.amtDiscount" value="0">
  <button type="button" name="choosePlan" id="seePremium">Click To See Premium</button>
</form>

<div id="confirm" class="modal hidden"><div class="modal-content"><h4>Confirm</h4><p>Are you sure to continue without "Personal Accident Covers"?</p>
  <button type="button" id="no">NO</button><button type="button" id="yes">YES</button></div></div>
<div id="errors" class="modal hidden"><div class="modal-content"><h4>ERRORS</h4><p id="errText"></p><button type="button" id="errClose">Close</button></div></div>
<div id="premium" class="modal hidden"><div class="modal-content"><h4>Premium Details</h4>
  <table><tr><td>Policy Type</td><td>Premium(Including GST)</td></tr>
  <tr><td>Package Policy (OD+TP and if any add on is selected )</td><td id="amount"></td></tr></table>
  <p>Please note that the premium shown in Premium Calculator is provisional quote premium.</p>
  <button type="button" id="pClose">Close</button></div></div>

<script>
  const $ = (s) => document.querySelector(s);
  const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
  const M = (name) => document.querySelector('[ng-model="${F}.' + name + '"]');
  $('#coverOk').addEventListener('click', () => {
    if (!document.querySelector('input[name=pt]:checked')) return;
    show('cover', false); show('motor', true);
  });

  const BIKE_CC = '<option value="70">Less Than 75 CC</option><option value="150">76-150 CC</option><option value="350">151-350 CC</option><option value="400">Exceeding 350 CC</option>';
  const CAR_CC = '<option value="1000">Upto 1000 CC</option><option value="1500">1001-1500 CC</option><option value="2000">Exceeding 1500 CC</option>';
  const opts = (list) => '<option value="">Select an Option</option>' + list.map((n) => '<option value="string:' + n + '">' + n + '</option>').join('');
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const fieldsFor = (cls, preOwned) => {
    const f = [];
    const isNew = !preOwned;
    if (cls === '18' && isNew) f.push('<select id="lonTermCoverTypeProp" ng-model="${F}.lonTermCoverTypeProp"><option value="">Select an Option</option><option value="string:1">1 Year OD 3 Year Liability</option><option value="string:3">3 Year OD 3 Year Liability</option></select>');
    if (cls === '3' && isNew) f.push('<select id="lonTermCoverTypeProp" ng-model="${F}.lonTermCoverTypeProp"><option value="">Select an Option</option><option value="string:1">1 Year OD 5 Year Liability</option><option value="string:5">5 Year OD 5 Year Liability</option></select>');
    if (cls === '18' || cls === '3') f.push('<label>Is The Vehicle Battery Operated? <input type="checkbox" ng-model="motorPolicyData.fuelcheck"></label>');
    if (cls === '12') f.push('<select id="mvehicleType" ng-model="${F}.makesubcode"><option value="">Select an Option</option><option value="string:1">Agricultural Tractors</option><option value="string:3">Ambulances</option><option value="string:9">Cranes</option></select>');
    if (['24', '11'].includes(cls)) f.push('<input type="number" id="seatingCapacity" ng-model="${F}.regSeatingCapacity">');
    if (cls === '23') f.push('<select id="seatingCapacity" ng-model="${F}.regSeatingCapacity">' + opts(range(1, 2)) + '</select>');
    if (cls === '16') f.push('<select id="seatingCapacity" ng-model="${F}.regSeatingCapacity">' + opts(range(7, 17)) + '</select>');
    if (['8', '9'].includes(cls)) f.push('<select id="seatingCapacity" ng-model="${F}.regSeatingCapacity">' + opts(range(1, 6)) + '</select>');
    if (cls === '11') f.push('<select id="busCategory" ng-model="${F}.busCategory"><option value="">Select</option><option value="Others">Others</option><option value="School Bus">School Bus</option></select>');
    if (['22', '21', '20', '19'].includes(cls)) f.push('<input id="grossWeight" ng-model="${F}.regGrossVehWeight">');
    if (['3', '22', '20', '19'].includes(cls)) f.push('<select id="cubicCapacity" ng-model="${F}.cubicCapacity">' + BIKE_CC + '</select>');
    if (['18', '9'].includes(cls)) f.push('<select id="cubicCapacity" ng-model="${F}.cubicCapacity">' + CAR_CC + '</select>');
    if (cls === '12') f.push('<select id="cubicCapacity" ng-model="${F}.cubicCapacity"><option value="6">Upto 6 HP</option><option value="10">Exceeding 6 HP</option></select>');
    if (preOwned) f.push('<label>Claim? <input type="checkbox" ng-model="motorPolicyData.claimCheck"></label><select id="selectPrevNCB" ng-model="${F}.selectPrevNCB"><option value="">Select</option>' + [0, 20, 25, 35, 45, 50].map((n) => '<option value="' + n + '">' + n + '%</option>').join('') + '</select>');
    return f.join(' ');
  };
  const refreshClass = () => {
    const cls = $('#vehicleType').value;
    const preOwned = M('businessType').value === 'Renewal';
    // As on the portal, the class's fields arrive after a short fetch.
    setTimeout(() => {
      $('#classFields').innerHTML = fieldsFor(cls, preOwned);
      $('#idvBox').innerHTML = cls === '18' ? '<input id="iibAutoRiskIdv" ng-model="${F}.iibAutoRiskIdv">' : '<input id="autoRiskIdv" ng-model="${F}.autoRiskIdv">';
    }, 500);
  };
  $('#vehicleType').addEventListener('change', refreshClass);
  M('businessType').addEventListener('change', refreshClass);

  // The calendar, as gijgo draws it: a navigator of <div role="prev"> (an icon, no text), the
  // period "Month YYYY" and <div role="next">; days are cells with the number in a <div>, and only
  // a click on that <div> picks the day (the cell has no handler). Picking sets dd/mm/yyyy and
  // closes the calendar.
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function calendar(input) {
    document.querySelectorAll('[role=calendar]').forEach((p) => p.remove());
    let y = 2026, m = 10;
    const pop = document.createElement('div');
    pop.setAttribute('role', 'calendar');
    pop.className = 'gj-picker gj-picker-bootstrap datepicker gj-unselectable';
    const render = () => {
      const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<td class="other-month"><div>' + (28 + i) + '</div></td>';
      for (let d = 1; d <= days; d++) cells += '<td class="' + (y === 2026 && m === 10 && d === 2 ? 'today ' : '') + 'gj-cursor-pointer"><div data-d="' + d + '">' + d + '</div></td>';
      pop.innerHTML = '<div role="navigator"><div role="prev"><i class="gj-icon chevron-left"></i></div><div role="period">' + MONTHS[m] + ' ' + y + '</div><div role="next"><i class="gj-icon chevron-right"></i></div></div>' +
        '<table><thead><tr><th>S</th><th>M</th><th>T</th><th>W</th><th>T</th><th>F</th><th>S</th></tr></thead><tbody><tr>' + cells + '</tr></tbody></table>';
    };
    render();
    pop.addEventListener('click', (e) => {
      if (e.target.matches('td > div[data-d]')) {
        input.value = String(e.target.dataset.d).padStart(2, '0') + '/' + String(m + 1).padStart(2, '0') + '/' + y;
        pop.remove(); return;
      }
      if (e.target.closest('[role=prev]')) { m--; if (m < 0) { m = 11; y--; } }
      else if (e.target.closest('[role=next]')) { m++; if (m > 11) { m = 0; y++; } }
      else return;
      render();
    });
    document.body.appendChild(pop);
  }
  document.querySelectorAll('[role=right-icon]').forEach((icon) =>
    icon.addEventListener('click', () => calendar(icon.parentElement.querySelector('input'))));

  $('#seePremium').addEventListener('click', () => {
    const missing = [...document.querySelectorAll('#motor select, #motor input')].filter((el) =>
      el.type !== 'checkbox' && el.id !== 'odDisc' && (!el.value || /^\\?/.test(el.value)));
    const idv = Number(($('#iibAutoRiskIdv') || $('#autoRiskIdv')).value);
    if (missing.length || idv > 50000000) {
      $('#errText').textContent = missing.length ? 'Please fill all mandatory fields (' + missing.length + ').' : 'IDV exceeds the permitted limit.';
      show('errors', true); return;
    }
    show('confirm', true);
  });
  $('#errClose').addEventListener('click', () => show('errors', false));
  $('#yes').addEventListener('click', () => {
    show('confirm', false);
    const idv = Number(($('#iibAutoRiskIdv') || $('#autoRiskIdv')).value);
    const disc = Number($('#odDisc').value) || 0;
    setTimeout(() => { $('#amount').textContent = String(Math.round(idv * 0.0205 * (1 - disc / 100))); show('premium', true); }, 600);
  });
  $('#pClose').addEventListener('click', () => show('premium', false));
</script></body></html>`;

const home = `<!doctype html><html><head><meta charset="utf-8"><title>UIIC - Intermediary Portal Home</title></head><body>
  <div><a href="/CustomerPortalWeb/PremiumCalculator/data/MotorQuote.html#/motorQuote" target="_blank">Motor Premium Calculator</a></div>
  <div><a href="#">Health Policy Premium Calculator</a></div></body></html>`;

module.exports = {
  '/GCWebPortal/login/HomeAction.do': home,
  '/CustomerPortalWeb/PremiumCalculator/data/MotorQuote.html': page,
};
