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
