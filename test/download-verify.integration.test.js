const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const idx = require('../index.js');

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-download-verify-'));
  const staging = tmp;
  const sampleFile = path.join(tmp, 'sample-asset.zip');
  fs.writeFileSync(sampleFile, 'fake-zip-content');

  // Compute sha256 of sample
  const sha = crypto.createHash('sha256').update('fake-zip-content').digest('hex');
  const size = fs.statSync(sampleFile).size;

  // Mock Vortex api and store
  const actions = [];
  const state = {
    settings: {
      mods: {
        stagingPath: { eftsptaki: staging }
      }
    },
    sptvortex: {},
    persistent: { mods: {} }
  };

  const api = {
    store: {
      getState: () => state,
      dispatch: (a) => { actions.push(a); }
    },
    showDialog: async () => ({ action: 'OK' }),
    sendNotification: () => {},
    showNotification: () => {}
  };

  // Stub downloadAsset to copy our sample file to the requested dest
  const originalDownload = idx.helpers.downloadAsset;
  idx.helpers.downloadAsset = async function (url, dest) {
    await fsPromises.copyFile(sampleFile, dest);
    return true;
  };

  // Stub forgeClient.getModDetail to return asset metadata
  const fakeDetail = {
    id: 1,
    name: 'Test Mod',
    releases: [
      { files: [ { filename: 'asset.zip', url: 'http://fake/url/asset.zip', size, sha256: sha } ] }
    ]
  };
  idx.helpers.forgeClient.getModDetail = async (apiKey, idOrSlug) => {
    assert(apiKey, 'expected apiKey present');
    assert(idOrSlug === 'testmod' || idOrSlug === 1, 'expected idOrSlug forwarded');
    return fakeDetail;
  };

  // run downloadVerifyAndImport using idOrSlug 'testmod' and assetUrl
  const res = await idx.helpers.downloadVerifyAndImport(api, 'testmod', 'http://fake/url/asset.zip', { replace: 'add' });
  assert(res && res.success, 'Expected success from downloadVerifyAndImport');

  // Now test checksum mismatch causes failure
  idx.helpers.downloadAsset = async function (url, dest) {
    await fsPromises.writeFile(dest, 'corrupted-content');
    return true;
  };

  let threw = false;
  try {
    await idx.helpers.downloadVerifyAndImport(api, 'testmod', 'http://fake/url/asset.zip', { replace: 'add' });
  } catch (e) {
    threw = true;
    assert(/checksum-mismatch|size-mismatch/.test(String(e.message)), 'Expected verification error');
  }
  assert(threw, 'Expected downloadVerifyAndImport to throw on mismatch');

  // restore
  idx.helpers.downloadAsset = originalDownload;

  // cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('download-verify.integration.test.js OK');
}

if (require.main === module) test();
module.exports = test;