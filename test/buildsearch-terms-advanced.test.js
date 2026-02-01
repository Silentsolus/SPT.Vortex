const assert = require('assert');
const idx = require('../index.js');

function mkMetaWithEvidence(guidToken) {
  return { evidence: [{ type: 'dll', guid: guidToken, file: '/fake/path/' + guidToken + '.dll' }] };
}

async function test() {
  const mod = { attributes: { name: 'TaskAutomation-1.2.3' } };
  const meta = mkMetaWithEvidence('btaskautomation.monobehaviours.updatemonobehaviour');
  const terms = idx.helpers.buildSearchTerms(mod, meta, 'TaskAutomation-1.2.3');
  console.log('Generated terms:', terms);
  assert(terms.some(t => /Task Automation/i.test(t)), 'Expected terms to include "Task Automation"');
  assert(terms.some(t => /task-automation/i.test(t)), 'Expected terms to include hyphenated "task-automation"');
  console.log('buildsearch-terms-advanced.test.js OK');
}

if (require.main === module) test();
module.exports = test;