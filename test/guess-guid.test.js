const assert = require('assert');
const { guessGuidsFromFolderName } = require('../index.js').helpers;

function test() {
  const g = guessGuidsFromFolderName('DrakiaXYZ-GildedKeyStorage-2.0.4');
  console.log('guesses:', g);
  assert(Array.isArray(g));
  assert(g.length > 0);
  console.log('guess-guid.test.js OK');
}

if (require.main === module) test();
module.exports = test;
