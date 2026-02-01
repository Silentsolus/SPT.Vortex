const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchJson(url) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'SPT.Vortex/1.0' };
    const apiKey = process.env.FORGE_API_KEY || process.env.FORGE_API_TOKEN;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: true, parsed, raw: data, statusCode: res.statusCode });
        } catch (e) {
          resolve({ ok: false, parsed: null, raw: data, error: e.message, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, parsed: null, raw: null, error: err.message });
    });
  });
}

(async function main(){
  const repoRoot = path.resolve(__dirname, '..');
  const artifactsPath = path.join(repoRoot, 'artifacts', 'forge-responses.json');
  if (!fs.existsSync(artifactsPath)) {
    console.error('artifacts/forge-responses.json not found. Run the parser first.');
    process.exit(2);
  }

  const data = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
  const bases = [
    'https://forge.sp-tarkov.com/api/v0/mods?query=Tyfon.%20UIFixes&filter[spt_version]=4.0.11&include=versions,source_code_links',
    'https://forge.sp-tarkov.com/api/v0/mods?query=Task%20Automation&filter[spt_version]=4.0.11&include=versions,source_code_links'
  ];

  const backupPath = artifactsPath + '.bak.' + Date.now();
  fs.copyFileSync(artifactsPath, backupPath);
  console.log('Created backup:', backupPath);

  let updated = 0;
  for (const base of bases) {
    console.log('\nFetching:', base);
    const res = await fetchJson(base);
    if (!res.ok) {
      console.error('Fetch failed for', base, 'error:', res.error);
      continue;
    }

    // Find key in data that matches base (keys may include trailing ':')
    const key = Object.keys(data).find(k => k === base + ':' || k === base || k.startsWith(base));
    if (!key) {
      console.log('No existing entry for exact base; creating new key for', base);
      data[base + ':'] = [res.parsed];
      updated++;
      continue;
    }

    // Replace truncated entries with fetched parsed response, or append if none
    const arr = data[key] || [];
    let replaced = 0;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      const isTrunc = item && (item.truncated || (item.raw && String(item.raw).includes('... (truncated)')));
      if (isTrunc) {
        arr[i] = res.parsed;
        replaced++;
      }
    }
    if (replaced === 0) {
      arr.push(res.parsed);
      console.log('Appended new response to', key);
    } else {
      console.log('Replaced', replaced, 'truncated entries for', key);
    }
    data[key] = arr;
    updated++;
  }

  if (updated > 0) {
    fs.writeFileSync(artifactsPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('\nUpdated artifacts/forge-responses.json (updated ' + updated + ' keys)');
  } else {
    console.log('\nNo updates applied.');
  }
})();