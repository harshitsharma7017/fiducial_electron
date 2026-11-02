// Synthetic copies of the insurer sign-in forms recorded on 2 November 2026 (read-only
// inspection: same ids, names, input types and framework behaviour; no insurer content), plus
// pages that must make the agent refuse. Every page records, in the main world, the input events
// it saw, any submit and any button click, so the harness can prove nothing was submitted.

const RECORDER = `
<script>
  window.__seen = { input: [], change: [], submit: 0, click: 0 };
  document.addEventListener('input', (e) => window.__seen.input.push(e.target.id || e.target.name || e.target.className), true);
  document.addEventListener('change', (e) => window.__seen.change.push(e.target.id || e.target.name || e.target.className), true);
  document.addEventListener('submit', (e) => { window.__seen.submit += 1; e.preventDefault(); }, true);
  document.addEventListener('click', (e) => { if (e.target.closest('button, input[type=submit]')) window.__seen.click += 1; }, true);
</script>`;

const page = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${RECORDER}${body}</body></html>`;

/** Like Angular's reactive forms: the model follows input events only. */
const MODEL_FROM_INPUT = `
<script>
  window.__model = {};
  for (const el of document.querySelectorAll('input')) {
    el.addEventListener('input', () => { window.__model[el.getAttribute('formcontrolname') || el.name || el.id] = el.value; });
  }
</script>`;

module.exports = {
  // United India: classic form POST, image CAPTCHA, a hidden second password input.
  '/GCWebPortal/login/LoginAction.do': page(
    'UIIC - Intermediary Portal',
    `<form id="loginForm" name="LoginFormBean" action="/GCWebPortal/login/LoginAction.do" method="POST">
      <input type="text" id="username" name="userName" maxlength="20" autocomplete="off" readonly="readonly">
      <input type="password" id="password" name="userPaWord" maxlength="20" autocomplete="off" readonly="readonly">
      <img id="captchaImg" alt="" width="120" height="40">
      <input type="text" id="userCaptcha" name="userCaptcha" placeholder="Enter Captcha" maxlength="6">
      <input type="password" id="pwaStatus" name="pwaStatus" style="display:none">
      <input type="hidden" id="ynCaptcha" name="ynCaptcha">
      <button class="login100-form-btn">LOGIN</button>
    </form>
    <script>
      // As the live page (2 November 2026): read-only until focused, against browser autofill.
      ['username', 'password'].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener('focus', () => field.removeAttribute('readonly'));
      });
    </script>${MODEL_FROM_INPUT}`,
  ),

  // New India: AngularJS form, Google reCAPTCHA (represented by an empty frame).
  '/NIABancsPortal/IntermediaryLogin.html': page(
    'The New India Assurance Co. Ltd.',
    `<form name="loginForm">
      <label for="userName">Username</label><input type="text" id="userName" name="userName" maxlength="50">
      <label for="password">Password</label><input type="password" id="password" name="password">
      <iframe title="recaptcha" src="about:blank" width="300" height="80"></iframe>
      <textarea id="g-recaptcha-response" name="g-recaptcha-response" style="display:none"></textarea>
      <button class="ncr_lp-btn">Login</button>
    </form>${MODEL_FROM_INPUT}`,
  ),

  // ICICI Lombard: Angular single-page app; the form is drawn 1.5 s after load.
  '/icici/': page(
    'NYSA - ICICI Lombard',
    `<div id="app"></div>
    <script>
      setTimeout(() => {
        document.getElementById('app').innerHTML =
          '<form><input type="text" name="username" formcontrolname="username" placeholder="Username">' +
          '<input type="password" name="password" formcontrolname="password" placeholder="Password">' +
          '<canvas width="80" height="30"></canvas>' +
          '<input type="text" name="captcha" formcontrolname="captcha" placeholder="Enter Captcha" maxlength="2">' +
          '<button type="submit" class="cstmbtn">LOGIN</button></form>';
        window.__model = {};
        for (const el of document.querySelectorAll('input')) {
          el.addEventListener('input', () => { window.__model[el.getAttribute('formcontrolname')] = el.value; });
        }
      }, 1500);
    </script>`,
  ),

  // Niva Bupa: Ionic; native inputs inside custom elements, a hidden radio-group input.
  '/uno/': page(
    'UNO',
    `<form>
      <input type="hidden" name="ion-rg-0" class="aux-input">
      <ion-input><label for="ion-input-0">User name</label><input type="text" id="ion-input-0" name="ion-input-0" class="native-input sc-ion-input-md"></ion-input>
      <ion-input><label for="ion-input-1">Password</label><input type="password" id="ion-input-1" name="password" class="native-input sc-ion-input-md"></ion-input>
      <button type="button">LOGIN</button>
    </form>${MODEL_FROM_INPUT}`,
  ),

  // Bajaj Allianz: Keycloak.
  '/auth/realms/Bagic/protocol/openid-connect/auth': page(
    'Log in to Bagic',
    `<form id="kc-form-login" action="/auth/realms/Bagic/login-actions/authenticate" method="post">
      <label for="username">Username</label><input type="text" id="username" name="username" class="user">
      <label for="password">Password</label><input type="password" id="password" name="password" class="pwd">
      <input type="checkbox" id="rememberMe" name="rememberMe">
      <input type="submit" id="kc-login" name="login" value="Sign In">
    </form>${MODEL_FROM_INPUT}`,
  ),

  // Refusals.
  '/ambiguous': page(
    'two user fields',
    `<form><input type="text" id="username"><input type="text" id="username" name="u2">
     <input type="password" id="password"></form>`,
  ),
  '/wrong-type': page(
    'password field is plain text',
    `<form><input type="text" id="username"><input type="text" id="password"></form>`,
  ),
  '/readonly-locked': page(
    'boxes locked for good',
    `<form><input type="text" id="username" readonly><input type="password" id="password" readonly></form>`,
  ),
  '/advisor-typed': page(
    'advisor already typed a user ID',
    `<form><input type="text" id="username" value="TYPED.BY.ADVISOR"><input type="password" id="password"></form>`,
  ),
  '/no-form': page('no sign-in form', `<p>Dashboard</p>`),
};
