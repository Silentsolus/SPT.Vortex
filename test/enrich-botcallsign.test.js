const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const idx = require('../index.js');

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-enrich-'));
  const staging = tmp;
  const stageName = 'BotCallsigns_v2.0.3';
  const modFolder = path.join(staging, stageName);
  fs.mkdirSync(path.join(modFolder, 'BepInEx', 'plugins'), { recursive: true });
  // Create DLL with nothing useful
  fs.writeFileSync(path.join(modFolder, 'BepInEx', 'plugins', 'BotCallsigns.dll'), 'binarydata', 'latin1');

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

  // Stub fuzzySearch to return a match only for the split 'Bot Callsigns' term (simulate API behavior)
  const originalFuzzy = idx.helpers.forgeClient.fuzzySearch;
  idx.helpers.forgeClient.fuzzySearch = async (apiKey, term) => {
    if (/bot\s*callsigns/i.test(term) || /botcallsigns/i.test(term)) {
      return [ { id: 2, guid: 'com.harmonyzt.botcallsigns', slug: 'botcallsigns', name: 'Bot Callsigns' } ];
    }
    return [];
  };

  // Add forge key
  state.settings.sptvortex = { forgeApiKey: 'fakekey', sptVersion: '4.0.11' };

  await idx.helpers.enrichMods(api);

  const setAttrs = actions.filter(a => a && a.type === 'SET_MOD_ATTRIBUTE');
  const hasBot = setAttrs.some(a => a.payload && a.payload.key === 'forgeGuid' && a.payload.value === 'com.harmonyzt.botcallsigns');
  console.log('Dispatched attrs count:', setAttrs.length);
  assert(hasBot, 'Expected BotCallsigns to be matched to com.harmonyzt.botcallsigns');

  try { fs.rmSync(staging, { recursive: true, force: true }); } catch (e) {}

  console.log('enrich-botcallsign.test.js OK');
}

if (require.main === module) test();
module.exports = test;