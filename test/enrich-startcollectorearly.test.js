const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const idx = require('../index.js');

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-enrich-'));
  const staging = tmp;
  const stageName = 'StartCollectorEarly';
  const modFolder = path.join(staging, stageName);
  fs.mkdirSync(path.join(modFolder, 'SPT', 'user', 'mods', 'StartCollectorEarly'), { recursive: true });
  // Create DLL with no BepInPlugin (so fallback basename should be used)
  fs.writeFileSync(path.join(modFolder, 'SPT', 'user', 'mods', 'StartCollectorEarly', 'StartCollectorEarly.dll'), 'binarydata', 'latin1');

  // Mock Vortex api and store
  const actions = [];
  const state = {
    settings: {
      mods: { stagingPath: { eftsptaki: staging } },
      sptvortex: {}
    },
    persistent: {
      mods: {
        eftsptaki: {
          mod1: { id: 'mod1', attributes: { name: stageName } }
        }
      }
    }
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

  // Stub fuzzySearch to return the StartCollectorEarly mod when searching 'Start Collector Early'
  const originalFuzzy = idx.helpers.forgeClient.fuzzySearch;
  idx.helpers.forgeClient.fuzzySearch = async (apiKey, term) => {
    if (/start\s*collector\s*early/i.test(term) || /startcollectorearly/i.test(term)) {
      return [{ id: 77, guid: 'com.mattdokn.startcollectorearly', slug: 'start-collector-early', name: 'Start Collector Early', owner: { name: 'mattdokn' } }];
    }
    return [];
  };

  state.settings.sptvortex = { forgeApiKey: 'fakekey', sptVersion: '4.0.11' };

  try {
    await idx.helpers.enrichMods(api);

    const setAttrs = actions.filter(a => a && a.type === 'SET_MOD_ATTRIBUTE');
    const hasSC = setAttrs.some(a => a.payload && a.payload.key === 'forgeGuid' && a.payload.value === 'com.mattdokn.startcollectorearly');
    console.log('Dispatched attrs count:', setAttrs.length);
    assert(hasSC, 'Expected StartCollectorEarly to be matched to com.mattdokn.startcollectorearly');

    console.log('enrich-startcollectorearly.test.js OK');
  } finally {
    idx.helpers.forgeClient.fuzzySearch = originalFuzzy;
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) test();
module.exports = test;