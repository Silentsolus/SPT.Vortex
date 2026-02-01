const assert = require('assert');
const idx = require('../index.js');

async function test() {
  const registered = [];

  let shown = null;

  const fakeContext = {
    registerReducer: (path, fn) => { registered.push({ type: 'reducer', path }); },
    registerGame: (g) => { registered.push({ type: 'game', id: g.id }); },
    registerAction: (group, id, icon, opts, label, fn) => {
      registered.push({ type: 'action', group, id, label, fn });
    },
    api: {
      store: { getState: () => ({ settings: {}, persistent: { mods: {} } }), dispatch: () => {} },
      showDialog: async (type, title, opts) => {
        // First dialog (question) -> return Fetch
        if (type === 'question' && title === 'SPT Forge: Fetch mod detail') return { action: 'Fetch', input: { g: 'com.example.mod' } };
        // Info dialog -> capture text
        if (type === 'info' && title === 'SPT Forge: Mod detail') { shown = opts && opts.text; return { action: 'OK' }; }
        return { action: 'Cancel' };
      },
      sendNotification: () => {},
      showNotification: () => {},
      showErrorNotification: () => {},
    },
  };

  // Ensure we can stub the helper
  const original = idx.helpers && idx.helpers.forgeGetModDetail;
  idx.helpers = idx.helpers || {};
  idx.helpers.forgeGetModDetail = async (apiKey, idOrSlug) => ({ name: 'Example Mod', guid: 'com.example.mod', id: 123, slug: 'example-mod', teaser: 'hi', versions: [{ version: '1.2.3' }], releases: [{ name: 'release.zip' }] });

  const res = await idx(fakeContext);
  assert(res === true, 'main should return true');

  const actions = registered.filter((r) => r.type === 'action');
  const act = actions.find(a => a.label === 'Forge: Fetch mod detail');
  assert(act, 'Fetch mod detail action should be registered');

  // invoke action
  await act.fn();

  assert(shown, 'Info dialog should be shown');
  assert(shown.includes('Name: Example Mod'), 'Dialog should include name');
  assert(shown.includes('GUID: com.example.mod'), 'Dialog should include GUID');

  // restore
  idx.helpers.forgeGetModDetail = original;

  console.log('fetch-mod-detail.action.test.js OK');
}

if (require.main === module) test();
module.exports = test;