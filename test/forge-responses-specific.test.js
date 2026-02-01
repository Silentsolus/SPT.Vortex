const assert = require('assert');
const fs = require('fs');
const path = require('path');
const helpers = require('../index.js').helpers;

function toSyntheticDetail(searchMod) {
  // Convert a search "mod" entry (with versions array) into a detail shape
  // that pickAssetFromModDetail can reasonably work with for tests.
  const versions = Array.isArray(searchMod.versions) ? searchMod.versions : [];
  const files = versions.map(v => ({ url: v.link, name: v.version || v.filename || '', size: v.content_length || 0 }));
  return { files };
}

function test() {
  const p = path.join(process.cwd(), 'artifacts', 'forge-responses.json');
  if (!fs.existsSync(p)) {
    console.log('No forge responses file found; run tools/parse-checkmods-log.js first. Skipping.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  // Targets we fetched and replaced earlier
  const targets = [
    'https://forge.sp-tarkov.com/api/v0/mods?query=Tyfon.%20UIFixes&filter[spt_version]=4.0.11&include=versions,source_code_links:',
    'https://forge.sp-tarkov.com/api/v0/mods?query=Task%20Automation&filter[spt_version]=4.0.11&include=versions,source_code_links:'
  ];

  let successfulSamples = 0;

  for (const url of targets) {
    const arr = data[url];
    assert(arr && arr.length, `Expected captured response for ${url}`);

    // Use first mod entry that has versions
    let mod = null;
    for (const r of arr) {
      // prefer 'successful' API responses
      if (r && r.success === true && Array.isArray(r.data) && r.data.length) { mod = r.data[0]; break; }
      if (r && Array.isArray(r.data) && r.data.length) { mod = r.data[0]; break; }
      if (Array.isArray(r) && r.length && r[0] && r[0].versions) { mod = r[0]; break; }
    }

    if (!mod) {
      // If response indicates unauthenticated or missing data, skip with a message
      const sample = JSON.stringify(arr[0] || {}, null, 2);
      console.log(`Skipping ${url}: no usable mod object found. Sample response: ${sample.slice(0,200)}`);
      continue;
    }

    const detail = toSyntheticDetail(mod);
    const cand = helpers.pickAssetFromModDetail ? helpers.pickAssetFromModDetail(detail) : null;
    if (cand && cand.url) {
      // Expect it to look like an archive URL (common extensions)
      const okExt = ['.zip', '.7z', '.rar', '.tar.gz', '.tar'];
      const lc = (cand.url || '').toLowerCase();
      const extMatch = okExt.some(e => lc.endsWith(e));
      assert(extMatch, `Candidate URL for ${mod.name || url} has unexpected extension: ${cand.url}`);
      console.log(`OK ${mod.name || url} -> ${cand.url}`);
      successfulSamples++;
    } else {
      console.log(`No candidate found for ${mod.name || url} (skipping)`);
    }
  }

  // As a fallback, scan all captured responses for at least one mod with versions -> link and assert on it
  const anyTargetUnauth = targets.every(t => {
    const arr = data[t];
    return Array.isArray(arr) && arr.some(a => a && a.success === false && a.code === 'UNAUTHENTICATED');
  });

  if (successfulSamples === 0 && !anyTargetUnauth) {
    // Try fallback scan only when not all targets are unauthenticated
    for (const k of Object.keys(data)) {
      for (const r of data[k]) {
        const candidateMod = (r && Array.isArray(r.data) && r.data.length && r.data[0]) ? r.data[0] : (Array.isArray(r) && r.length ? r[0] : null);
        if (!candidateMod) continue;
        if (!Array.isArray(candidateMod.versions) || !candidateMod.versions.length) continue;
        const detail = toSyntheticDetail(candidateMod);
        const cand = helpers.pickAssetFromModDetail ? helpers.pickAssetFromModDetail(detail) : null;
        if (cand && cand.url) {
          console.log(`Found fallback sample: ${candidateMod.name || k} -> ${cand.url}`);
          successfulSamples++;
          break;
        }
      }
      if (successfulSamples > 0) break;
    }
  }

  if (successfulSamples === 0 && anyTargetUnauth) {
    console.log('All targets unauthenticated; skipping assertions. Re-run after capturing authenticated responses.');
    return;
  }

  assert(successfulSamples > 0, 'Expected at least one captured mod to yield a candidate asset');

  console.log('forge-responses-specific.test.js OK');
}

if (require.main === module) test();
module.exports = test;
