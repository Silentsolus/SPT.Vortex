const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const idx = require('../index.js');
const { extractForgeMetaFromStagedFolder } = idx.helpers;

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-enrich-'));
  const staging = tmp;
  const stageName = 'TestMod';
  const modFolder = path.join(staging, stageName);
  fs.mkdirSync(path.join(modFolder, 'BepInEx', 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(modFolder, 'BepInEx', 'plugins', 'TestMod.dll'), 'BepInPlugin("com.example.testmod","Test Mod","1.0.0")', 'latin1');

  // Mock Vortex api and store
  const actions = [];
  const state = {
    settings: {
      mods: {
        stagingPath: { eftsptaki: staging }
      }
    },
    sptvortex: {},
    persistent: {
      mods: {
        eftsptaki: {
          mod1: { id: 'mod1', attributes: { name: 'TestMod' } }
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

  // Stub forge client to return a match for our GUID
  const fakeMod = { id: 42, guid: 'com.example.testmod', slug: 'testmod', name: 'Test Mod', owner: { name: 'Author' }, thumbnail: 'http://example.com/thumb.png', teaser: 'desc' };
  idx.helpers.forgeClient.getModByGuid = async (apiKey, guid) => {
    assert(guid === 'com.example.testmod');
    return fakeMod;
  };
  // Ensure fuzzy returns nothing to force GUID path
  idx.helpers.forgeClient.fuzzySearch = async () => [];

  // Ensure a forge API key is present in settings path used by getForgeConfig
  state.settings.sptvortex = { forgeApiKey: 'fakekey', sptVersion: '4.0.11' };

  // Run enrichment
  await idx.helpers.enrichMods(api);

  // Check that dispatch was called to set attributes for mod1
  const setAttrs = actions.filter(a => a && a.type === 'SET_MOD_ATTRIBUTE');
  console.log('Dispatched actions:', setAttrs);

  assert(setAttrs.length > 0, 'Expected setModAttribute to be dispatched');
  const hasForgeGuid = setAttrs.some(a => a.payload && a.payload.key === 'forgeGuid' && a.payload.value === 'com.example.testmod');
  const hasForgeId = setAttrs.some(a => a.payload && a.payload.key === 'forgeId' && String(a.payload.value) === String(fakeMod.id));
  assert(hasForgeGuid, 'Expected forgeGuid attribute to be set');
  assert(hasForgeId, 'Expected forgeId attribute to be set');

  // Cleanup
  try { fs.rmSync(staging, { recursive: true, force: true }); } catch (e) {}

  console.log('enrich.integration.test.js OK');
}

if (require.main === module) test();
module.exports = test;