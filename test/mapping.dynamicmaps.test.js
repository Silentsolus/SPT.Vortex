const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { findMappingForMeta } = require('../index.js').helpers;

function test() {
  const p = path.join(__dirname, '..', 'spt_check_mapping.json');
  const entries = JSON.parse(fs.readFileSync(p, 'utf8'));

  // Case: stage name only
  const hit = findMappingForMeta(entries, null, 'DynamicMaps-1.0.5');
  assert(hit, 'Expected mapping for DynamicMaps stage');
  assert(hit.target === 'com.mpstark.dynamicmaps', `Expected target com.mpstark.dynamicmaps but got ${hit.target}`);

  // Case: displayName present
  const hit2 = findMappingForMeta(entries, { displayName: 'DynamicMaps' }, null);
  assert(hit2 && hit2.target === 'com.mpstark.dynamicmaps');

  console.log('mapping.dynamicmaps.test.js OK');
}

if (require.main === module) test();
module.exports = test;