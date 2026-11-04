// A local copy of New India's overseas travel quote forms (QuoteNonCustomer.html) and its dashboard,
// built from the recording new-india-2026-11-04T09-43-08-482Z:
//   ?f=se  Overseas Mediclaim (Employment & Studies): destination radios (Area1, Area2), purpose
//          radios (STUDY, EMPMENT), then the plans New India offers for them (radios named Plan:
//          D and D1 for studies, D for employment); leaving date, months (the return date
//          follows), date of birth; Policy Holder Information, Traveller Details, Other Details.
//   ?f=bh  Overseas Mediclaim (Business & Holiday): Travel Details only (destination select E1 or
//          E2, purpose radios), Calculate Premium.
//   ?f=te  Overseas Travel Ease (Business & Holiday): destination radios (WEUC, WIUC), purpose,
//          leaving and return dates, date of birth, Plan select by sum insured; the same sections,
//          with Nature of ID, ID document and the nominee's date of birth.
// Travel Details is open; the other sections are links that toggle, a count after their text. On
// se and te, New India's PAN question shows a moment after the form (unless ?pan=0): No closes it.
// Save & Calculate Premium and Calculate Premium set window.__saved (never to be pressed).
const HEADINGS = {
  se: 'Overseas Mediclaim Insurance Policy (Employment & Studies) Insurance',
  bh: 'Overseas Mediclaim Insurance Policy (Business & Holiday) Insurance',
  te: 'Overseas Travel Ease Policy (Business & Holiday) Insurance',
};
const OCCUPATIONS = [
  ['OTHERS', 'Any Other'],
  ['BUSINESS', 'Business/ Traders'],
  ['PROFESSION', 'Professional / Administrative / Managerial'],
  ['STUDENT', 'Students - School and College'],
];

const radios = (name, list) =>
  list
    .map(
      ([v, t], i) =>
        `<label><input type="radio" id="${name}${i}" name="${name}" value="${v}"> ${t}</label>`,
    )
    .join(' ');
const select = (id, list, placeholder = 'Select') =>
  `<select id="${id}" name="${id}"><option value="">${placeholder}</option>${list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;

const form = (
  f,
  pan,
) => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.modal{border:1px solid #888;padding:8px;background:#fff}</style></head><body>
<h3>${HEADINGS[f]}</h3>
<form onsubmit="return false">
  <div class="panel"><h4><a href="#" data-sec="travel">Travel Details <span>5</span></a></h4><div class="body" id="travel">
    ${
      f === 'bh'
        ? `<select name="TravelDestination"><option value="">Select</option><option value="string:E1">E - 1 CFT - ( Worldwide including USA / Canada)</option><option value="string:E2">E - 2 CFT - ( Worldwide including USA / Canada)</option></select>`
        : radios(
            'TravelDestination',
            f === 'se'
              ? [
                  ['Area1', 'Anywhere in the world excluding USA and Canada'],
                  ['Area2', 'Anywhere in the world including USA and Canada'],
                ]
              : [
                  ['WEUC', 'Worldwide (Excluding USA and Canada)'],
                  ['WIUC', 'Worldwide (Including USA and Canada)'],
                ],
          )
    }
    ${radios(
      'TravelPurpose',
      f === 'se'
        ? [
            ['STUDY', 'Studies'],
            ['EMPMENT', 'Employment'],
          ]
        : [
            ['BUSINESS', 'Business'],
            ['HOLIDAY', 'Holiday'],
          ],
    )}
    <span id="plans"></span>
    <input type="text" id="leavingIndia" name="leavingIndia">
    ${
      f === 'se'
        ? select(
            'travelDuration',
            Array.from({ length: 12 }, (_, i) => [`string:${i + 1}`, String(i + 1)]),
          )
        : ''
    }
    <input type="text" id="returningIndia" name="returningIndia" ${f === 'te' ? '' : 'disabled'}>
    ${f === 'se' ? '' : '<input type="text" id="travelDays" disabled>'}
    <input type="text" id="ompDateOfBirth" name="ompDateOfBirth">
    ${
      f === 'te'
        ? '<select id="Plan" name="Plan"><option value="? undefined:undefined ?"></option>' +
          [
            ['25000', 'Basic ($25,000)'],
            ['50000', 'Economy ($50,000)'],
            ['100000', 'Advanced ($1,00,000)'],
            ['250000', 'Elite ($2,50,000)'],
            ['500000', 'Supreme ($5,00,000)'],
          ]
            .map(([v, t]) => `<option value="${v}">${t}</option>`)
            .join('') +
          '</select>' +
          radios('activeNIAPolExit', [
            ['Y', 'Yes'],
            ['N', 'No'],
          ])
        : ''
    }
  </div></div>
  ${
    f === 'bh'
      ? '<button type="button" class="calc">Calculate Premium</button><button type="button">Save &amp; Continue</button>'
      : `
  <div class="panel"><h4><a href="#" data-sec="holder">Policy Holder Information <span>15</span></a></h4><div class="body hidden" id="holder">
    <label><input type="radio" id="policyHolder1" name="policyHolder" value="newPolicyHolder" ${f === 'se' ? 'checked' : ''}> New Customer</label>
    <label><input type="radio" id="policyHolder2" name="policyHolder" value="existingPolicyHolder"> Existing Customer</label>
    ${select(
      'typeOfOrg',
      ['Dr.', 'Mr.', 'Mrs.', 'Ms.'].map((t) => [`string:${t}`, t]),
      'Select title',
    )}
    <input type="text" id="firstNameCreate"><input type="text" id="middleNameCreate"><input type="text" id="lastNameCreate">
    ${radios('g', [
      ['M', 'Male'],
      ['F', 'Female'],
      ['T', 'Third Gender'],
    ]).replace(/id="g(\d)"/g, 'id="gender$1"')}
    <input type="text" id="dob"><textarea id="buildingNo"></textarea><textarea id="address2"></textarea>
    <input type="text" id="stateInd"><input type="text" id="pincodeInd" disabled>
    <input type="tel" id="mobileInd" maxlength="10"><input type="text" id="landLineNo" maxlength="11"><input type="text" id="emailInd">
    <input type="text" id="eAccount"><input type="text" id="ifscCode"><input type="text" id="bankAccNumber">
  </div></div>
  <div class="panel"><h4><a href="#" data-sec="traveller">Traveller Details <span>6</span></a></h4><div class="body hidden" id="traveller">
    ${select(
      'occupation',
      OCCUPATIONS.map(([v, t]) => [`string:${v}`, t]),
    )}
    <input type="text" id="passport" maxlength="8"><input type="text" id="passportExpDt">
    ${
      f === 'te'
        ? select(
            'natureOfId',
            [
              ['string:Driving LS', 'Driving License'],
              ['string:PAN Card', 'PAN Card'],
              ['string:Passport', 'Passport'],
            ],
            'Select Nature of ID',
          ) +
          '<input type="text" id="propIdDocNo"><input type="text" id="CorrespContact">' +
          radios('sufferingPreExDisease', [
            ['Y', 'Yes'],
            ['N', 'No'],
          ]).replace('value="N"', 'value="N" checked')
        : '<input type="text" id="visaType"><input type="text" id="sponsorName">'
    }
  </div></div>
  <div class="panel"><h4><a href="#" data-sec="other">Other Details <span>2</span></a></h4><div class="body hidden" id="other">
    <input type="text" id="nameOftheNominee">
    ${select(
      'relationshipNominee',
      ['Daughter', 'Father', 'Mother', 'Others', 'Son', 'Spouse'].map((t) => [
        `string:${t.toUpperCase()}`,
        t,
      ]),
    )}
    ${f === 'te' ? '<input type="text" id="nomineeDateOfBirth">' : ''}
  </div></div>
  <button type="button" class="calc">Save &amp; Calculate Premium</button>`
  }
</form>
<div id="pan" class="modal hidden"><h4>Alert Message</h4><p>Do you have PAN Number?</p>
  <label><input type="radio" id="yes" name="partyType" value="Y"> Yes</label><label><input type="radio" id="no" name="partyType" value="N"> No</label>
  <button type="button">Submit</button></div>
<script>
  const F = '${f}';
  const $ = (s) => document.querySelector(s);
  window.__saved = false; window.__toggles = 0;
  document.querySelectorAll('.calc').forEach((b) => b.addEventListener('click', () => { window.__saved = true; }));
  document.querySelectorAll('[data-sec]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); window.__toggles += 1; document.getElementById(a.dataset.sec).classList.toggle('hidden');
  }));
  if (F !== 'bh' && ${pan}) setTimeout(() => $('#pan').classList.remove('hidden'), 500);
  $('#no').addEventListener('change', () => $('#pan').classList.add('hidden'));
  // getTravelPlanDetails: the Employment & Studies plans, once destination and purpose are chosen.
  const plans = () => {
    if (F !== 'se') return;
    const d = document.querySelector('input[name="TravelDestination"]:checked');
    const p = document.querySelector('input[name="TravelPurpose"]:checked');
    if (!d || !p) return;
    const list = p.value === 'STUDY' ? ['D', 'D1'] : ['D'];
    setTimeout(() => { $('#plans').innerHTML = list.map((v, i) => '<label><input type="radio" id="Plan' + i + '" name="Plan" value="' + v + '"> ' + v + '</label>').join(''); }, 400);
  };
  document.querySelectorAll('input[name="TravelDestination"], input[name="TravelPurpose"]').forEach((r) => r.addEventListener('change', plans));
  const parse = (v) => { const m = /^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec(v); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  const fmt = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  const recompute = () => {
    const from = parse($('#leavingIndia').value);
    if (!from) return;
    if (F === 'se' && $('#travelDuration').value) {
      const to = new Date(from); to.setMonth(to.getMonth() + Number($('#travelDuration').value.split(':')[1])); to.setDate(to.getDate() - 1);
      $('#returningIndia').value = fmt(to);
    }
    if (F === 'te') { const to = parse($('#returningIndia').value); if (to) $('#travelDays').value = String(Math.round((to - from) / 86400000) + 1); }
  };
  ['#leavingIndia', '#returningIndia'].forEach((s) => $(s).addEventListener('blur', recompute));
  if (F === 'se') $('#travelDuration').addEventListener('change', recompute);
</script></body></html>`;

// The dashboard: Product Selection, TRAVEL swaps in the Travel Products tiles (the form's heading
// without "Insurance"). Every travel tile first asks New India's pre-existing illness question: No
// and Continue open the form; Yes shows New India's refusal with OK.
const TILES = {
  se: 'Overseas Mediclaim Insurance Policy (Employment & Studies)',
  bh: 'Overseas Mediclaim Insurance Policy (Business & Holiday)',
  te: 'Overseas Travel Ease Policy (Business & Holiday)',
};
const dashboard =
  () => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.tile{display:inline-block;margin:4px;padding:8px;border:1px solid #ccc;cursor:pointer}.caps .tile span{text-transform:uppercase}.modal{border:1px solid #888;padding:8px;background:#fff}</style></head><body>
<h3>Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .</h3>
<div id="products" class="caps"><h3>PRODUCT SELECTION</h3>${['Motor', 'Health', 'Travel'].map((p) => `<div class="tile" ng-click="selectLob('${p}')" data-p="${p}"><span>${p}</span></div>`).join('')}</div>
<div id="travel" class="hidden"><h3>TRAVEL PRODUCTS</h3>${Object.entries(TILES)
    .map(
      ([k, t]) =>
        `<div class="tile" ng-click="selectProduct('${k}')" data-t="${k}"><p>${t}</p></div>`,
    )
    .join('')}</div>
<div id="ask" class="modal hidden"><p>Has any person suffering from pre-existing illness / disease / disability and/or had met with an accident during any time in the past?</p>
  <label><input type="radio" id="healthConfirm1" name="healthConfirm" value="Y"> Yes</label><label><input type="radio" id="healthConfirm2" name="healthConfirm" value="N"> No</label>
  <div><button type="button" id="askContinue">Continue</button></div></div>
<script>
  const $ = (s) => document.querySelector(s);
  let chosen = null;
  $('[data-p="Travel"]').addEventListener('click', () => { $('#products').classList.add('hidden'); $('#travel').classList.remove('hidden'); });
  document.querySelectorAll('[data-t]').forEach((t) => t.addEventListener('click', () => { chosen = t.dataset.t; $('#ask').classList.remove('hidden'); }));
  $('#askContinue').addEventListener('click', () => {
    if (!$('#healthConfirm2').checked) return;
    $('#ask').classList.add('hidden');
    setTimeout(() => { location.href = '/NIABancsPortal/QuoteNonCustomer.html?f=' + chosen; }, 300);
  });
</script></body></html>`;

module.exports = {
  '/NIABancsPortal/QuoteNonCustomer.html': (query) =>
    form(query.get('f') ?? 'te', query.get('pan') === '0' ? 'false' : 'true'),
  '/NIABancsPortal/NonCustomerDashboard.html': () => dashboard(),
};
