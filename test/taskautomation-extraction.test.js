const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const idx = require('../index.js');

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-test-'));
  const stageDir = path.join(tmp, 'TaskAutomation-1.2.3');
  fs.mkdirSync(path.join(stageDir, 'BepInEx', 'plugins'), { recursive: true });
  const dllPath = path.join(stageDir, 'BepInEx', 'plugins', 'TaskAutomation.dll');
  // emulate embedded com.KnotScripts.TaskAutomation with nulls
  const awkward = 'xx\u0000com\u0000.KnotScripts\u0000.TaskAutomation\u0000 1.2.3';
  fs.writeFileSync(dllPath, awkward, 'latin1');

  const actions = [];
  const state = {
    settings: { mods: { stagingPath: { eftsptaki: tmp } }, sptvortex: { forgeApiKey: 'fakekey', sptVersion: '4.0.11' } },
    persistent: { mods: { eftsptaki: { ta: { id: 'ta', attributes: { name: 'TaskAutomation-1.2.3' } } } } }
  };

  const api = {
    store: { getState: () => state, dispatch: (a) => { actions.push(a); } },
    showDialog: async () => ({ action: 'OK' }),
    sendNotification: () => {},
    showNotification: () => {}
  };

  const originalForgeGet = idx.helpers.forgeClient.getModByGuid;
  idx.helpers.forgeClient.getModByGuid = async (apiKey, guid) => {
    if (guid === 'com.knotscripts.taskautomation') return { id: 555, guid: 'com.knotscripts.taskautomation', slug: 'taskautomation', name: 'Task Automation', owner: { name: 'KnotScripts' }, teaser: 'desc' };
    return null;
  };

  try {
    await idx.helpers.enrichMods(api);
    const setAttrs = actions.filter(a => a && a.type === 'SET_MOD_ATTRIBUTE');
    assert(setAttrs.length > 0, 'Expected attributes to be set');
    const hasForgeGuid = setAttrs.some(a => a.payload && a.payload.key === 'forgeGuid' && a.payload.value === 'com.knotscripts.taskautomation');
    assert(hasForgeGuid, 'Expected forgeGuid attribute to be set for TaskAutomation');
    console.log('taskautomation-extraction.test.js OK');
  } finally {
    idx.helpers.forgeClient.getModByGuid = originalForgeGet;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) test();
module.exports = test;