const assert = require('assert');
const idx = require('../index.js');
const os = require('os');
const fs = require('fs');
const path = require('path');

async function test() {
  // Setup staging & mod
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-test-'));
  const staging = tmp;
  const stageName = 'StartCollectorEarly';
  const modFolder = path.join(staging, stageName);
  fs.mkdirSync(path.join(modFolder, 'SPT', 'user', 'mods', 'StartCollectorEarly'), { recursive: true });
  fs.writeFileSync(path.join(modFolder, 'SPT', 'user', 'mods', 'StartCollectorEarly', 'StartCollectorEarly.dll'), 'binarydata', 'latin1');

  const actions = [];
  const state = {
    settings: { mods: { stagingPath: { eftsptaki: staging } }, sptvortex: { forgeApiKey: 'fakekey' } },
    persistent: { mods: { eftsptaki: { mod1: { id: 'mod1', attributes: { name: stageName } } } } }
  };

  const api = { store: { getState: () => state, dispatch: (a) => actions.push(a) }, showDialog: async () => ({ action: 'OK' }), sendNotification: () => {}, showNotification: () => {} };

  // Make searchWithTerms return a result missing guid but with id
  const originalSearch = idx.helpers.forgeClient.fuzzySearch;
  idx.helpers.forgeClient.fuzzySearch = async (apiKey, term) => {
    return [{ id: 77, slug: 'start-collector-early', name: 'Start Collector Early' }];
  };

  // Stub detail lookup to return full mod with guid
  const originalGetDetail = idx.helpers.forgeGetModDetail;
  idx.helpers.forgeGetModDetail = async (apiKey, idOrSlug) => {
    return { id: 77, guid: 'com.mattdokn.startcollectorearly', slug: 'start-collector-early', name: 'Start Collector Early' };
  };

  try {
    await idx.helpers.enrichMods(api);
    const setAttrs = actions.filter(a => a && a.type === 'SET_MOD_ATTRIBUTE');
    const has = setAttrs.some(a => a.payload && a.payload.key === 'forgeGuid' && a.payload.value === 'com.mattdokn.startcollectorearly');
    console.log('Dispatched attrs:', setAttrs.length);
    assert(has, 'Expected detail-fallback to set forgeGuid');
    console.log('search-detail-fallback.test.js OK');
  } finally {
    idx.helpers.forgeClient.fuzzySearch = originalSearch;
    idx.helpers.forgeGetModDetail = originalGetDetail;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) test();
module.exports = test;