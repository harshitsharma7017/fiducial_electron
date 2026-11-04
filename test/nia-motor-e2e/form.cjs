// A local copy of New India's Private Car and Two Wheeler quote forms (QuoteNonCustomer.html),
// built from the recordings of 4 November 2026: the heading, "Buy insurance for a new vehicle"
// (the vehicle details are drawn after it, as AngularJS does), Year of manufacture, Make (which
// loads its models, so Model stays disabled for a moment), Model and Variant boxes that suggest as
// you type (uib-typeahead style: a list the box names with aria-owns), engine and chassis numbers,
// seating capacity, Type of Private Car, the first-purchase date (a uib-datepicker popup opened by
// a button next to the box), zone, invoice value (which makes the page work the IDV out again, as
// calculateModelIDV does), IDV, colour, body type, previous NCB and fuel.
// ?product=tw shows the Two Wheeler form (no Type of Private Car, no body type, fewer fuels).
// The make "BROKEN" shows New India's "services not available" alert, as seen in the recording.
const OBJ = 'detailQuote.detailQuoteTWPCObj';
const MAKES = [
  ['string:MARUTI', 'MARUTI'],
  ['string:HONDA', 'HONDA'],
  ['string:BROKEN', 'BROKEN'],
];
const MODELS = {
  MARUTI: { SWIFT: ['VXI', 'ZXI'], BALENO: ['DELTA'] },
  HONDA: { ACTIVA: ['STD', 'DLX'] },
  BROKEN: {},
};
const COLOURS = ['A G Metallic', 'Black', 'Pearl White', 'Red', 'Other Color'];
const BODIES = ['Hatch-Back', 'Sedan', 'SUV'];

const page = (
  twoWheeler,
) => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.modal{border:1px solid #888;padding:8px;background:#fff}.dropdown-menu{border:1px solid #999;list-style:none;padding:2px;margin:0}</style></head><body>
<h3>${twoWheeler ? 'Two Wheeler Insurance' : 'Private Car Insurance'}</h3>
<form id="proposalForm" onsubmit="return false">
  <!-- Drawn a moment after the heading, as on the live form (its lists load first). -->
  <div id="newOrRenew"></div>
  <h4><a href="#">Vehicle Details 15</a></h4>
  <div id="vehicle"></div>
  <button type="button" id="calc">Calculate Premium</button>
</form>
<div id="alert" class="modal hidden"><h4>Alert</h4><p>We regret for the inconvenience, presently our services are not available. Please try after sometime.</p><button type="button" id="alertOk">OK</button></div>
<script>
  const TW = ${twoWheeler};
  const OBJ = '${OBJ}';
  const MODELS = ${JSON.stringify(MODELS)};
  const $ = (s) => document.querySelector(s);
  const M = (n) => document.querySelector('[ng-model="' + OBJ + '.' + n + '"]');
  window.__calculated = false;
  $('#calc').addEventListener('click', () => { window.__calculated = true; });
  $('#alertOk').addEventListener('click', () => $('#alert').classList.add('hidden'));
  const select = (model, id, options, placeholder) =>
    '<select id="' + id + '" name="' + id + '" ng-model="' + OBJ + '.' + model + '"><option value="">' + placeholder + '</option>' +
    options.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('') + '</select>';
  const box = (model, id, extra) => '<input type="text" id="' + id + '" name="' + id + '" ng-model="' + OBJ + '.' + model + '" ' + (extra || '') + '>';
  const fuels = TW ? ['Electric', 'Bifuel', 'Diesel', 'Hybrid', 'Petrol'] : ['Electric', 'Bifuel', 'CNG', 'Diesel', 'Hybrid', 'LNG', 'LPG', 'MILD HYBRID', 'Petrol'];
  const vehicleHtml = () => [
    select('manufactureYear', 'manufactureYear', [['number:2026', '2026'], ['number:2025', '2025']], 'Manufacture year'),
    select('vehicleMake', 'vehicleMake', ${JSON.stringify(MAKES)}, 'Select make'),
    '<span>' + box('vehicleModel', 'vehicleModel', 'disabled aria-owns="typeahead-model"') + '</span>',
    '<span>' + box('vehicleVariant', 'variant', 'aria-owns="typeahead-variant"') + '</span>',
    box('engineNo', 'engineNo'), box('chasisNo', 'chasisNo'),
    box('seatingCapacity', 'seatingCapacity', 'maxlength="2"'),
    TW ? '' : '<select id="typePC" ng-model="' + OBJ + '.typePC"><option value="">Select</option><option value="Private">Private Car</option><option value="Motor3">Motorized Three Wheeler with Engine Capacity &lt;1000</option><option value="QUADCY">Quadricycle</option></select>',
    '<p class="input-group">' + box('firstPurchaseDate', 'datefield2', 'readonly') + '<span class="input-group-btn"><button type="button" class="btn btn-default" id="dateBtn"><i class="glyphicon glyphicon-calendar"></i></button></span></p>',
    select('vehicleZone', 'Zone', [['string:A', 'A(Ahmedabad, Bengaluru, Chennai, Hyderabad, Kolkata, Mumbai, New Delhi, Pune)'], ['string:B', 'B(Rest of India)']], 'Select Zone'),
    box('vehInvoiceVal', 'vehInvoiceVal', 'maxlength="10"'), box('vehicleIDV', 'vehicleIDV', 'maxlength="11"'),
    select('vehicleColor', 'vehicleColor', ${JSON.stringify(COLOURS)}.map((c) => ['string:' + c.toUpperCase().replace(/\\s+/g, ''), c]), 'Select vehicle colour'),
    box('colorAsPerRCbook', 'colorAsPerRCbook'),
    TW ? '' : select('bodyType', 'typeOfBody', ${JSON.stringify(BODIES)}.map((b) => ['string:' + b.toUpperCase(), b]), 'Type of body'),
    '<label><input type="radio" id="preNCB0" name="preNCB" value="Y" ng-model="' + OBJ + '.previousNCB"> Yes</label><label><input type="radio" id="preNCB1" name="preNCB" value="N" ng-model="' + OBJ + '.previousNCB"> No</label>',
    select('fuelType', 'fuelType', fuels.map((f) => ['string:' + f, f]), 'Type of fuel'),
  ].join(' ');
  setTimeout(() => {
    $('#newOrRenew').innerHTML =
      '<label><input type="radio" id="newVehicle1" name="newVehicle" value="Y" ng-model="' + OBJ + '.newVehicle"> Buy insurance for a new ' + (TW ? 'vehicle' : 'car') + '</label>' +
      '<label><input type="radio" id="newVehicle2" name="newVehicle" value="N" ng-model="' + OBJ + '.newVehicle"> Renew existing policy from any insurer</label>';
    // AngularJS draws the vehicle details after "new vehicle" is chosen.
    $('#newVehicle1').addEventListener('change', () => setTimeout(() => { $('#vehicle').innerHTML = vehicleHtml(); wire(); }, 300));
  }, 2000);
  // A suggestion list, uib-typeahead style: the box names it (aria-owns); a click on an item's
  // link sets the box.
  const typeahead = (input, listId, choices) => {
    const list = document.createElement('ul');
    list.id = listId; list.className = 'dropdown-menu hidden'; list.setAttribute('role', 'listbox');
    input.parentElement.appendChild(list);
    input.addEventListener('input', () => {
      const typed = input.value.toLowerCase();
      const items = choices().filter((c) => c.toLowerCase().startsWith(typed.slice(0, 2)));
      list.innerHTML = items.map((c) => '<li role="option"><a href="#" data-v="' + c + '">' + c + '</a></li>').join('');
      list.classList.toggle('hidden', items.length === 0);
    });
    list.addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (!a) return;
      e.preventDefault();
      input.value = a.dataset.v; input.dataset.picked = a.dataset.v;
      list.classList.add('hidden');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  function wire() {
    const make = M('vehicleMake');
    make.addEventListener('change', () => {
      const name = make.options[make.selectedIndex].text;
      if (name === 'BROKEN') { $('#alert').classList.remove('hidden'); return; }
      // getModelDetailListUnique: the models arrive a moment later.
      M('vehicleModel').disabled = true;
      setTimeout(() => { M('vehicleModel').disabled = false; }, 600);
    });
    const makeName = () => make.selectedIndex > 0 ? make.options[make.selectedIndex].text : '';
    typeahead(M('vehicleModel'), 'typeahead-model', () => Object.keys(MODELS[makeName()] || {}));
    typeahead(M('vehicleVariant'), 'typeahead-variant', () => (MODELS[makeName()] || {})[M('vehicleModel').value] || []);
    // calculateModelIDV: the invoice value makes the page set the IDV (95%) a moment later.
    M('vehInvoiceVal').addEventListener('change', () => setTimeout(() => {
      M('vehicleIDV').value = String(Math.round(Number(M('vehInvoiceVal').value) * 0.95));
    }, 400));
    $('#dateBtn').addEventListener('click', () => openCalendar(M('firstPurchaseDate')));
  }
  // uib-datepicker popup: « ‹ title › » style header with chevron icons, day buttons "01".."31",
  // days of other months marked text-muted.
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function openCalendar(input) {
    document.querySelectorAll('.uib-datepicker-popup').forEach((p) => p.remove());
    let y = 2026, m = 10;
    const pop = document.createElement('ul');
    pop.className = 'uib-datepicker-popup dropdown-menu';
    const render = () => {
      const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<td><button type="button" class="btn btn-default btn-sm"><span class="text-muted">' + (28 + i) + '</span></button></td>';
      for (let d = 1; d <= days; d++) cells += '<td><button type="button" class="btn btn-default btn-sm" data-d="' + d + '"><span>' + String(d).padStart(2, '0') + '</span></button></td>';
      pop.innerHTML = '<li><table role="grid"><thead><tr><th><button type="button" class="btn btn-default btn-sm pull-left uib-left"><i class="glyphicon glyphicon-chevron-left"></i></button></th>' +
        '<th><button type="button" class="btn btn-default btn-sm uib-title"><strong>' + MONTHS[m] + ' ' + y + '</strong></button></th>' +
        '<th><button type="button" class="btn btn-default btn-sm pull-right uib-right"><i class="glyphicon glyphicon-chevron-right"></i></button></th></tr></thead><tbody><tr>' + cells + '</tr></tbody></table></li>';
    };
    render();
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('uib-left')) { m -= 1; if (m < 0) { m = 11; y -= 1; } render(); return; }
      if (b.classList.contains('uib-right')) { m += 1; if (m > 11) { m = 0; y += 1; } render(); return; }
      if (b.dataset.d) {
        input.value = String(b.dataset.d).padStart(2, '0') + '/' + String(m + 1).padStart(2, '0') + '/' + y;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pop.remove();
      }
    });
    input.parentElement.after(pop);
  }
</script></body></html>`;

// The dashboard, as in the advisor's screenshots of 4 November 2026: Product Selection tiles
// (plain elements with ng-click, text in capitals by CSS), MOTOR swaps them for the Motor Products
// tiles, and a product tile opens its quote form in the same page. ?motor=1 starts with the Motor
// Products tiles shown.
const PRODUCTS = [
  'Miscellaneous',
  'Motor',
  'Health',
  'Travel',
  'Rural',
  'Marine',
  'Personal Accident',
  'Fire',
];
const MOTOR = [
  'Commercial Vehicle',
  'Pay As You Drive Policy for PC',
  'Pay As You Drive Policy for SS',
  'Private Car',
  'Standalone CPA cover',
  'Standalone OD for Motor PC',
  'Standalone OD for Motor TW',
  'Two Wheeler',
];
const dashboard = (
  motor,
) => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.tile{display:inline-block;margin:4px;padding:8px;border:1px solid #ccc;cursor:pointer}.caps .tile span{text-transform:uppercase}</style></head><body>
<h3>Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .</h3>
<div id="products" class="caps${motor ? ' hidden' : ''}"><h3>PRODUCT SELECTION</h3>${PRODUCTS.map((p) => `<div class="tile" ng-click="selectLob('${p}')" data-p="${p}"><img alt=""><span>${p}</span></div>`).join('')}</div>
<div id="motor" class="${motor ? '' : 'hidden'}"><h3>MOTOR PRODUCTS</h3>${MOTOR.map((p) => `<div class="tile" ng-click="selectProduct('${p}')" data-m="${p}"><img alt=""><p>${p}</p></div>`).join('')}</div>
<ul><li><a href="#">Renewals</a></li><li><a href="#">Manage Quotes</a></li></ul>
<script>
  document.querySelector('[data-p="Motor"]').addEventListener('click', () => {
    document.querySelector('#products').classList.add('hidden');
    document.querySelector('#motor').classList.remove('hidden');
  });
  const FORMS = { 'Private Car': '', 'Two Wheeler': '?product=tw' };
  document.querySelectorAll('[data-m]').forEach((t) => t.addEventListener('click', () => {
    const q = FORMS[t.dataset.m];
    if (q !== undefined) setTimeout(() => { location.href = '/NIABancsPortal/QuoteNonCustomer.html' + q; }, 300);
  }));
</script></body></html>`;

module.exports = {
  '/NIABancsPortal/QuoteNonCustomer.html': (query) => page(query.get('product') === 'tw'),
  '/NIABancsPortal/NonCustomerDashboard.html': (query) => dashboard(query.get('motor') === '1'),
};
