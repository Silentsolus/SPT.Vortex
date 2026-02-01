const assert = require('assert');
const idx = require('../index.js');

async function test() {
  const mod = { attributes: { name: 'Croupier_2_0_4' }, id: 'croup' };
  const meta = { version: '2.0.4' };

  const termsSeen = [];
  const originalFuzzy = idx.helpers.forgeClient.fuzzySearch;
  idx.helpers.forgeClient.fuzzySearch = async (apiKey, term) => {
    termsSeen.push(term);
    if (/^Croupier$/i.test(term)) {
      return [{ id: 1971, guid: 'com.turbodestroyer.croupier', slug: 'croupier-loadout-generator-flea-quicksell', name: 'Croupier - loadout generator + flea quicksell', owner: { name: 'TurboDestroyer' } }];
    }
    return [];
  };

  try {
    const res = await idx.helpers.searchWithTerms(mod, meta, 'Croupier_2_0_4', 'fakekey');
    console.log('searchWithTerms result:', res && res.best && res.best.guid, 'score=', res && res.bestScore);
    assert(res && res.best && res.best.guid === 'com.turbodestroyer.croupier', 'Expected best match to be Croupier');
    assert(termsSeen.some(t => /^Croupier$/i.test(t)), 'Expected exact Croupier term to be searched');
    console.log('croupier-search.test.js OK');
  } finally {
    idx.helpers.forgeClient.fuzzySearch = originalFuzzy;
  }
}

if (require.main === module) test();
module.exports = test;