// Serves the local copy of HDFC ERGO's PIE forms (pie-page.html) at PIE's paths, and of 1up's home
// page (oneup-page.html), which the harness serves from another origin (localhost).
const fs = require('node:fs');
const path = require('node:path');

const PAGE = fs.readFileSync(path.join(__dirname, 'pie-page.html'), 'utf8');
const ONE_UP = fs.readFileSync(path.join(__dirname, 'oneup-page.html'), 'utf8');
const page = () => PAGE;
module.exports = {
  '/WrapperApi/RedirectToDashboardGet': page,
  '/PrivateCar/CreateQuote': page,
  '/TwoWheelerBlaze/CreateQuote': page,
  '/MST/CreateQuote': page,
  '/OptimaSecure/CreateQuote': page,
  '/Travel/CreateQuote': page,
  '/dashBoardScreen': () => ONE_UP,
};
