// Serves the local copy of Niva Bupa's premium calculator (niva-page.html) at /uno/, as UNO does.
const fs = require('node:fs');
const path = require('node:path');

const PAGE = fs.readFileSync(path.join(__dirname, 'niva-page.html'), 'utf8');
module.exports = { '/uno/': () => PAGE };
