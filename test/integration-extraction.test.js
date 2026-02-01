const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const idx = require('../index.js');
const { extractForgeMetaFromStagedFolder, extractFromDll } = idx.helpers;

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-test-'));
  const modFolder = path.join(tmp, 'TestMod');
  fs.mkdirSync(modFolder, { recursive: true });

  // Create a fake DLL with BepInPlugin attribute
  const dllDir = path.join(modFolder, 'BepInEx', 'plugins');
  fs.mkdirSync(dllDir, { recursive: true });
  const dllPath = path.join(dllDir, 'TestMod.dll');
  const dllContent = 'Some binary data\nBepInPlugin("com.example.testmod","Test Mod","2.3.4")\nmore data';
  fs.writeFileSync(dllPath, dllContent, 'latin1');

  // Also create a server package.json to ensure it doesn't interfere
  const pkgDir = path.join(modFolder, 'SPT', 'user', 'mods', 'TestModServer');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'TestModServer', version: '0.9.0' }), 'utf8');

  // First, call extractFromDll directly to isolate parsing logic
  const dllInfo = await extractFromDll(dllPath);
  console.log('DLL info:', dllInfo);
  assert(dllInfo.guid === 'com.example.testmod', 'Expected GUID from DLL via extractFromDll');
  assert(dllInfo.version === '2.3.4', 'Expected version from DLL via extractFromDll');
  assert(dllInfo.displayName && dllInfo.displayName.includes('Test Mod'));

  // Now create a fake DLL that contains multiple tokens including a slug-like guid (me.sol.sain) and other com.* guids
  const dllPath2 = path.join(dllDir, 'SAIN.dll');
  const weird = '... AllowMultiple \u0001\u000Bme.sol.sain\u0004SAIN\u00054.3.1 ... com.dvize.BushNoESP ...';
  fs.writeFileSync(dllPath2, weird, 'latin1');

  const dllInfo2 = await extractFromDll(dllPath2);
  console.log('DLL info 2:', dllInfo2);
  assert(dllInfo2.guid === 'me.sol.sain', 'Expected to extract slug GUID me.sol.sain from weird DLL');
  assert(dllInfo2.version === '4.3.1', 'Expected to extract version 4.3.1 from weird DLL');

  // Should ignore pure version-like tokens when extracting GUIDs
  const dllPath3 = path.join(dllDir, 'VersionOnly.dll');
  fs.writeFileSync(dllPath3, 'Some text v4.7.1 another token 4.7.1', 'latin1');
  const dllInfo3 = await extractFromDll(dllPath3);
  console.log('DLL info 3:', dllInfo3);
  assert(dllInfo3.guid === null, 'Expected to not treat v4.7.1 as a GUID');

  // Validate we can extract a com.* GUID even when segments include nulls and uppercase letters
  const dllPath4 = path.join(dllDir, 'TaskAutomation.dll');
  // Insert com.KnotScripts.TaskAutomation with interleaved nulls to simulate binary embedding
  const awkward = 'prefix\u0000com\u0000.KnotScripts\u0000.TaskAutomation\u0000suffix 1.2.3';
  fs.writeFileSync(dllPath4, awkward, 'latin1');
  const dllInfo4 = await extractFromDll(dllPath4);
  console.log('DLL info 4:', dllInfo4);
  assert(dllInfo4.guid && dllInfo4.guid.includes('knotscripts.taskautomation'), 'Expected to extract com.KnotScripts.TaskAutomation (normalized) from awkward DLL');

  const meta = await extractForgeMetaFromStagedFolder(modFolder, 'TestMod');
  console.log('Extracted meta:', meta);

  // Now assert that the overall folder extraction uses the DLL evidence
  assert(meta.guid === 'com.example.testmod', 'Expected GUID from DLL in folder extraction');
  assert(meta.version === '2.3.4', 'Expected version from DLL in folder extraction');
  assert(meta.displayName && meta.displayName.includes('Test Mod'));

  // Mock a Forge lookup by replacing forgeGetModByGuid temporarily if available
  const originalForgeGet = idx.helpers.forgeGetModByGuid;
  try {
    const fakeMod = { id: 999, guid: 'com.example.testmod', slug: 'testmod', name: 'Test Mod', owner: { name: 'Author' } };
    // If forgeGetModByGuid is a function, replace it for this test
    if (typeof originalForgeGet === 'function') {
      idx.helpers.forgeGetModByGuid = async (apiKey, guid) => {
        assert(guid === 'com.example.testmod');
        return fakeMod;
      };

      const got = await idx.helpers.forgeGetModByGuid('fakekey', 'com.example.testmod');
      assert(got && got.id === 999 && got.guid === 'com.example.testmod');
    }

    console.log('integration-extraction.test.js OK');
  } finally {
    // Restore if we changed it
    if (typeof originalForgeGet === 'function') {
      idx.helpers.forgeGetModByGuid = originalForgeGet;
    }

    // Cleanup
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) test();
module.exports = test;
