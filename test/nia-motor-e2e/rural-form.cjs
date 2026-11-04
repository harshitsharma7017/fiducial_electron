// A local copy of New India's rural quote forms (QuoteNonCustomer.html) and its dashboard, built
// from the recording new-india-2026-11-04T09-57-52-227Z. Sections are links that toggle, a count
// after their text; all start closed.
//   ?f=ct  Cattle Insurance: New Quote/Policy issuance (which brings New India's PAN question),
//          Policy Details (scheme, claim ratio: a box whose id has a space), Animal Details
//          (Cattle, Calf Heifer Insurance), Policy Holder Information.
//   ?f=fp  Farmers Package Insurance: the PAN question on load; Policy Period (start date), Risk
//          Details, Fire Allied Perils Earthquake (SC), Policy Holder Information.
//   ?f=bl  Livestock, BLDA scheme (no heading): Policy Details (scheme, claim ratio, beneficiary),
//          Animal Details: one row per animal (Add Animal), the kind's own fields drawn when the
//          kind is chosen; "Policy holder information" in its other version (other ids).
//   ?f=ns  Cattle, Non-scheme (no heading): Insured Details: scheme and one row per head of cattle
//          (Add Cattle).
// On fp, bl and ns the PAN question shows a moment after the form unless ?pan=0. No closes it.
// Save & Calculate Premium sets window.__saved (never to be pressed).
const sel = (id, options, extra = '') =>
  `<select id="${id}" name="${id}" ${extra}><option value="">Select</option>${options.map((o) => `<option value="string:${o}">${o}</option>`).join('')}</select>`;
const section = (title, count, id, body) =>
  `<div class="panel"><h4><a href="#" data-sec="${id}">${title}${count ? ` <span>${count}</span>` : ''}</a></h4><div class="body hidden" id="${id}">${body}</div></div>`;
const holder = (other) =>
  other
    ? section('Policy holder information', 10, 'holder', '<input type="text" id="phFirstName">')
    : section(
        'Policy Holder Information',
        11,
        'holder',
        `<label><input type="radio" id="policyHolder1" name="policyHolder" value="newPolicyHolder"> New</label>
         <label><input type="radio" id="policyHolder2" name="policyHolder" value="existingPolicyHolder"> Existing</label>
         ${sel('typeOfOrg', ['Mr.', 'Mrs.', 'Ms.'])}
         <input type="text" id="firstNameCreate"><input type="text" id="middleNameCreate"><input type="text" id="lastNameCreate">
         ${['M', 'F', 'T'].map((v, g) => `<label><input type="radio" id="gender${g}" name="g" value="${v}"> ${v}</label>`).join('')}
         <input type="text" id="dob"><textarea id="buildingNo"></textarea><input type="tel" id="mobileInd"><input type="text" id="emailInd">`,
      );

const CATTLE_BLDA = [
  'Buffaloes',
  'Bullocks (Castrated Bulls and Castrated Male Buffaloes)',
  'Bulls',
  'Calves/Heifers',
  'Mitch Buffaloes',
  'Mitch Cows',
  'Mithuns',
  'Stud Bulls (Cow and Buffalo)',
];
const CATTLE_NS = [
  'Buffaloes',
  'Bullocks (Castrated bulls & Castrated male buffaloes)',
  'Milch Buffaloes',
  'Milch Cows',
  'Stud Bulls (Cow & Buffalo)',
];

const body = (f) => {
  if (f === 'ct')
    return `<h3>Cattle Insurance</h3>
      <label><input type="radio" id="checkPolicy1" name="checkPolicy1" value="Y"> New Quote/Policy issuance</label>
      <label><input type="radio" id="checkPolicy2" name="checkPolicy2" value="N"> Addition of Animals in existing policy</label>
      ${holder(false)}
      ${section('Policy Period', 0, 'period', '<input type="text" name="fromDate" disabled>')}
      ${section('Policy Details', 2, 'details', sel('Scheme', ['Bank Financed', 'Corporate/Co-operative Dairies', 'Individual Owner']) + '<input type="text" id="Claim Ratio" name="Claim Ratio">')}
      ${section('Animal Details', 0, 'animals', '<label><input type="checkbox" id="cattleCheck"> Cattle</label><label><input type="checkbox" id="calfCheck"> Calf Heifer Insurance</label>')}`;
  if (f === 'fp')
    return `<h3>Farmers Package Insurance Insurance</h3>
      ${holder(false)}
      ${section('Policy Period', 0, 'period', '<input type="text" id="policyStartDate">')}
      ${section(
        'Risk Details',
        6,
        'risk',
        `<input type="text" id="preExistingIllness"><input type="text" id="nomineeName">
         ${sel('nomineeRelationship', ['Any other', 'Brother', 'Daughter', 'Father', 'Mother', 'Sister', 'Son', 'Spouse'])}
         <textarea id="addressOfNominee"></textarea><input type="text" id="sumInsuredDwelling"><input type="text" id="sumInsuredContents">
         <select id="excess">${['0', '1', '3', '5', '10'].map((x) => `<option value="string:${x}">${x}</option>`).join('')}</select>`,
      )}
      ${section(
        'Fire Allied Perils Earthquake (SC)',
        4,
        'fire',
        `<input type="text" id="identificationNo"><textarea id="locationDwelling"></textarea><textarea id="descriptionDwelling"></textarea>
         <label><input type="radio" id="katchaConst0" name="katcha" value="Y"> Yes</label><label><input type="radio" id="katchaConst1" name="katcha" value="N" checked> No</label>
         <textarea id="descriptionContents"></textarea>`,
      )}
      ${section('Additional Coverages (Optional)', 0, 'extra', '<input type="checkbox" id="bioGas">')}`;
  if (f === 'bl')
    return `${holder(true)}
      ${section('Policy Period', 0, 'period', '<input type="text" id="fromDate" disabled>')}
      ${section(
        'Policy Details',
        2,
        'details',
        `<label><input type="radio" id="PolicyType1" name="Type" value="NONSCM" disabled> Non-scheme</label>
         <label><input type="radio" id="PolicyType2" name="Type" value="SCM" checked> Scheme</label>
         ${sel('Scheme', ['BLDA Scheme'])}<input type="text" name="claimRatio">${sel('Beneficiary', ['GEN', 'OBC', 'BPL', 'SC', 'ST'])}`,
      )}
      ${section('Animal Details', 7, 'animals', '<div id="rows"></div><button type="button" id="add">Add Animal</button>')}`;
  return `${holder(true)}
      ${section('Policy Period', 0, 'period', '<input type="text" id="fromDate" disabled>')}
      ${section(
        'Insured Details',
        13,
        'insured',
        `<label><input type="radio" id="PolicyType1" name="PolicyType1" value="NONSCM" checked> Non-scheme</label>
         <label><input type="radio" id="PolicyType2" name="Type" value="SCM" disabled> Scheme</label>
         ${sel('Scheme', ['Bank Financed', 'Cooperative Diaries', 'Corporate Diaries', 'Private Diaries', 'Others'])}
         <div id="rows"></div><button type="button" id="add">Add Cattle</button>`,
      )}
      <label><input type="checkbox" name="acceptTerms1"> Declaration</label>`;
};

const form = (
  f,
  pan,
) => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.modal{border:1px solid #888;padding:8px;background:#fff}</style></head><body>
<form onsubmit="return false">${body(f)}<button type="button" id="save">Save &amp; Calculate Premium</button></form>
<div id="pan" class="modal hidden"><h4>Alert Message</h4><p>Do you have PAN Number?</p>
  <label><input type="radio" id="yes" name="partyType" value="Y"> Yes</label><label><input type="radio" id="no" name="partyType" value="N"> No</label>
  <button type="button">Submit</button></div>
<script>
  const F = '${f}';
  const $ = (s) => document.querySelector(s);
  window.__saved = false; window.__toggles = 0;
  $('#save').addEventListener('click', () => { window.__saved = true; });
  document.querySelectorAll('[data-sec]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); window.__toggles += 1; document.getElementById(a.dataset.sec).classList.toggle('hidden');
  }));
  const ask = () => $('#pan').classList.remove('hidden');
  $('#no').addEventListener('change', () => $('#pan').classList.add('hidden'));
  if (F === 'ct') $('#checkPolicy1').addEventListener('change', () => setTimeout(ask, 300));
  else if (${pan}) setTimeout(ask, 500);
  const opts = (list) => '<option value="">Select</option>' + list.map((o) => '<option value="string:' + o + '">' + o + '</option>').join('');
  const CB = ${JSON.stringify(CATTLE_BLDA)}, CN = ${JSON.stringify(CATTLE_NS)};
  let rows = 0;
  const addRow = () => {
    const i = rows++;
    const d = document.createElement('div'); d.className = 'row';
    const g = ['M', 'F', 'T'].map((v, k) => '<label><input type="radio" id="cgender' + k + i + '" name="cgender' + i + '" value="' + v + '"> ' + v + '</label>').join('');
    if (F === 'bl') {
      d.innerHTML = '<select name="typeOfAnimal' + i + '">' + opts(['Cattle', 'Horse Donkey Pony Mule Yak', 'Camel', 'Pig', 'Sheep & Goat', 'Rabbit']) + '</select>' +
        '<select name="originType' + i + '">' + opts(['Cross Breed', 'Exotic', 'Indigeneous']) + '</select>' + g +
        '<input name="breed' + i + '"><input name="AgeinYrs' + i + '"><input name="AgeinMths' + i + '"><textarea name="divproposerID' + i + '"></textarea><span class="kind"></span>' +
        '<input name="MarkectValue' + i + '"><input name="mpsumInsured' + i + '"><textarea name="locationOfStable' + i + '"></textarea>';
      const kind = d.querySelector('.kind');
      d.querySelector('select').addEventListener('change', (e) => {
        const k = e.target.value.slice(7);
        kind.innerHTML = k === 'Cattle'
          ? '<select name="typeOfCattle' + i + '">' + opts(CB) + '</select><input name="TagNumber' + i + '"><textarea name="purpose' + i + '"></textarea>'
          : k === 'Sheep & Goat'
            ? '<select name="typeOfRiskSheepAndGoat' + i + '">' + opts(['Goat', 'Sheep']) + '</select><textarea name="purposeOfSheepGoat' + i + '"></textarea><textarea name="registrationNo' + i + '"></textarea>'
            : k === 'Horse Donkey Pony Mule Yak'
              ? '<select name="typeOfHDPMY' + i + '">' + opts(['Donkey', 'Horse', 'Mule', 'Pony', 'Yak']) + '</select><textarea name="purposeOfCamelPig' + i + '"></textarea>'
              : '<textarea name="detailsOfAnimal' + i + '"></textarea><textarea name="purposeOfCamelPig' + i + '"></textarea>';
      });
    } else {
      d.innerHTML = '<select id="typeOfRiskForCattle' + i + '">' + opts(CN) + '</select>' + g.replace(/name="cgender\\d+"/g, (m, o) => m) +
        '<input id="AgeinYrs' + i + '"><input id="AgeinMths' + i + '"><select id="originType' + i + '">' + opts(['Indigenous', 'Cross Breed', 'Exotic']) + '</select>' +
        '<input id="breed' + i + '"><textarea id="purpose' + i + '"></textarea><input id="TagNumber' + i + '"><input id="fitnessCertificateDate' + i + '"><input id="ycMarkectValue' + i + '"><input id="ycsumInsured' + i + '" disabled>';
    }
    $('#rows').appendChild(d);
  };
  if (F === 'bl' || F === 'ns') { addRow(); $('#add').addEventListener('click', addRow); }
</script></body></html>`;

// The dashboard: Product Selection, RURAL swaps in the Rural Products tiles. Only the two tiles the
// recording names are drawn with their names; the other two forms' tiles were not recorded.
const TILES = { ct: 'Cattle', fp: 'Farmers Package Insurance' };
const dashboard =
  () => `<!doctype html><html><head><meta charset="utf-8"><title>The New India Assurance Co. Ltd.</title>
<style>.hidden{display:none}.tile{display:inline-block;margin:4px;padding:8px;border:1px solid #ccc;cursor:pointer}.caps .tile span{text-transform:uppercase}</style></head><body>
<h3>Welcome, FIDUCIAL INSURANCE BROKERS INDIA PVT. LTD .</h3>
<div id="products" class="caps"><h3>PRODUCT SELECTION</h3>${['Motor', 'Health', 'Rural'].map((p) => `<div class="tile" ng-click="selectLob('${p}')" data-p="${p}"><span>${p}</span></div>`).join('')}</div>
<div id="rural" class="hidden"><h3>RURAL PRODUCTS</h3>${Object.entries(TILES)
    .map(
      ([k, t]) =>
        `<div class="tile" ng-click="selectProduct('${k}')" data-r="${k}"><p>${t}</p></div>`,
    )
    .join('')}</div>
<script>
  const $ = (s) => document.querySelector(s);
  $('[data-p="Rural"]').addEventListener('click', () => { $('#products').classList.add('hidden'); $('#rural').classList.remove('hidden'); });
  document.querySelectorAll('[data-r]').forEach((t) => t.addEventListener('click', () => {
    setTimeout(() => { location.href = '/NIABancsPortal/QuoteNonCustomer.html?f=' + t.dataset.r; }, 300);
  }));
</script></body></html>`;

module.exports = {
  '/NIABancsPortal/QuoteNonCustomer.html': (query) =>
    form(query.get('f') ?? 'ct', query.get('pan') === '0' ? 'false' : 'true'),
  '/NIABancsPortal/NonCustomerDashboard.html': () => dashboard(),
};
