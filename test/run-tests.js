const assert = require('assert');
const helpers = require('../index.js').helpers;

function run(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(e.stack || e);
    process.exitCode = 1;
  }
}

run('parseMappingContent basic cases', () => {
  const text = `com.example.mod -> example-mod\nKeyOnly\n{"guid":"com.test.mod","target":"com.test.mod"}`;
  const out = helpers.parseMappingContent(text);
  assert(Array.isArray(out));
  // Should contain either a mapping with raw key 'com.example.mod' or a target equal to 'example-mod'
  assert(out.some(e => e.keyRaw === 'com.example.mod' || e.key === 'com.example.mod' || e.target === 'example-mod'));
  // The JSON object line is treated as a raw line when not provided as a full JSON array,
  // so either a raw entry containing '{"guid"' should exist, or a parsed target 'com.test.mod'.
  assert(out.some(e => /\{\s*"guid"/.test(String(e.raw)) || String(e.target) === 'com.test.mod'));
});

run('parseMappingContent JSON array', () => {
  const text2 = '[{"guid":"com.test.mod","target":"com.test.mod"}]';
  const out2 = helpers.parseMappingContent(text2);
  assert(Array.isArray(out2));
  assert(out2.some(e => String(e.target) === 'com.test.mod'));
});

run('guessGuidsFromFolderName basic', () => {
  const guesses = helpers.guessGuidsFromFolderName('Author-ModName-1.2.3');
  assert(Array.isArray(guesses) && guesses.length > 0, 'expected at least one guess');
  assert(guesses[0].startsWith('com.'), 'expected guess to start with com.');
});

run('fuzzyScorePercent sanity', () => {
  const s = helpers.fuzzyScorePercent('TyfonUIFixes', 'TyfonUIFixes');
  assert(s === 100);
  const s2 = helpers.fuzzyScorePercent('Tyfon-UI-Fixes', 'tyfonuifixes');
  assert(s2 >= 80, 'expected strong match');
});

console.log('\nAll tests executed.');

// Run integration tests
require('./integration-extraction.test.js');
require('./enrich.integration.test.js');
require('./download-import.integration.test.js');
require('./download-verify.integration.test.js');
require('./download-retry.integration.test.js');
require('./download-resume.integration.test.js');
require('./download-jitter.integration.test.js');
