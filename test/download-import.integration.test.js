const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const idx = require('../index.js');

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-download-import-'));
  const staging = tmp;
  const sampleFile = path.join(tmp, 'sample-asset.zip');
  fs.writeFileSync(sampleFile, 'fake-zip-content');

  // Mock Vortex api and store (no importArchive hook -> fallback copy)
  const actions = [];
  const state = {
    settings: {
      mods: {
        stagingPath: { eftsptaki: staging }
      }
    },
    sptvortex: {},
    persistent: { mods: {} }
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

  // 1) Fallback copy behavior
  const res1 = await idx.helpers.importDownloadedArchive(api, sampleFile, { replace: 'add' });
  assert(res1 && res1.success === true, 'Expected success result from importDownloadedArchive');
  assert(res1.importedTo && typeof res1.importedTo === 'string');
  const exists = fs.existsSync(res1.importedTo);
  assert(exists, 'Expected copied file to exist');
  const content = fs.readFileSync(res1.importedTo, 'utf8');
  assert(content === 'fake-zip-content', 'Copied file content must match original');

  // 2) If api.importArchive exists, it should be used
  const apiWithImport = Object.assign({}, api, {
    importArchive: async (filePath, opts) => ({ imported: true, file: filePath, opts })
  });

  const res2 = await idx.helpers.importDownloadedArchive(apiWithImport, sampleFile, { replace: 'overwrite' });
  assert(res2 && res2.success === true && res2.method === 'importArchive', 'Expected importArchive to be used');
  assert(res2.result && res2.result.imported === true, 'Expected importArchive result to be returned');

  // 2b) support api.importArchiveForGame signature
  const apiWithImportGame = Object.assign({}, api, {
    importArchiveForGame: async (filePath, gameId, opts) => ({ imported: true, file: filePath, game: gameId, opts })
  });

  const res2b = await idx.helpers.importDownloadedArchive(apiWithImportGame, sampleFile, { replace: 'overwrite' });
  assert(res2b && res2b.success === true && res2b.method === 'importArchiveForGame', 'Expected importArchiveForGame to be used');
  assert(res2b.result && res2b.result.game === 'eftsptaki', 'Expected game id to be forwarded');

  // 2c) support legacy installMod signature
  const apiWithInstall = Object.assign({}, api, {
    installMod: async (filePath, opts) => ({ installed: true, file: filePath, opts })
  });

  const res2c = await idx.helpers.importDownloadedArchive(apiWithInstall, sampleFile, { replace: 'overwrite' });
  assert(res2c && res2c.success === true && res2c.method === 'installMod', 'Expected installMod to be used');
  assert(res2c.result && res2c.result.installed === true, 'Expected installMod result to be returned');

  // 3) downloadAndImport should call downloadAsset then importDownloadedArchive
  // Stub downloadAsset to copy our sample file to the requested dest
  const originalDownload = idx.helpers.downloadAsset;
  idx.helpers.downloadAsset = async function (url, dest) {
    await fsPromises.copyFile(sampleFile, dest);
    return true;
  };

  const res3 = await idx.helpers.downloadAndImport(api, 'http://fake/url/asset.zip', { replace: 'add' });
  assert(res3 && res3.success === true, 'Expected downloadAndImport to succeed');
  assert(res3.importedTo && fs.existsSync(res3.importedTo), 'Expected imported file to exist');

  // restore
  idx.helpers.downloadAsset = originalDownload;

  // cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('download-import.integration.test.js OK');
}

if (require.main === module) test();
module.exports = test;
