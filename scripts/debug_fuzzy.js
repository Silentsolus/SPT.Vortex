// Local debug script: node scripts/debug_fuzzy.js <term>
// Requires FORGE_API_KEY env var or edit the script to set it.
const idx = require('../index.js');
const apiKey = process.env.FORGE_API_KEY || (process.env.FORGE_API_KEY_TEST || null);
if (!apiKey) {
  console.error('Missing FORGE_API_KEY env var');
  process.exit(2);
}
const term = process.argv[2];
if (!term) {
  console.error('Usage: node scripts/debug_fuzzy.js <term>');
  process.exit(2);
}
(async () => {
  console.log('Searching for term:', term);
  try {
    const res = await idx.helpers.forgeClient.fuzzySearch(apiKey, term);
    console.log('Result count:', Array.isArray(res) ? res.length : 'not-array');
    if (Array.isArray(res)) {
      for (let i = 0; i < Math.min(res.length, 10); i++) {
        const r = res[i];
        console.log(i + 1, r.guid, r.slug, r.name, `id=${r.id}`);
      }
    } else {
      console.log('Response:', res);
    }
  } catch (e) {
    console.error('Search failed:', e && e.message ? e.message : String(e));
    process.exit(2);
  }
})();