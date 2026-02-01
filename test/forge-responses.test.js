const assert = require('assert');
const fs = require('fs');
const path = require('path');
const helpers = require('../index.js').helpers;

function test() {
  const p = path.join(process.cwd(), 'artifacts', 'forge-responses.json');
  if (!fs.existsSync(p)) {
    console.log('No forge responses file found; run tools/parse-checkmods-log.js first. Skipping.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const urls = Object.keys(data);
  if (!urls.length) {
    console.log('No captured responses found in forge-responses.json; skipping tests.');
    return;
  }

  // For each captured response that contains releases/files/assets, ensure we can pick an asset
  let tested = 0;
  for (const url of urls) {
    const arr = data[url];
    for (const r of arr) {
      if (r && (Array.isArray(r.releases) || Array.isArray(r.assets) || Array.isArray(r.files))) {
        const candidate = helpers.pickAssetFromModDetail ? helpers.pickAssetFromModDetail(r) : null;
        assert(candidate && candidate.url, `Expected candidate asset for response at ${url}`);
        tested++;
      }
    }
  }

  console.log(`forge-responses.test.js OK (${tested} cases)`);
}

if (require.main === module) test();
module.exports = test;