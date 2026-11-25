// Serves the local copy of HDFC ERGO's PIE forms (pie-page.html) at PIE's paths, and of 1up's home
// page (oneup-page.html), which the harness serves from another origin (localhost).
const fs = require('node:fs');
const path = require('node:path');

const PAGE = fs.readFileSync(path.join(__dirname, 'pie-page.html'), 'utf8');
const ONE_UP = fs.readFileSync(path.join(__dirname, 'oneup-page.html'), 'utf8');
// ?hang=1: the page keeps loading (a frame whose server never answers), as PIE may.
const page = (params) =>
  params?.get('hang') === '1'
    ? PAGE.replace('</body>', '<iframe src="/hang" style="display:none"></iframe></body>')
    : PAGE;
// PIE's sign-in redirect page, reached from 1up (?data=…): it sends the tab on by itself to the
// product pressed there (Private Car) a second later, as recorded on 5 November 2026.
const redirect = (params) =>
  params?.get('data')
    ? page(params).replace(
        '</body>',
        "<script>setTimeout(() => { location.href = '/PrivateCar/CreateQuote'; }, 1000);</script></body>",
      )
    : page(params);
module.exports = {
  '/WrapperApi/RedirectToDashboardGet': redirect,
  '/PrivateCar/CreateQuote': page,
  '/TwoWheelerBlaze/CreateQuote': page,
  '/MST/CreateQuote': page,
  '/OptimaSecure/CreateQuote': page,
  '/Travel/CreateQuote': page,
  '/dashBoardScreen': () => ONE_UP,
};
