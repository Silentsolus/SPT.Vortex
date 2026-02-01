const assert = require('assert');
const idx = require('../index.js');

async function test() {
  const registered = [];

  const fakeContext = {
    registerReducer: (path, fn) => { registered.push({ type: 'reducer', path }); },
    registerGame: (g) => { registered.push({ type: 'game', id: g.id }); },
    registerAction: (group, id, icon, opts, label, fn) => {
      registered.push({ type: 'action', group, id, label, fn });
    },
    api: {
      store: {
        getState: () => ({ settings: {}, persistent: { mods: {} } }),
        dispatch: () => {},
      },
      showDialog: async () => ({ action: 'Cancel' }),
      sendNotification: () => {},
      showNotification: () => {},
      showErrorNotification: () => {},
    },
  };

  const res = await idx(fakeContext);
  assert(res === true, 'main should return true');

  const actions = registered.filter((r) => r.type === 'action').map((a) => a.label);
  // Expect key actions to be registered
  assert(actions.includes('Forge: Enrich'), 'Forge: Enrich should be registered');
  assert(actions.includes('Forge: Check Updates'), 'Forge: Check Updates should be registered');
  assert(actions.includes('Forge: Diagnose mod'), 'Forge: Diagnose mod should be registered');

  console.log('smoke.integration.test.js OK');
}

if (require.main === module) test();
module.exports = test;
