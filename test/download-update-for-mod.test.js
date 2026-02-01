const assert = require('assert');
const idx = require('../index.js');
const helpers = idx.helpers;

async function test() {
  const origGetModDetail = helpers.forgeClient.getModDetail;
  const origDownloadVerifyAndImport = helpers.downloadVerifyAndImport;
  try {
    // stub detail
    helpers.forgeClient.getModDetail = async (apiKey, idOrSlug) => ({ releases: [ { assets: [ { url: 'http://example.com/my.mod.zip', name: 'my.mod.zip', size: 1234 } ] } ], id: idOrSlug });
    let called = false;
    helpers.downloadVerifyAndImport = async (api, idOrSlug, assetUrl, options) => { called = true; return { success: true }; };

    const fakeApi = { store: { getState: () => ({ settings: { sptvortex: { forgeApiKey: 'fakekey' } } }), dispatch: () => {} }, sendNotification: () => {} };
    const r = await helpers.downloadUpdateForMod(fakeApi, 'com.example.some', { replace: 'add' });
    assert(called, 'Expected downloadVerifyAndImport to be called');

    console.log('download-update-for-mod.test.js OK');
  } finally {
    helpers.forgeClient.getModDetail = origGetModDetail;
    helpers.downloadVerifyAndImport = origDownloadVerifyAndImport;
  }
}

if (require.main === module) test();
module.exports = test;