const assert = require('assert');
const { fuzzyScorePercent, nameScore } = require('../index.js').helpers;

function test() {
  const f = fuzzyScorePercent('DynamicMaps', 'DynamicMaps');
  assert(f === 100);
  const n = nameScore('DynamicMaps', 'Dynamic Maps');
  console.log('scores:', f, n);
  assert(n > 0.8);
  console.log('fuzzy.test.js OK');
}

if (require.main === module) test();
module.exports = test;
