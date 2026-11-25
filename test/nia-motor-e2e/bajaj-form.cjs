// A local copy of Bajaj Allianz's partner portal Personal Accident form, as recorded on 25 November
// 2026 (bajaj-allianz-2026-11-25T06-17-21-912Z): Policy Plan (#policy_plan, Bajaj's codes, its options loaded 1.5 seconds after the page shows), Policy
// Tenure (a vue-select: input.vs__search "Policy Tenure*", options "1Y", "2Y …", "3Y …" with their
// discount), Pincode (Bajaj fills City of Proposer and the GST state), Family Income, the member
// (First Name, Gender, Date of Birth dd/mm/yyyy, Gross Monthly Income, Occupation by code), the
// covers' sums insured, and Calculate Premium. The recording did not reach a premium: here Bajaj
// shows "Total Premium ₹ …" (assumed). Its messages are a toast with a "Reference code", as
// recorded: no cover ("Please select atleast one cover between Death/…"), and, for plan 9901,
// "Timeout occurred in getting response". ?dob=readonly: a date of birth box that takes no typing.
// Proceed sets window.__proceeded (never to be pressed by the run). Synthetic data only.

const PLANS = [
  ['9901', 'Personal Accident Insurance Policy (9901)'],
  ['6402', 'Sankat Mochan (6402)'],
  ['6401', 'Loan Care (6401)'],
  ['9991', 'Saral Suraksha Bima - Bajaj General Insurance Limited (9991)'],
  ['8428', 'Global Personal Guard Policy (Individual) (8428)'],
  ['6403', 'Premium Personal Guard (6403)'],
];
const OCCUPATIONS = [
  ['108', 'Persons engaged in administrative functions'],
  ['R', 'Student'],
  ['104', 'IT Professional'],
];

const form = (
  params,
) => `<!doctype html><html><head><meta charset="utf-8"><title>Bajaj General Insurance</title>
<style>.hidden{display:none} #toast{position:fixed;top:10px;right:10px;background:#fdd;padding:8px} li[role=option]{display:block;padding:2px}</style>
</head><body>
<nav><a id="nav-item1">Issue Policy</a></nav>
<h3>Basic Details</h3>
<label for="policy_plan">Policy Plan *</label>
<select id="policy_plan" aria-label="Select Policy Plan"><option value="">Policy Plan *</option></select>
<div id="tenure-field" class="hidden">
  <div id="vs1__combobox" role="combobox" aria-label="Search for option">
    <input class="vs__search" type="search" placeholder="Policy Tenure*" aria-controls="vs1__listbox" />
  </div>
  <ul id="vs1__listbox" role="listbox" class="hidden"></ul>
  <span id="discount"></span>
</div>
<input id="bg_frm_policy_effective_date" placeholder="Proposed Policy Start Date (dd/mm/yyyy) *" value="25/11/2026" />
<label for="pincode">Pincode *</label><input id="pincode" type="text" placeholder="Pincode *" />
<input id="city" type="text" placeholder="City of Proposer *" readonly />
<input id="gst_state" type="text" placeholder="Proposer's GST State *" readonly />
<label for="familyIncome">Family Income*</label><input id="familyIncome" type="text" />
<h3>Member Details</h3>
<input type="radio" id="radioself" name="memberRadioTab" checked class="hidden" /><label for="radioself">Self</label>
<label for="member_firstname0">First Name</label><input id="member_firstname0" type="text" />
<label for="member_gender0">Gender *</label>
<select id="member_gender0"><option value="">Gender *</option><option value="F">Female</option><option value="M">Male</option><option value="T">Transgender</option></select>
<label for="member_dob0">Date of Birth (dd/mm/yyyy)*</label><input id="member_dob0" type="text" ${params.get('dob') === 'readonly' ? 'readonly' : ''} />
<label for="member_income0">Gross Monthly Income * (in ₹)</label><input id="member_income0" type="text" />
<label for="member_occupation0">Occupation *</label>
<select id="member_occupation0"><option value="">Occupation *</option>${OCCUPATIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
<h3>Cover Details *</h3>
<input id="deathSumInsured0" type="text" placeholder="Death Sum Insured (in ₹)" />
<input id="permanentPartialDisabilitySumInsured0" type="text" placeholder="Permanent Partial Disability Sum Insured (in ₹)" />
<input id="permanentTotalDisabilitySumInsured0" type="text" placeholder="Permanent Total Disability Sum Insured (in ₹)" />
<button type="button" id="calculate">Calculate Premium</button>
<div id="result" class="hidden"><p>Total Premium <strong id="total"></strong></p><button type="button" id="proceed">Proceed</button></div>
<div id="toast" class="hidden"><a id="error_toast_close" aria-label="close">×</a> <span id="toast-text"></span></div>
<script>
  const $ = (s) => document.querySelector(s);
  // As on Bajaj: the plans come from its server (getplanlist) a moment after the page shows.
  setTimeout(() => {
    for (const [v, t] of ${JSON.stringify(PLANS)}) $('#policy_plan').add(new Option(t, v));
  }, 1500);
  window.__calculated = 0;
  window.__proceeded = false;
  window.__tenure = '';
  $('#policy_plan').addEventListener('change', () =>
    setTimeout(() => $('#tenure-field').classList.remove('hidden'), 600),
  );
  const TENURES = ['1Y', '2Y 4% discount on total premium', '3Y 8% discount on total premium'];
  const box = $('#vs1__combobox input');
  const list = $('#vs1__listbox');
  const show = () => {
    const typed = box.value.trim().toLowerCase();
    list.replaceChildren(...TENURES.filter((t) => t.toLowerCase().startsWith(typed)).map((t, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = 'vs1__option-' + i;
      li.textContent = t;
      li.addEventListener('mousedown', () => {
        // As vue-select: the choice in .vs__selected beside the box, the box emptied.
        window.__tenure = t.slice(0, 2);
        box.value = '';
        box.placeholder = '';
        const sel = document.createElement('span');
        sel.className = 'vs__selected';
        sel.textContent = window.__tenure;
        $('#vs1__combobox .vs__selected')?.remove();
        $('#vs1__combobox').prepend(sel);
        $('#discount').textContent = t.slice(3);
        list.classList.add('hidden');
      });
      return li;
    }));
    list.classList.remove('hidden');
  };
  box.addEventListener('focus', show);
  box.addEventListener('input', show);
  $('#pincode').addEventListener('input', () => {
    if (/^\\d{6}$/.test($('#pincode').value)) setTimeout(() => {
      $('#city').value = 'AHMEDABAD';
      $('#gst_state').value = 'GUJARAT';
    }, 500);
  });
  const toast = (t) => {
    $('#toast-text').textContent = t + " - Reference code : 'synthetic-ref'";
    $('#toast').classList.remove('hidden');
  };
  $('#error_toast_close').addEventListener('click', () => $('#toast').classList.add('hidden'));
  $('#calculate').addEventListener('click', () => {
    window.__calculated += 1;
    $('#toast').classList.add('hidden');
    setTimeout(() => {
      if ($('#policy_plan').value === '9901') return toast('Timeout occurred in getting response.');
      const sums = ['#deathSumInsured0', '#permanentPartialDisabilitySumInsured0', '#permanentTotalDisabilitySumInsured0']
        .map((s) => Number($(s).value || 0));
      if (!sums.some((n) => n > 0))
        return toast('1. Self: Please select atleast one cover between Death/Permanent Partial Disability/Permanent Total Disability');
      const total = Math.round(sums.reduce((a, b) => a + b, 0) * 0.0012 + 199);
      $('#total').textContent = '₹ ' + total.toLocaleString('en-IN');
      $('#result').classList.remove('hidden');
    }, 800);
  });
  $('#proceed').addEventListener('click', () => { window.__proceeded = true; });
</script>
</body></html>`;

const dashboard =
  () => `<!doctype html><html><head><meta charset="utf-8"><title>Bajaj General Insurance</title></head>
<body><nav><a id="nav-item1">Issue Policy</a></nav><h2>Dashboard</h2></body></html>`;

module.exports = {
  '/': dashboard,
  '/health/IssuePolicy/PersonalAccident': form,
};
