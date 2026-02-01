const assert = require('assert');
const helpers = require('../index.js').helpers;

async function testPickAsset() {
  // Deterministic synthetic mod detail with multiple release shapes
  const modDetail = {
    releases: [
      { assets: [ { url: 'https://example.com/file-1.0.0.txt', name: 'not-archive.txt', size: 100 } ] },
      { assets: [ { url: 'https://github.com/author/mod/releases/download/v1.2.3/mod-1.2.3.zip', name: 'mod-1.2.3.zip', size: 1024 } ] },
      { files: [ { url: 'https://example.com/mod.tgz', name: 'mod.tgz', size: 2048 } ] }
    ],
    assets: [ { url: 'https://cdn.example.com/mod-latest.7z', name: 'mod-latest.7z', size: 4096 } ]
  };

  const cand = helpers.pickAssetFromModDetail ? await helpers.pickAssetFromModDetail(modDetail) : null;
  assert(cand && cand.url, 'Expected candidate URL');
  // With preferExt list (.zip, .7z, .rar, .tar.gz, .tar) the .zip candidate should be chosen over .7z if sizes equal, but we have .7z as largest size; expect .7z
  assert(cand.url.endsWith('.7z') || cand.url.endsWith('.zip'), `Unexpected extension chosen: ${cand.url}`);

  console.log('pick-asset.ci.test.js OK ->', cand.url);
}
if (require.main === module) testPickAsset();
module.exports = testPickAsset;
