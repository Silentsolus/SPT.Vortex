const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const idx = require('../index.js');

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-enrich-'));
  const staging = tmp;
  const stageName = 'Croupier_2_0_4';
  const modFolder = path.join(staging, stageName);
  fs.mkdirSync(path.join(modFolder, 'BepInEx', 'plugins'), { recursive: true });
  // Create DLL with no identifying GUIDs (empty)
  fs.writeFileSync(path.join(modFolder, 'BepInEx', 'plugins', 'Croupier.dll'), 'random binary content', 'latin1');

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

  // Stub fuzzySearch to return an incorrect candidate and the correct Croupier candidate
  idx.helpers.forgeClient.fuzzySearch = async (apiKey, term) => {
    // Return both; the algorithm should pick the Croupier item due to better fuzzy on 'croupier 2.0.4' term or version boost
    return [
      { id: 1, guid: 'com.tame.ags30', slug: 'tame-ags-30', name: 'Tame AGS-30', owner: { name: 'Author' } },
      { id: 2, guid: 'com.turbodestroyer.croupier', slug: 'croupier', name: 'Croupier', owner: { name: 'TurboDestroyer' } }
    ];
  };

  // Ensure a forge API key is present
  state.settings.sptvortex = { forgeApiKey: 'fakekey', sptVersion: '4.0.11' };

  await idx.helpers.enrichMods(api);

  const setAttrs = actions.filter(a => a && a.type === 'SET_MOD_ATTRIBUTE');
  const hasCroupier = setAttrs.some(a => a.payload && a.payload.key === 'forgeGuid' && a.payload.value === 'com.turbodestroyer.croupier');
  console.log('Dispatched attrs count:', setAttrs.length);
  assert(hasCroupier, 'Expected Croupier to be matched to com.turbodestroyer.croupier');

  try { fs.rmSync(staging, { recursive: true, force: true }); } catch (e) {}

  console.log('enrich-versioned-match.test.js OK');
}

if (require.main === module) test();
module.exports = test;