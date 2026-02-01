const assert = require('assert');
const idx = require('../index.js');
const { searchWithTerms } = idx.helpers;

async function test() {
  // Stub forgeClient.fuzzySearch to return a known result for 'bigbrain' term
  const orig = idx.helpers.forgeClient.fuzzySearch;
  idx.helpers.forgeClient.fuzzySearch = async (apiKey, term) => {
    if (/bigbrain/i.test(term)) {
      return [{ id: 902, guid: 'xyz.drakia.bigbrain', name: 'BigBrain', slug: 'bigbrain', owner: { name: 'DrakiaXYZ' }, versions: [{ id: 11761, version: '1.4.0', link: 'https://example.com/bigbrain-1.4.0.7z' }] }];
    }
    return [];
  };

  try {
    const modObj = { attributes: { name: 'DrakiaXYZ-BigBrain-1.4.0', author: 'DrakiaXYZ' } };
    const meta = { guid: 'xyz.drakia.bigbrain', version: '1.4.0' };

    const res = await searchWithTerms(modObj, meta, 'DrakiaXYZ-BigBrain-1.4.0', 'fakekey');
    // Should not throw and should return a match object with best and bestScore
    assert(res && res.best && res.best.guid === 'xyz.drakia.bigbrain');
    console.log('searchWithTerms.test.js OK');
  } finally {
    idx.helpers.forgeClient.fuzzySearch = orig;
  }
}

if (require.main === module) test();
module.exports = test;