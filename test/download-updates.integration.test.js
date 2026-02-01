const assert = require('assert');
const idx = require('../index.js');
const helpers = idx.helpers;

async function test() {
  // Stubs
  const origGetUpdates = helpers.forgeClient.getUpdates;
  const origGetModDetail = helpers.forgeClient.getModDetail;
  const origDownloadVerifyAndImport = helpers.downloadVerifyAndImport;

  try {
    // Mock updates response
    helpers.forgeClient.getUpdates = async (apiKey, sptVersion, list) => ({ ok: true, json: { success: true, data: { updates: [ { guid: 'com.example.mod1', name: 'Mod1', current_version: '1.0', latest_version: '1.1', mod: { id: 111 } }, { guid: 'com.example.mod2', name: 'Mod2', current_version: '2.0', latest_version: '2.1', mod: { id: 222 } } ] } } });

    // Mock mod details to include assets
    helpers.forgeClient.getModDetail = async (apiKey, idOrSlug) => ({ releases: [ { assets: [ { url: 'http://example.com/mod1.zip', name: 'mod1.zip', size: 12345 } ] } ], id: idOrSlug });

    let calls = [];
    helpers.downloadVerifyAndImport = async (api, idOrSlug, assetUrl, options) => { calls.push({ idOrSlug, assetUrl, options }); return { success: true }; };

    // Create a fake api object with minimal required methods
    const fakeApi = {
      store: { getState: () => ({ settings: { sptvortex: { forgeApiKey: 'fakekey', sptVersion: '4.0.11' } } }), dispatch: () => {} },
      showDialog: async () => ({ action: 'Download All (Add)' }),
      sendNotification: () => {}
    };

    // Provide a fake mods list to the updater
    const fakeModsList = [ { attributes: { forgeGuid: 'com.example.mod1', version: '1.0' } }, { attributes: { forgeGuid: 'com.example.mod2', version: '2.0' } } ];
    // Run the updater
    await helpers.downloadAndImportUpdates(fakeApi, { replace: 'add', modsList: fakeModsList });

    assert(calls.length === 2, 'Expected two download/import calls');
    assert(calls[0].assetUrl === 'http://example.com/mod1.zip');

    console.log('download-updates.integration.test.js OK');
  } finally {
    helpers.forgeClient.getUpdates = origGetUpdates;
    helpers.forgeClient.getModDetail = origGetModDetail;
    helpers.downloadVerifyAndImport = origDownloadVerifyAndImport;
  }
}

if (require.main === module) test();
module.exports = test;