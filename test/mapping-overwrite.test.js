const assert = require('assert');
const idx = require('../index.js');

async function test() {
  const actions = [];
  const state = {
    settings: { mods: { stagingPath: { eftsptaki: '/fake/staging' } }, sptvortex: { forgeApiKey: 'fakekey', sptVersion: '4.0.11' } },
    persistent: { mods: { eftsptaki: { dynmod: { id: 'dynmod', attributes: { name: 'DynamicMaps-1.0.5' } } } } }
  };

  const api = {
    store: { getState: () => state, dispatch: (a) => { actions.push(a); } },
    showDialog: async () => ({ action: 'OK' }),
    sendNotification: () => {},
    showNotification: () => {}
  };

  // Create a temporary staging dir with our stage folder so listDirsOnce will find it
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-test-'));
  const stageDir = path.join(tmp, 'DynamicMaps-1.0.5');
  fs.mkdirSync(stageDir, { recursive: true });
  state.settings.mods.stagingPath.eftsptaki = tmp;

  // Create a fake DLL that yields a candidate GUID 'com.unknown.foo' (this will be the candidateGuid)
  const dllDir = path.join(stageDir, 'BepInEx', 'plugins');
  fs.mkdirSync(dllDir, { recursive: true });
  fs.writeFileSync(path.join(dllDir, 'Test.dll'), 'BepInPlugin("com.unknown.foo","Unknown","1.2.3")', 'latin1');

  // Stub mapping to return a mapping hit for the stage (mapping target is actual known GUID)
  const originalFindMapping = idx.helpers.findMappingForMeta;
  idx.helpers.findMappingForMeta = () => ({ target: 'com.mpstark.dynamicmaps', targetType: 'guid' });
  // Stub forge lookups: return nothing for the candidate 'com.unknown.foo', but return a mod for the mapping GUID
  const originalForgeGet = idx.helpers.forgeClient.getModByGuid;
  idx.helpers.forgeClient.getModByGuid = async (apiKey, guid) => {
    if (guid === 'com.mpstark.dynamicmaps') return { id: 123, guid: 'com.mpstark.dynamicmaps', slug: 'dynamicmaps', name: 'Dynamic Maps', owner: { name: 'mpstark' }, teaser: 'desc' };
    if (guid === 'com.unknown.foo') return null;
    return null;
  };

  // Stub listDirsOnce so the staging dir contains our stage name
  const originalListDirs = idx.helpers.listDirsOnce;
  idx.helpers.listDirsOnce = async () => ['DynamicMaps-1.0.5'];

  try {
    await idx.helpers.enrichMods(api);

    const setAttrs = actions.filter(a => a && a.type === 'SET_MOD_ATTRIBUTE');
    assert(setAttrs.length > 0, 'Expected at least one setModAttribute to be dispatched');
    const hasForgeGuid = setAttrs.some(a => a.payload && a.payload.key === 'forgeGuid' && a.payload.value === 'com.mpstark.dynamicmaps');
    assert(hasForgeGuid, 'Expected forgeGuid to be set from mapping target');

    console.log('mapping-overwrite.test.js OK');
  } finally {
    idx.helpers.findMappingForMeta = originalFindMapping;
    idx.helpers.forgeClient.getModByGuid = originalForgeGet;
    idx.helpers.listDirsOnce = originalListDirs;
    // Cleanup temporary staging
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) test();
module.exports = test;