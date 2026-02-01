const assert = require('assert');
const fs = require('fs');
const path = require('path');
const idx = require('../index.js');
const helpers = idx.helpers;

function test() {
  const p = path.join(process.cwd(), 'artifacts', 'checkmods-extracted.json');
  if (!fs.existsSync(p)) {
    console.log('No extracted file found. Run: node tools/parse-checkmods-log.js tools/checkmod.log');
    return;
  }

  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const parsedMatches = data.matches.filter(m => m.matchedGuid);
  console.log(`Found ${parsedMatches.length} parsed matches; testing a sample of up to 40`);

  // Limit the sample for test runtime
  const sample = parsedMatches.slice(0, 40);

  // Keep original function to restore
  const origFuzzy = helpers.forgeClient.fuzzySearch;

  let tested = 0;
  for (const m of sample) {
    const matchedGuid = m.matchedGuid;
    // try to extract a clean localName from context
    let localName = null;
    if (Array.isArray(m.contextLines)) {
      for (const cl of m.contextLines) {
        const mm = /Matching mod:\s*([^\(]+)(?:\(|$)/i.exec(cl);
        if (mm && mm[1]) { localName = mm[1].trim(); break; }
      }
    }
    if (!localName && m.localContext && m.localContext.length < 100) localName = m.localContext;
    if (!localName) localName = (matchedGuid.split('.').pop() || matchedGuid);

    const mod = { attributes: { name: localName, guid: matchedGuid } };
    const meta = { guid: matchedGuid };

    // stub fuzzySearch to always include matched candidate and a distractor
    helpers.forgeClient.fuzzySearch = async (apiKey, term) => {
      const slug = helpers.extractNameFromGuid ? helpers.extractNameFromGuid(matchedGuid) : (matchedGuid.split('.').pop());
      const candidate = { guid: matchedGuid, slug, name: slug.charAt(0).toUpperCase() + slug.slice(1) };
      const distractor = { guid: 'com.distractor.foo', slug: 'foo', name: 'Foo Mod' };
      return [distractor, candidate];
    };

    const res = (async () => {
      return await helpers.searchWithTerms(mod, meta, localName, 'fakekey');
    })();

    // run sync wait
    res.then(r => {
      assert(r && r.best && r.best.guid === matchedGuid, `Expected matched GUID ${matchedGuid} to win for localName='${localName}' (line ${m.line})`);
    }).catch(e => { throw e; });

    tested++;
  }

  // restore
  helpers.forgeClient.fuzzySearch = origFuzzy;

  console.log(`e2e-search-compare.test.js OK (${tested} cases)`);
}

if (require.main === module) test();
module.exports = test;