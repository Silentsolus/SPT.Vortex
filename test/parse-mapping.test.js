const assert = require('assert');
const { parseMappingContent } = require('../index.js').helpers;

function test() {
  const txt = `# comment\ncom.some.mod -> some-mod\nSome Mod`;
  const arr = parseMappingContent(txt);
  assert(arr.length >= 2);
  const hasGuid = arr.some(e => e.targetType === 'guid');
  const hasSlug = arr.some(e => e.targetType === 'slug');
  assert(hasGuid && hasSlug);
  console.log('parse-mapping.test.js OK');
}

if (require.main === module) test();
module.exports = test;
