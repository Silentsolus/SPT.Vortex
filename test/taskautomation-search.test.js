const assert = require('assert');
const idx = require('../index.js');

async function test() {
  const mod = { attributes: { name: 'TaskAutomation-1.2.3' }, id: 'ta' };
  const meta = { evidence: [{ type: 'dll', guid: 'btaskautomation.monobehaviours.updatemonobehaviour' }], version: '1.2.3' };

  const termsSeen = [];
  const originalFuzzy = idx.helpers.forgeClient.fuzzySearch;
  idx.helpers.forgeClient.fuzzySearch = async (apiKey, term) => {
    termsSeen.push(term);
    if (/task automation/i.test(term)) {
      return [{ id: 223, guid: 'com.knotscripts.taskautomation', slug: 'task-automation', name: 'Task Automation', owner: { name: 'KnotScripts' }, teaser: 'desc' }];
    }
    return [];
  };

  try {
    const res = await idx.helpers.searchWithTerms(mod, meta, 'TaskAutomation-1.2.3', 'fakekey');
    console.log('searchWithTerms result:', res && res.best && res.best.guid, 'score=', res && res.bestScore);
    assert(res && res.best && res.best.guid === 'com.knotscripts.taskautomation', 'Expected best match to be TaskAutomation');
    assert(termsSeen.length > 0, 'Expected fuzzySearch to be called at least once');
    assert(termsSeen.some(t => /task automation/i.test(t)), 'Expected Task Automation term to be searched');
    console.log('taskautomation-search.test.js OK');
  } finally {
    idx.helpers.forgeClient.fuzzySearch = originalFuzzy;
  }
}

if (require.main === module) test();
module.exports = test;