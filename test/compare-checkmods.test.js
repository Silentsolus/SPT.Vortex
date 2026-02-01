const assert = require('assert');
const fs = require('fs');
const path = require('path');
const helpers = require('../index.js').helpers;

function test() {
  const p = path.join(process.cwd(), 'artifacts', 'checkmods-extracted.json');
  if (!fs.existsSync(p)) {
    console.log('No extracted file found. Run: node tools/parse-checkmods-log.js /path/to/checkmod.log');
    return;
  }

  const data = JSON.parse(fs.readFileSync(p, 'utf8'));

  if (!data.matches || data.matches.length === 0) {
    console.log('No "matches" entries found in extracted data. Parser may need adjustment.');
    return;
  }

  // Only test matches where we successfully parsed a matchedGuid from nearby API request lines
  const parsedMatches = data.matches.filter(m => m.matchedGuid);
  console.log(`Found ${parsedMatches.length} parsed matches to compare`);

  for (const m of parsedMatches) {
    const matchedGuid = m.matchedGuid;

    // Attempt to extract a reasonable local name from context lines (prefer 'Matching mod: NAME' lines)
    let localName = null;
    if (Array.isArray(m.contextLines)) {
      for (const cl of m.contextLines) {
        const mm = /Matching mod:\s*([^\(]+)(?:\(|$)/i.exec(cl);
        if (mm && mm[1]) { localName = mm[1].trim(); break; }
      }
    }
    if (!localName && m.localContext && m.localContext.length < 80) localName = m.localContext;
    if (!localName) localName = helpers.extractNameFromGuid(matchedGuid) || matchedGuid;

    const slug = helpers.extractNameFromGuid(matchedGuid) || (matchedGuid.split('.').pop());
    const results = [
      { guid: 'com.distractor.foo', slug: 'foo', name: 'Foo Mod' },
      { guid: matchedGuid, slug, name: slug.charAt(0).toUpperCase() + slug.slice(1) }
    ];

    const mod = { attributes: { name: localName, guid: matchedGuid } };

    const best = helpers.findBestMatch ? helpers.findBestMatch(mod, results) : null;

    assert(best && best.Result && best.Result.guid === matchedGuid, `Expected matched GUID ${matchedGuid} to win for localName='${localName}' (line ${m.line})`);
  }

  console.log('compare-checkmods.test.js OK');
}

if (require.main === module) test();
module.exports = test;
