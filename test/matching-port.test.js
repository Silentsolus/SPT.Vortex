const assert = require('assert');
const { findBestMatch, MatchingConstants } = require('../index.js').helpers;

function test() {
  const mod = { attributes: { name: 'BotCallsigns_v2.0.3', owner: 'HarmonyZT' } };
  const results = [
    { id: 1, guid: 'com.some.other', slug: 'other', name: 'Other' },
    { id: 2, guid: 'com.harmonyzt.botcallsigns', slug: 'botcallsigns', name: 'BotCallsigns', owner: { name: 'HarmonyZT' } }
  ];

  const m = findBestMatch(mod, results);
  assert(m && m.Result && m.Result.guid === 'com.harmonyzt.botcallsigns');
  // Expect confidence to be at least around the minimum thresholds (sanity check)
  assert(m.Confidence >= MatchingConstants.MinimumFuzzyMatchScore);
  console.log('matching-port.test.js OK');
}

if (require.main === module) test();
module.exports = test;
